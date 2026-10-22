import type { Book, Casting, Character, Gender, Settings, Voice } from './types';

export function ensureCasting(book: Book): Casting {
  return book.casting ??= { enabled: false, characters: [
    { id: 'narrator', name: 'Narrateur', voice: '', pitch: 1, rate: 1 },
  ], assignments: {} };
}

export function characterAt(book: Book, index: number): Character | undefined {
  if (!book.casting?.enabled) return;
  const id = book.casting.assignments[String(index)] ?? 'narrator';
  return book.casting.characters.find(c => c.id === id) ?? book.casting.characters.find(c => c.id === 'narrator');
}

export function speechProfile(book: Book, settings: Settings, index: number) {
  const role = characterAt(book, index);
  const voice = role?.voice || settings.voice;
  const base = settings.voiceRates?.[voice] ?? settings.rate;   // chaque voix garde sa vitesse
  return { voice: book.casting?.enabled && voice.startsWith('clone:') ? 'system:default' : voice, pitch: role?.pitch ?? 1,
    rate: Math.min(3, Math.max(0.5, base * (role?.rate ?? 1))) };
}

/** Conservative local hints, never guessing a speaker from alternating dialogue.
 * Explicit Name: and short dialogue followed by an attribution are recognised.
 * Narrative mentions alone are deliberately left unassigned. Manual choices win. */
export function suggestCasting(book: Book, start: number, end: number): number {
  const casting = ensureCasting(book);
  let added = 0;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let index = start; index < end; index++) {
    if (Object.hasOwn(casting.assignments, String(index))) continue;
    const text = book.segments[index];
    const matches = casting.characters.filter(c => c.id !== 'narrator' && (
      new RegExp(`^\\s*(?:[—–«“\"]\\s*)?${escape(c.name)}\\s*[:：]`, 'iu').test(text) ||
      new RegExp(`[,»”\"]\\s*(?:[—–-]\\s*)?(?:dit|demanda|répondit|ajouta|murmura|cria|souffla|s’écria|s'exclama|said|asked|replied)\\s+${escape(c.name)}[.!?…\\s]*$`, 'iu').test(text)
    ));
    if (matches.length === 1) { casting.assignments[String(index)] = matches[0].id; added++; }
  }
  return added;
}

/* ---------------------------------------------- analyse du studio (via le Mac) */

export interface AnalysePersonnage { id: string; nom: string; genre: string; role: string }
export interface AnalyseStudio { personnages: AnalysePersonnage[]; locuteurs: string[] }

