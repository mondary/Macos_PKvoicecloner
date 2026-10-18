import { ensureCasting, suggestCasting } from './casting';
import { audio } from './engine';
import { library } from './storage';
import type { Book, Casting, Settings, Voice } from './types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const factor = (n: number) => `${n.toLocaleString('fr', { maximumFractionDigits: 2 })}×`;
type Show = (title: string, body: string) => void;

/** Edits a copy: dismissing the dialog never changes the book. */
export async function openCasting(book: Book, available: Voice[], settings: Settings, show: Show, refresh: () => void) {
  await audio.pause();
  const draft: Casting = structuredClone(ensureCasting(book));
  const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  const options = available.filter(v => v.kind !== 'clone' && v.installed);
  if (!options.some(v => v.id === 'system:default')) options.unshift({ id: 'system:default', name: 'Voix du téléphone', language: 'fr', kind: 'system', installed: true });
  let tab: 'roles' | 'passages' = 'roles';
  let chapter = Math.max(0, book.chapters.findIndex(c => book.position >= c.start && book.position < c.end));
  let first = Math.floor((book.position - book.chapters[chapter].start) / 20) * 20;
  first = Math.max(0, first);
  let preview = false;
  let busy = false;
  const editedBook = () => ({ ...book, casting: draft });
  const message = (text: string, invalid = false) => {
    const el = sheet.querySelector<HTMLElement>('#casting-status');
    if (el) { el.textContent = text; el.classList.toggle('error', invalid); }
  };
  const collect = () => {
    if (tab !== 'roles') return;
    draft.enabled = sheet.querySelector<HTMLInputElement>('#casting-enabled')?.checked ?? draft.enabled;
    for (const character of draft.characters) {
      const row = sheet.querySelector<HTMLElement>(`[data-character="${character.id}"]`);
      if (!row) continue;
      character.name = row.querySelector<HTMLInputElement>('[name="name"]')!.value.trim();
      character.voice = row.querySelector<HTMLSelectElement>('[name="voice"]')!.value;
      character.pitch = Number(row.querySelector<HTMLInputElement>('[name="pitch"]')!.value);
      character.rate = Number(row.querySelector<HTMLInputElement>('[name="rate"]')!.value);
    }
  };
  const voiceOptions = (selected: string) => `<option value="">Voix du lecteur</option>${!options.some(v => v.id === selected) && selected ? `<option value="${esc(selected)}">Voix indisponible — à remplacer</option>` : ''}${options.map(v => `<option value="${esc(v.id)}">${esc(v.name)}${v.network ? ' · connexion requise' : ''}</option>`).join('')}`;
  const roleOptions = () => draft.characters.map(c => `<option value="${c.id}">${esc(c.name || 'Sans nom')}</option>`).join('');
  const draw = () => {
    const c = book.chapters[chapter];
    const start = c.start + first;
    const end = Math.min(c.end, start + 20);
    show('Personnages & voix', `<div class="casting-editor"><p class="sheet-description">Une voix par personnage, directement sur ce téléphone. Piper fonctionne hors ligne après téléchargement. Une même voix peut jouer plusieurs rôles avec des pitchs différents.</p>
      <div class="segmented" role="group" aria-label="Configuration des personnages"><button type="button" data-cast="roles" aria-pressed="${tab === 'roles'}">Personnages</button><button type="button" data-cast="passages" aria-pressed="${tab === 'passages'}">Attribution des passages</button></div>
      ${tab === 'roles' ? `<label class="casting-enable"><input type="checkbox" id="casting-enabled" ${draft.enabled ? 'checked' : ''}> Activer les voix par personnage pour ce livre</label>
      <div class="casting-roles">${draft.characters.map((role, i) => `<fieldset data-character="${role.id}" class="casting-role"><legend>${role.id === 'narrator' ? 'Narration' : `Personnage ${i}`}</legend>
        <label for="cast-name-${i}">Nom</label><input id="cast-name-${i}" name="name" value="${esc(role.name)}" maxlength="60" required ${role.id === 'narrator' ? 'readonly' : ''}>
        <label for="cast-voice-${i}">Voix</label><select id="cast-voice-${i}" name="voice">${voiceOptions(role.voice)}</select>
        <label for="cast-pitch-${i}">Pitch · grave ← → aigu <output>${factor(role.pitch)}</output></label><input id="cast-pitch-${i}" name="pitch" type="range" min="0.5" max="2" step="0.01" value="${role.pitch}">
        <label for="cast-rate-${i}">Vitesse du personnage <output>${factor(role.rate)}</output></label><input id="cast-rate-${i}" name="rate" type="range" min="0.75" max="1.5" step="0.05" value="${role.rate}">
        <div class="casting-role-actions"><button type="button" data-cast="preview" data-id="${role.id}">Écouter un exemple</button><button type="button" data-cast="reset" data-id="${role.id}">Réinitialiser pitch et vitesse</button>${role.id !== 'narrator' ? `<button type="button" data-cast="remove" data-id="${role.id}">Retirer</button>` : ''}</div></fieldset>`).join('')}</div>
        <button type="button" class="setting-row" data-cast="add">+ Ajouter un personnage</button><p class="sheet-description">La vitesse du rôle se combine avec la vitesse générale du lecteur. Un pitch de 1,20 rend la voix plus aiguë ; 0,80 la rend plus grave.</p>` : `
        <label for="cast-chapter">Chapitre</label><select id="cast-chapter">${book.chapters.map((ch, i) => `<option value="${i}" ${i === chapter ? 'selected' : ''}>${esc(ch.title)}</option>`).join('')}</select>
        <p class="sheet-description">Choisissez qui parle pour chaque passage. Les passages sans attribution utilisent le narrateur. L’aide locale reconnaît les noms explicites (« Pierre : » ou « dit Pierre »), sans deviner les dialogues ambigus.</p>
        <button type="button" class="setting-row" data-cast="suggest">Proposer les attributions de ce chapitre</button>
        <div class="casting-passages">${book.segments.slice(start, end).map((text, offset) => `<div class="casting-passage"><p>${esc(text)}</p><label for="cast-segment-${start + offset}">Passage ${start + offset + 1} · personnage</label><select id="cast-segment-${start + offset}" data-segment="${start + offset}">${roleOptions()}</select></div>`).join('')}</div>
        <div class="casting-pagination"><button type="button" data-cast="prev" ${first <= 0 ? 'disabled' : ''}>Précédents</button><span>${first + 1}–${end - c.start} / ${c.end - c.start}</span><button type="button" data-cast="next" ${end >= c.end ? 'disabled' : ''}>Suivants</button></div>`}
      <p id="casting-status" role="status" aria-live="polite"></p><button type="button" class="primary casting-save" data-cast="save">Enregistrer pour ce livre</button></div>`);
    if (tab === 'roles') draft.characters.forEach((role, i) => { sheet.querySelector<HTMLSelectElement>(`#cast-voice-${i}`)!.value = role.voice; });
    else sheet.querySelectorAll<HTMLSelectElement>('[data-segment]').forEach(el => { el.value = draft.assignments[el.dataset.segment!] || 'narrator'; });
  };
  const onInput = (event: Event) => {
    const el = event.target as HTMLInputElement;
    if (!el.closest('.casting-editor')) return;
    if (el.type === 'range') {
      const output = sheet.querySelector(`label[for="${el.id}"] output`);
      if (output) output.textContent = factor(Number(el.value));
    }
  };
  const onChange = (event: Event) => {
    const el = event.target as HTMLSelectElement;
    if (el.dataset.segment) draft.assignments[el.dataset.segment] = el.value;
    if (el.id === 'cast-chapter') { chapter = Number(el.value); first = 0; draw(); }
  };
  const act = async (button: HTMLButtonElement) => {
    if (busy) return;
    collect();
    const id = button.dataset.id;
    const role = draft.characters.find(c => c.id === id);
    switch (button.dataset.cast) {
      case 'roles': tab = 'roles'; draw(); break;
      case 'passages': tab = 'passages'; draw(); break;
      case 'add': draft.characters.push({ id: crypto.randomUUID(), name: `Personnage ${draft.characters.length}`, voice: '', pitch: 1, rate: 1 }); draw(); sheet.querySelector<HTMLInputElement>('.casting-role:last-child input[name="name"]')?.focus(); break;
      case 'remove': draft.characters = draft.characters.filter(c => c.id !== id); Object.keys(draft.assignments).forEach(key => { if (draft.assignments[key] === id) draft.assignments[key] = 'narrator'; }); draw(); break;
      case 'reset': if (role) { role.pitch = 1; role.rate = 1; draw(); } break;
      case 'prev': first = Math.max(0, first - 20); draw(); break;
      case 'next': first += 20; draw(); break;
      case 'suggest': {
        const c = book.chapters[chapter]; const n = suggestCasting(editedBook(), c.start, c.end);
        draw(); message(`${n} attribution${n > 1 ? 's' : ''} proposée${n > 1 ? 's' : ''}. Les choix manuels sont conservés. Vérifiez les autres passages.`); break;
      }
      case 'preview': {
        if (!role) return;
        const demo: Book = { ...book, id: 'casting-preview', position: 0, segments: [`Bonjour, voici la voix de ${role.name || 'ce personnage'} dans cette histoire.`], casting: { enabled: true, characters: [role], assignments: { '0': role.id } } };
        await audio.load(demo, { ...settings, voice: settings.voice.startsWith('clone:') ? 'system:default' : settings.voice });
        preview = true; await audio.play(); message('Exemple en cours. Les réglages seront appliqués après enregistrement.'); break;
      }
      case 'save': {
        const names = draft.characters.map(c => c.name.toLocaleLowerCase());
        if (names.some(n => !n) || new Set(names).size !== names.length) { message('Donnez un nom différent à chaque personnage.', true); return; }
        busy = true; button.disabled = true;
        const previous = book.casting;
        try {
          book.casting = draft; await library.save(book);
          await audio.pause(); await audio.load(book, settings); preview = false;
          sheet.close(); refresh();
        } catch (error) { book.casting = previous; throw error; }
        finally { busy = false; button.disabled = false; }
        break;
      }
    }
  };
  const onClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-cast]');
    if (button) void act(button).catch(e => message(e instanceof Error ? e.message : String(e), true));
  };
  sheet.addEventListener('click', onClick); sheet.addEventListener('input', onInput); sheet.addEventListener('change', onChange);
  sheet.addEventListener('close', () => {
    sheet.removeEventListener('click', onClick); sheet.removeEventListener('input', onInput); sheet.removeEventListener('change', onChange);
    if (preview) void audio.pause().then(() => audio.load(book, settings)).catch(() => {});
  }, { once: true });
  draw();
}
