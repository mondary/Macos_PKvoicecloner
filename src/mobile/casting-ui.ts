import { besoinsVoix, ensureCasting, genreVoix, preparerDistributionLocale, proposerVoix, roleAuto, voixLocales } from './casting';
import { castingBusy, castingProgress, prepareCasting, watchCasting } from './casting-jobs';
import { audio, native, Reader } from './engine';
import { library } from './storage';
import type { Book, Casting, Settings, Voice } from './types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const factor = (n: number) => `${n.toLocaleString('fr', { maximumFractionDigits: 2 })}×`;
const genderLabel = (g?: string) => g === 'homme' ? 'Voix masculine' : g === 'femme' ? 'Voix féminine' : 'Genre non déterminé';
type Show = (title: string, body: string) => void;

/** Le parcours principal est personnage → voix. L'attribution est automatique ;
 *  une correction ponctuelle reste accessible dans les détails facultatifs. */
export async function openCasting(book: Book, available: Voice[], settings: Settings, show: Show, refresh: () => void,
  modelsChanged: (voices: Voice[]) => void = () => {}) {
  await audio.pause();
  // Réparer avant le premier rendu : les faux rôles déjà enregistrés ne doivent
  // pas être présentés à nouveau, même si leurs anciennes phrases existent.
  if (!castingBusy(book) && preparerDistributionLocale(book, available, settings.voice)) await library.save(book);
  const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  const trigger = document.activeElement as HTMLElement | null;
  let draft: Casting = structuredClone(ensureCasting(book));
  let catalog = voixLocales(available);
  let chapter = Math.max(0, book.chapters.findIndex(c => book.position >= c.start && book.position < c.end));
  let first = 0, preview = false, busy = false, closed = false, advanced = false;
  let status = '', invalid = false;
  const working = () => busy || castingBusy(book);
  const message = (text: string, error = false) => {
    status = text; invalid = error;
    const el = sheet.querySelector<HTMLElement>('#casting-status');
    if (el) { el.textContent = text; el.classList.toggle('error', error); }
  };
  const collect = () => {
    draft.enabled = sheet.querySelector<HTMLInputElement>('#casting-enabled')?.checked ?? draft.enabled;
    sheet.querySelectorAll<HTMLElement>('[data-character]').forEach(row => {
      const role = draft.characters[Number(row.dataset.character)];
      if (!role) return;
      const name = row.querySelector<HTMLInputElement>('[name="name"]')!.value.trim();
      if (name !== role.name) role.autoRole = false;
      role.name = name;
      const voice = row.querySelector<HTMLSelectElement>('[name="voice"]')!.value;
      if (voice !== role.voice) role.automaticVoice = false;
      role.voice = voice;
      role.pitch = Number(row.querySelector<HTMLInputElement>('[name="pitch"]')!.value);
      role.rate = Number(row.querySelector<HTMLInputElement>('[name="rate"]')!.value);
    });
  };
  const save = async () => {
    // Nettoie les rôles hérités d'anciennes analyses : un nom seulement cité
    // dans le récit n'a pas de réplique, donc pas de voix à conserver.
    const utilises = new Set(Object.values(draft.assignments));
    draft.characters = draft.characters.filter(c =>
      c.id === 'narrator' || utilises.has(c.id) || !roleAuto(c));
    const names = draft.characters.map(c => c.name.trim().toLocaleLowerCase());
    if (names.some(n => !n) || new Set(names).size !== names.length) throw new Error('Donnez un nom différent à chaque personnage.');
    const previous = book.casting;
    book.casting = structuredClone(draft);
    try { await library.save(book); } catch (error) { book.casting = previous; throw error; }
  };
  const draw = () => {
    if (closed) return;
    const focusId = (document.activeElement as HTMLElement)?.id;
    const scrollTop = sheet.scrollTop;
    const c = book.chapters[chapter], start = c.start + first, end = Math.min(c.end, start + 20);
    const { missing, downloads } = besoinsVoix(draft, catalog, book.language);
    const progress = castingProgress(book);
    const analysing = castingBusy(book);
    const options = catalog.filter(v => v.installed);
    const ids = new Set(draft.characters.map(role => role.id));
    const phrases = Object.entries(draft.assignments).filter(([index, id]) =>
      id !== 'narrator' && ids.has(id) && !draft.manualAssignments?.[index]).length;
    const counts = new Map<string, number>();
    const exemples = new Map<string, string>();
    book.segments.forEach((text, i) => {
      const assigned = draft.assignments[String(i)] ?? 'narrator';
      const id = ids.has(assigned) ? assigned : 'narrator';
      counts.set(id, (counts.get(id) || 0) + 1);
      if (!exemples.has(id)) exemples.set(id, text);
    });
    // Le parcours ne montre que les rôles qui parlent réellement (ou ajoutés à
    // la main) : une mention narrative ne doit pas apparaître comme un personnage.
    const utilises = new Set(Object.values(draft.assignments));
    const roles = draft.characters.map((role, i) => ({ role, i }))
      .filter(({ role }) => role.id === 'narrator' || utilises.has(role.id) || !roleAuto(role));
    const analysisText = analysing ? (progress ? `Analyse fine en cours · ${progress.done} / ${progress.total} blocs. Vous pouvez fermer cet écran ; gardez l’app ouverte.` : 'Analyse en attente…')
      : draft.analysis?.error ? `${draft.analysis.error} L’analyse du téléphone reste appliquée.`
      : `${draft.analysis?.state === 'ready' ? 'Analyse affinée par le studio' : 'Repérage local'} · ${book.chapters.length} chapitre${book.chapters.length > 1 ? 's' : ''} parcouru${book.chapters.length > 1 ? 's' : ''} · ${phrases} phrases attribuées automatiquement à un personnage. Les passages incertains restent au narrateur.`;
    const needsHTML = missing.length ? `<section class="casting-needs" id="casting-needs"><h3>${missing.length} voix supplémentaire${missing.length > 1 ? 's' : ''} proposée${missing.length > 1 ? 's' : ''}</h3>
      <p>Pour un timbre adapté et distinct par rôle, il manque ${missing.length} voix : ${missing.map(c => `${esc(c.name)} (${genderLabel(c.gender).toLocaleLowerCase()})`).join(', ')}. ${analysing ? 'Ce bilan peut encore évoluer pendant l’analyse fine.' : ''} En attendant, certains rôles partagent une voix.</p>
      ${downloads.length ? `<ul>${downloads.map(d => `<li>${d.voices.map(v => esc(v.name)).join(' + ')} → ${d.roles.map(r => esc(r.name)).join(', ')} · ${d.voice.size ?? '?'} Mo</li>`).join('')}</ul><button type="button" class="primary" data-cast="download">Télécharger les voix proposées · ${downloads.reduce((n, d) => n + (d.voice.size || 0), 0).toLocaleString('fr', { maximumFractionDigits: 1 })} Mo</button>` : '<p>Aucun timbre supplémentaire adapté dans le catalogue actuel. Une même voix peut lire plusieurs rôles ; sa hauteur reste réglable.</p>'}</section>` : '';
    show('Les voix de ce livre', `<div class="casting-editor">
      <p class="sheet-description">Le téléphone repère les locuteurs à partir des indices de dialogue. Vérifiez les noms proposés et leurs passages associés, puis choisissez leurs voix. Une majuscule ou un mot suivi de deux-points ne suffit pas à identifier un personnage.</p>
      <section class="casting-summary" aria-label="Analyse du livre"><strong>${roles.length} rôle${roles.length > 1 ? 's' : ''} proposé${roles.length > 1 ? 's' : ''}, narrateur compris</strong><p role="status">${esc(analysisText)}</p>
        ${missing.length ? `<button type="button" class="casting-preview" data-cast="needs">${missing.length} voix à compléter · voir les propositions ↓</button>` : ''}</section>
      <fieldset class="casting-controls" ${working() ? 'disabled' : ''} aria-busy="${working()}">
      <div class="casting-roles">${roles.map(({ role, i }) => `<fieldset data-character="${i}" class="casting-role"><legend>${esc(role.name)}</legend>
        <p class="casting-role-meta">${genderLabel(role.gender)} · ${counts.get(role.id) || 0} phrases${role.automaticVoice ? missing.includes(role) ? ' · voix provisoire' : ' · proposée' : ''}</p>
        ${role.id !== 'narrator' && exemples.has(role.id) ? `<details class="casting-evidence"><summary>Voir un passage attribué à ${esc(role.name)}</summary><p>${esc(exemples.get(role.id)!.slice(0, 400))}${exemples.get(role.id)!.length > 400 ? '…' : ''}</p></details>` : ''}
        <label class="sr-only" for="cast-voice-${i}">Voix de ${esc(role.name)}</label><select id="cast-voice-${i}" name="voice"><option value="">Voix du lecteur</option>${role.voice && !options.some(v => v.id === role.voice) ? `<option value="${esc(role.voice)}" selected>Voix indisponible — à remplacer</option>` : ''}${options.map(v => `<option value="${esc(v.id)}" ${v.id === role.voice ? 'selected' : ''}>${esc(v.name)}${genreVoix(v) === 'indetermine' ? '' : ` · ${genderLabel(genreVoix(v))}`}${v.network ? ' · réseau' : ''}</option>`).join('')}</select>
        <div class="casting-role-tools"><button type="button" class="casting-preview" data-cast="preview" data-id="${i}" aria-label="Écouter la voix de ${esc(role.name)}">Écouter un exemple</button>
        <details><summary aria-label="Réglages de ${esc(role.name)}">Réglages du rôle</summary><label for="cast-name-${i}">Nom</label><input id="cast-name-${i}" name="name" value="${esc(role.name)}" maxlength="80" required ${role.id === 'narrator' ? 'readonly' : ''}>
          <label for="cast-pitch-${i}">Hauteur · grave ↔ aigu <output>${factor(role.pitch)}</output></label><input id="cast-pitch-${i}" name="pitch" type="range" min="0.5" max="2" step="0.01" value="${role.pitch}">
          <label for="cast-rate-${i}">Vitesse du personnage <output>${factor(role.rate)}</output></label><input id="cast-rate-${i}" name="rate" type="range" min="0.75" max="1.5" step="0.05" value="${role.rate}">
          <div class="casting-role-actions"><button type="button" data-cast="reset" data-id="${i}">Réinitialiser hauteur et vitesse</button>${role.id !== 'narrator' ? `<button type="button" data-cast="remove" data-id="${i}">Retirer ce personnage</button>` : ''}</div></details></div></fieldset>`).join('')}</div>
      ${needsHTML}<details id="casting-advanced" ${advanced ? 'open' : ''}><summary>Corriger les locuteurs (facultatif)</summary>
        <p class="sheet-description">L’attribution se fait automatiquement. Ces contrôles servent uniquement à corriger une erreur ponctuelle.</p>
        <label class="casting-enable"><input type="checkbox" id="casting-enabled" ${draft.enabled ? 'checked' : ''}> Lire avec les voix des personnages</label>
        <button type="button" class="setting-row" data-cast="add">+ Ajouter un personnage manquant</button>
        <label for="cast-chapter">Chapitre à vérifier</label><select id="cast-chapter">${book.chapters.map((ch, i) => `<option value="${i}" ${i === chapter ? 'selected' : ''}>${esc(ch.title)}</option>`).join('')}</select>
        <div class="casting-passages">${book.segments.slice(start, end).map((text, offset) => `<div class="casting-passage"><p>${esc(text)}</p><label for="cast-segment-${start + offset}">Locuteur de la phrase ${start + offset + 1}</label><select id="cast-segment-${start + offset}" data-segment="${start + offset}">${roles.map(({ role }) => `<option value="${esc(role.id)}" ${(draft.assignments[String(start + offset)] || 'narrator') === role.id ? 'selected' : ''}>${esc(role.name)}</option>`).join('')}</select></div>`).join('')}</div>
        <div class="casting-pagination"><button type="button" data-cast="prev" ${first <= 0 ? 'disabled' : ''}>Précédents</button><span>${first + 1}–${end - c.start} / ${c.end - c.start}</span><button type="button" data-cast="next" ${end >= c.end ? 'disabled' : ''}>Suivants</button></div></details>
      <button type="button" class="primary casting-save" data-cast="save">Valider les voix</button></fieldset>
      <p id="casting-status" class="${invalid ? 'error' : ''}" role="status" aria-live="polite">${esc(status)}</p></div>`);
    sheet.scrollTop = scrollTop;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  };
  const act = async (button: HTMLButtonElement) => {
    if (working()) return;
    collect(); advanced = sheet.querySelector<HTMLDetailsElement>('#casting-advanced')?.open ?? false;
    const role = draft.characters[Number(button.dataset.id)];
    switch (button.dataset.cast) {
      case 'needs': sheet.querySelector('#casting-needs')?.scrollIntoView({ block: 'start' }); break;
      case 'add': draft.characters.push({ id: crypto.randomUUID(), name: `Personnage ${draft.characters.length}`, voice: '', pitch: 1, rate: 1, autoRole: false }); proposerVoix(draft, catalog, settings.voice, book.language); draw(); break;
      case 'reset': if (role) { role.pitch = 1; role.rate = 1; draw(); } break;
      case 'remove':
        if (role && role.id !== 'narrator') {
          draft.characters = draft.characters.filter(c => c.id !== role.id);
          Object.keys(draft.assignments).forEach(key => {
            if (draft.assignments[key] === role.id) { draft.assignments[key] = 'narrator'; (draft.manualAssignments ??= {})[key] = true; }
          });
          draw();
        }
        break;
      case 'prev': first = Math.max(0, first - 20); draw(); break;
      case 'next': first += 20; draw(); break;
      case 'preview': {
        if (!role) return;
        const demo: Book = { ...book, id: 'casting-preview', position: 0, segments: [`Bonjour, voici la voix de ${role.name} dans cette histoire.`], casting: { enabled: true, characters: [role], assignments: { '0': role.id } } };
        preview = true;
        await audio.load(demo, { ...settings, voice: settings.voice.startsWith('clone:') ? 'system:default' : settings.voice });
        await audio.play(); message('Exemple en cours.'); break;
      }
      case 'download': {
        if (!native) { message('Le téléchargement des voix est disponible dans l’APK Android.', true); return; }
        const downloads = besoinsVoix(draft, catalog, book.language).downloads;
        busy = true; draw();
        try {
          for (const item of downloads) {
            if (closed) break;
            await Reader.installModel({ id: item.voice.id });
            let installed = false;
            while (!installed && !closed) {
              const result = await Reader.models();
              catalog = [...catalog.filter(v => v.kind !== 'neural'), ...result.voices];
              modelsChanged(result.voices);
              const state = result.downloads[item.voice.id];
              if (state?.error) throw new Error(`${item.voice.name} : ${state.error}`);
              installed = !!result.voices.find(v => v.id === item.voice.id)?.installed;
              message(`${item.voices.map(v => v.name).join(' + ')} : ${installed ? 'installée' : `${Math.round(state?.progress || 0)} %`} · gardez l’app ouverte.`);
              if (!installed) await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (installed) { proposerVoix(draft, catalog, settings.voice, book.language); await save(); }
          }
          if (!closed) message('Voix installées et proposées aux personnages.');
        } finally { busy = false; draw(); }
        break;
      }
      case 'save':
        busy = true; draw();
        try { await save(); await audio.pause(); await audio.load(book, settings); preview = false; sheet.close(); refresh(); }
        finally { busy = false; draw(); }
        break;
    }
  };
  const onClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-cast]');
    if (button) void act(button).catch(e => message(e instanceof Error ? e.message : String(e), true));
  };
  const onInput = (event: Event) => {
    const el = event.target as HTMLInputElement;
    if (el.type === 'range') {
      const output = sheet.querySelector(`label[for="${el.id}"] output`);
      if (output) output.textContent = factor(Number(el.value));
    }
  };
  const onChange = (event: Event) => {
    const el = event.target as HTMLSelectElement;
    if (working()) return;
    collect();
    if (el.dataset.segment) {
      draft.assignments[el.dataset.segment] = el.value;
      (draft.manualAssignments ??= {})[el.dataset.segment] = true;
    }
    if (el.id === 'cast-chapter') { chapter = Number(el.value); first = 0; advanced = true; draw(); }
    if (el.name === 'voice') draw();
  };
  const unwatch = watchCasting(id => {
    if (id !== book.id || closed) return;
    draft = structuredClone(ensureCasting(book)); draw();
  });
  sheet.addEventListener('click', onClick); sheet.addEventListener('input', onInput); sheet.addEventListener('change', onChange);
  sheet.addEventListener('close', () => {
    closed = true; unwatch();
    sheet.removeEventListener('click', onClick); sheet.removeEventListener('input', onInput); sheet.removeEventListener('change', onChange);
    if (preview) void audio.pause().then(() => audio.load(book, settings)).catch(() => {});
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, { once: true });
  draw();
  if (native) {
    try { const result = await Reader.models(); catalog = [...catalog.filter(v => v.kind !== 'neural'), ...result.voices]; modelsChanged(result.voices); }
    catch { /* le catalogue connu reste utilisable */ }
  }
  if (closed) return;
  void prepareCasting(book, catalog, settings).catch(e => message(e instanceof Error ? e.message : String(e), true));
}
