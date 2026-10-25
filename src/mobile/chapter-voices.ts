import { chapterAt } from './books';
import { lotsAnalyse } from './casting-analysis';
import { genreVoix, voixLocales } from './casting';
import type { Book, Character, Settings, Voice } from './types';

export function chapterAnalysisReady(book: Book, settings: Settings, start = chapterAt(book).start) {
  const fine = !!settings.ia?.enabled || !!(settings.server && settings.token);
  if (!fine) return !!book.casting;
  const completed = new Set(book.casting?.analysis?.completed ?? []);
  return lotsAnalyse(book).filter(l => l.chapterStart === start).every(l => completed.has(l.key));
}
export function chapterCharacters(book: Book, start = chapterAt(book).start): Character[] {
  const chapter = book.chapters.find(c => c.start === start);
  if (!chapter || !book.casting?.enabled) return [];
  const ids = new Set(book.segments.slice(chapter.start, chapter.end)
    .map((_, offset) => book.casting!.assignments[String(chapter.start + offset)] ?? 'narrator'));
  return book.casting.characters.filter(c => ids.has(c.id));
}

export interface ChapterVoiceChoice { role: Character; voice: string; confirmed: boolean }
export function proposeChapterVoices(book: Book, available: Voice[], start = chapterAt(book).start): ChapterVoiceChoice[] {
  const roles = chapterCharacters(book, start);
  const pool = voixLocales(available).filter(v => v.id === 'system:default' || v.language.split(/[-_]/)[0] === book.language.split(/[-_]/)[0]);
  const used = new Set(book.casting?.characters.filter(c => c.voice && c.automaticVoice === false).map(c => c.voice));
  return roles.map(role => {
    if (role.voice && role.automaticVoice === false) return { role, voice: role.voice, confirmed: true };
    const candidates = pool.filter(v => !role.gender || role.gender === 'indetermine' || genreVoix(v) === 'indetermine' || genreVoix(v) === role.gender)
      .sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) ||
        Number(!!role.gender && role.gender !== 'indetermine' && genreVoix(b) === role.gender) - Number(!!role.gender && role.gender !== 'indetermine' && genreVoix(a) === role.gender) ||
        Number(b.installed) - Number(a.installed) || Number(b.id === role.voice) - Number(a.id === role.voice));
    const voice = candidates[0]?.id ?? role.voice ?? 'system:default';
    used.add(voice);
    return { role, voice, confirmed: false };
  });
}

/** Les chapitres inconnus/incomplets s'arrêtent avant la première phrase, même
 *  quand c'est le service Android qui avance sans l'interface au premier plan. */
export function chapterStops(book: Book, settings: Settings): number[] {
  if (book.sample || !book.casting?.enabled) return [];
  return book.chapters.filter(c => !chapterAnalysisReady(book, settings, c.start) ||
    chapterCharacters(book, c.start).some(role => !role.voice || role.automaticVoice !== false)).map(c => c.start);
}

export function confirmChapterVoices(choices: ChapterVoiceChoice[], selection: Record<string, string>) {
  for (const choice of choices) {
    choice.role.voice = selection[choice.role.id] ?? choice.voice;
    choice.role.automaticVoice = false;
  }
}

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function chapterReviewView(book: Book, choices: ChapterVoiceChoice[], available: Voice[], ready: boolean, working = false): string {
  const chapter = chapterAt(book);
  const lots = lotsAnalyse(book).filter(l => l.chapterStart === chapter.start);
  const completed = new Set(book.casting?.analysis?.completed ?? []);
  const done = lots.filter(l => completed.has(l.key)).length;
  const known = choices.filter(c => c.confirmed).length;
  const installed = choices.filter(c => c.voice === 'system:default' || available.some(v => v.id === c.voice && v.installed)).length;
  const pool = [...voixLocales(available), ...available.filter(v => v.kind === 'clone')]
    .filter(v => v.id === 'system:default' || v.language.split(/[-_]/)[0] === book.language.split(/[-_]/)[0]);
  return `<div class="chapter-review"><p class="sheet-description"><strong>${esc(chapter.title)}</strong><br>${ready ? `${choices.length} rôle${choices.length > 1 ? 's' : ''} · ${installed}/${choices.length} voix installées, ${choices.length - installed} à télécharger.` : `Analyse en cours : ${done}/${lots.length} lots de ce chapitre. Le reste du livre continue en arrière-plan.`}</p>
    <p class="chapter-review-status" role="status">${ready ? `Déjà validées : ${known} · Nouvelles : ${choices.length - known}. Vos choix sont conservés pour tout le livre.` : esc(book.casting?.analysis?.error ?? 'Le bilan des voix apparaît dès que ce chapitre est analysé. Vous pouvez fermer et revenir plus tard.')}</p>
    <fieldset class="chapter-voice-choices" ${working || !ready ? 'disabled' : ''}><legend class="sr-only">Voix du chapitre</legend>
    ${choices.map((choice, i) => `<label class="chapter-voice-choice" for="chapter-voice-${i}"><span><strong>${esc(choice.role.name)}</strong><small>${choice.confirmed ? 'Mémorisée' : 'Nouvelle proposition'}</small></span>
      <select id="chapter-voice-${i}" data-role-id="${esc(choice.role.id)}" aria-label="Voix de ${esc(choice.role.name)}">
      ${!pool.some(v => v.id === choice.voice) ? `<option value="${esc(choice.voice)}">${esc(choice.voice)} · indisponible</option>` : ''}
      ${pool.map(v => `<option value="${esc(v.id)}" ${v.id === choice.voice ? 'selected' : ''}>${esc(v.name)} · ${v.installed ? 'installée' : `à télécharger${v.size ? ` (${v.size} Mo)` : ''}`}</option>`).join('')}</select></label>`).join('')}
    </fieldset><button class="primary" data-action="chapter-voices-confirm" ${!ready || working ? 'disabled' : ''}>${working ? 'Installation des voix…' : 'Valider et écouter ce chapitre'}</button>
    <p class="update-note">Les voix à télécharger sont installées après validation. Au prochain chapitre, seuls les nouveaux personnages demandent une confirmation.</p></div>`;
}