/** Voix proposées par sexe : les Piper connues d'abord, sinon la voix du lecteur. */
export function voixParGenreParDefaut(options: Voice[], defaut: string) {
  const dispo = new Set(options.map(v => v.id));
  const choisir = (...ids: string[]) =>
    ids.find(id => dispo.has(id)) ?? (dispo.has(defaut) ? defaut : options[0]?.id ?? defaut);
  return {
    narrateur: dispo.has(defaut) ? defaut : choisir('neural:siwis', 'system:default'),
    homme: choisir('neural:tom', 'system:default'),
    femme: choisir('neural:siwis', 'system:default'),
  };
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const genre = (s?: string): Gender => s === 'homme' || s === 'femme' ? s : 'indetermine';

/** Fusionne la distribution du livre : les voix/réglages et les chapitres déjà
 *  préparés survivent aux lots suivants. Les corrections manuelles gagnent. */
export function appliquerAnalyse(draft: Casting, analyse: AnalyseStudio,
  choix: { narrateur: string; homme: string; femme: string }, depart: number) {
  const narrateur: Character = draft.characters.find(c => c.id === 'narrator')
    ?? { id: 'narrator', name: 'Narrateur', voice: '', pitch: 1, rate: 1 };
  if (!draft.characters.includes(narrateur)) draft.characters.unshift(narrateur);
  if (!narrateur.voice && choix.narrateur) { narrateur.voice = choix.narrateur; narrateur.automaticVoice = true; }
  const narration = analyse.personnages.find(p => p.role === 'narrateur' || ['narrateur', 'narrator'].includes(p.id));
  if (narration) narrateur.gender = genre(narration.genre);
  const voix = (genre: string) => genre === 'homme' ? choix.homme
    : genre === 'femme' ? choix.femme : narrateur.voice;
  const personnages = (analyse.personnages || []).filter(p =>
    p && p.id !== 'narrateur' && p.id !== 'narrator' && p.role !== 'narrateur');
  const correspondance = new Map<string, string>([['narrateur', 'narrator'], ['narrator', 'narrator']]);
  personnages.forEach(personnage => {
    const name = (personnage.nom || personnage.id).slice(0, 80);
    let role = draft.characters.find(c => c.id !== 'narrator' &&
      (c.sourceId === personnage.id || c.id === `studio-${personnage.id}` || normaliser(c.name) === normaliser(name)));
    if (!role) {
      role = { id: `studio-${personnage.id}`, name, voice: voix(personnage.genre),
        pitch: 1, rate: 1, automaticVoice: true };
      if (draft.characters.some(c => c.id === role!.id)) role.id = crypto.randomUUID();
      draft.characters.push(role);
    }
    role.sourceId = personnage.id;
    if (genre(personnage.genre) !== 'indetermine' || !role.gender) role.gender = genre(personnage.genre);
    correspondance.set(personnage.id, role.id);
  });
  draft.enabled = true;
  let phrases = 0;
  (analyse.locuteurs || []).forEach((locuteur, offset) => {
    const index = String(depart + offset);
    const id = correspondance.get(locuteur);
    if (!draft.manualAssignments?.[index]) draft.assignments[index] = id ?? 'narrator';
    if (id && id !== 'narrator') phrases++;
  });
  return { personnages: personnages.length, phrases };
}

/** Le genre des voix Android n'est pas fourni par leur API : ne pas le deviner
 *  depuis leur nom. Les timbres Piper du catalogue ont des métadonnées connues. */
const genresPiper: Record<string, Gender> = {
  'neural:siwis': 'femme', 'neural:tom': 'homme', 'neural:gilles': 'homme',
  'neural:upmc': 'femme', 'neural:upmc_pierre': 'homme', 'neural:lessac': 'femme',
};
export const genreVoix = (v: Voice) => v.gender ?? genresPiper[v.id] ?? 'indetermine';
export const modeleVoix = (v: Voice) => v.modelId ?? (v.id === 'neural:upmc_pierre' ? 'neural:upmc' : v.id);
const memeLangue = (v: Voice, language: string) => v.id === 'system:default' || v.language.split(/[-_]/)[0] === language.split(/[-_]/)[0];
const compatible = (c: Character, v: Voice) => !c.gender || c.gender === 'indetermine' || genreVoix(v) === 'indetermine' || c.gender === genreVoix(v);

export function voixLocales(available: Voice[]): Voice[] {
  const list = available.filter(v => v.kind !== 'clone');
  if (!list.some(v => v.id === 'system:default')) list.unshift({ id: 'system:default', name: 'Voix du téléphone', language: 'fr', kind: 'system', installed: true });
  return list;
}

/** Une proposition par rôle, de préférence un timbre distinct de la bonne
 * langue et du bon genre. Une association choisie par l'utilisateur reste fixe. */
export function proposerVoix(casting: Casting, available: Voice[], fallback: string, language: string) {
  const installed = voixLocales(available).filter(v => v.installed && memeLangue(v, language));
  // Le défaut système est un alias, pas un timbre supplémentaire au catalogue Android.
  const pool = installed.filter(v => v.id !== 'system:default' || !installed.some(other => other.kind === 'system' && other.id !== v.id));
  const used = new Set(casting.characters.filter(c => c.voice && !c.automaticVoice).map(c => c.voice));
  const automatic = casting.characters.filter(c => !c.voice || c.automaticVoice)
    .sort((a, b) => Number(!a.gender || a.gender === 'indetermine') - Number(!b.gender || b.gender === 'indetermine'));
  for (const role of automatic) {
    const candidates = pool.filter(v => compatible(role, v)).sort((a, b) =>
      Number(used.has(a.id)) - Number(used.has(b.id)) ||
      Number(genreVoix(b) === role.gender) - Number(genreVoix(a) === role.gender) ||
      Number(b.id === (role.voice || fallback)) - Number(a.id === (role.voice || fallback)) ||
      Number(b.kind === 'neural') - Number(a.kind === 'neural'));
    role.voice = candidates[0]?.id ?? installed.find(v => v.id === fallback)?.id ?? 'system:default';
    role.automaticVoice = true;
    used.add(role.voice);
  }
  return besoinsVoix(casting, available, language);
}

/** Besoins de timbres distincts, et téléchargements réellement disponibles.
 *  Jessica et Pierre sont deux timbres mais un seul téléchargement UPMC. */
export function besoinsVoix(casting: Casting, available: Voice[], language: string) {
  const voices = voixLocales(available);
  const used = new Set<string>();
  const missing: Character[] = [];
  for (const role of casting.characters) {
    const v = voices.find(v => v.id === role.voice && v.installed && memeLangue(v, language));
    // Une voix Android au genre inconnu reste un repli lisible, mais ne prouve
    // pas qu'une demande de timbre masculin/féminin est satisfaite.
    const genreAdapte = v && (!role.gender || role.gender === 'indetermine' || genreVoix(v) === role.gender);
    if (!v || !genreAdapte || used.has(v.id)) missing.push(role);
    if (v) used.add(v.id);
  }
  const downloads: { voice: Voice; roles: Character[]; voices: Voice[] }[] = [];
  const proposed = new Set<string>();
  for (const role of missing) {
    const v = voices.find(v => v.kind === 'neural' && !v.installed && !proposed.has(v.id) && memeLangue(v, language) && compatible(role, v));
    if (!v) continue;
    proposed.add(v.id);
    const existing = downloads.find(d => modeleVoix(d.voice) === modeleVoix(v));
    if (existing) { existing.roles.push(role); existing.voices.push(v); }
    else downloads.push({ voice: v, roles: [role], voices: [v] });
  }
  return { missing, downloads };
}

/** Première passe hors ligne : seuls les noms explicitement rattachés à une
 *  réplique sont créés. Le studio résout ensuite les dialogues contextuels. */
export function preparerDistributionLocale(book: Book, available: Voice[], fallback: string) {
  const cast = ensureCasting(book);
  if (cast.analysis) return;
  // Les attributions des anciennes versions sont des choix utilisateur à conserver.
  cast.manualAssignments ??= Object.fromEntries(Object.keys(cast.assignments).map(key => [key, true]));
  const nom = String.raw`(?:(?:M\.|Mme\.?|Mlle\.?|Monsieur|Madame|Mademoiselle)\s+)?\p{Lu}[\p{L}’'-]*(?:[ \t]+\p{Lu}[\p{L}’'-]*){0,2}`;
  const etiquette = new RegExp(`^\\s*(?:[—–«“"]\\s*)?(${nom})\\s*[:：]`, 'u');
  const incise = new RegExp(`[,»”"!?]\\s*(?:[—–-]\\s*)?(?:dit|demanda|répondit|ajouta|murmura|cria|souffla|said|asked|replied)\\s+(${nom})[.!?…»”"\\s]*$`, 'u');
  book.segments.forEach((text, index) => {
    const name = (text.match(etiquette)?.[1] ?? text.match(incise)?.[1])?.trim();
    if (!name || /^(chapitre|chapter|note|attention|titre)\b/i.test(name)) return;
    let role = cast.characters.find(c => normaliser(c.name) === normaliser(name));
    if (!role) {
      role = { id: crypto.randomUUID(), name, voice: '', pitch: 1, rate: 1,
        gender: /^(Mme\.?|Mlle\.?|Madame|Mademoiselle)\s/.test(name) ? 'femme' : /^(M\.|Monsieur)\s/.test(name) ? 'homme' : 'indetermine', automaticVoice: true };
      cast.characters.push(role);
    }
    if (!cast.manualAssignments?.[String(index)]) cast.assignments[String(index)] = role.id;
  });
  cast.enabled = true;
  cast.analysis = { completed: [], state: 'local' };
  proposerVoix(cast, available, fallback, book.language);
}
