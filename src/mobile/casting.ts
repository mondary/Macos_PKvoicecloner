import type { Book, Casting, Character, Gender, Settings, Voice } from './types';
import { genreDuNom, prenomConnu } from './prenoms';

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

/* ----------------------------- analyse locale complète (sur le téléphone) */

const VERBES_PAROLE = ['dit', 'demanda', 'répondit', 'ajouta', 'murmura', 'cria', 'souffla',
  's’écria', 's\'exclama', 'reprit', 'lança', 'soupira', 'grogna', 'bafouilla', 'articula',
  'chuchota', 'insista', 'objecta', 'remarqua', 'conclut', 'commença', 'poursuivit',
  'interrogea', 'acquiesça', 'lâcha', 'cracha', 'said', 'asked', 'replied', 'whispered'];
const VERBES = VERBES_PAROLE.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const TITRE = String.raw`(?:M\.|Mme\.?|Mlle\.?|Monsieur|Madame|Mademoiselle)`;
const NOM_GROUPE = String.raw`(?:\p{Lu}[\p{L}'’-]*)(?:[\s]+\p{Lu}[\p{L}'’-]*){0,2}`;
const RE_ETIQUETTE = new RegExp(String.raw`^(?:[—–«“"]\s*)?((?:${TITRE}\s+)?${NOM_GROUPE})\s*[:：]`, 'u');
const RE_DEBUT = new RegExp(String.raw`^((?:${TITRE}\s+)?${NOM_GROUPE})\s+(?:${VERBES})\s*[:：]`, 'u');
const RE_INCISE = new RegExp(String.raw`[,;»”"!?…]\s*(?:[—–-]\s*)?(?:${VERBES})\s+((?:${TITRE}\s+)?${NOM_GROUPE})[.!?…»”"\s]*$`, 'u');
const RE_PRONOM = new RegExp(String.raw`\b(?:${VERBES})-(elles?|ils?)\b`, 'u');
const RE_TOUR = /^\s*[—–«“"]/;
const RE_SUITE = new RegExp(String.raw`^[,;»”"…]|^(?:${VERBES})\s+(?:${TITRE}\s+)?${NOM_GROUPE}\b`, 'u');
const RE_MENTION = new RegExp(String.raw`^(?:[—–«“"]\s*)?((?:${TITRE}\s+)?${NOM_GROUPE})\b(?=[\s,.:;!?])`, 'u');
const RE_TITRE = new RegExp(`^${TITRE}`, 'i');
const INTERDITS = /^(chapitre|chapter|note|notes|attention|titre|prologue|epilogue|fin|livre|partie|acte|scene|premiere|deuxieme|troisieme|quatrieme|cinquieme)\b/i;

/** Clé de fusion : le nom sans titre ni casse (« Mme Martin » = « Martin »). */
const cleNom = (nom: string) => normaliser(nom).replace(/^(?:m|mme|mlle|monsieur|madame|mademoiselle)\s+/g, '');

interface TourParole { nom?: string; genre?: Gender; tour: boolean }

/** Une réplique est attribuée : étiquette (« Pierre : »), incise (« … », dit
 *  Pierre), annonce (Pierre dit :) ou marque de genre (dit-elle). */
const detecterTour = (texte: string): TourParole => {
  const t = texte.trim();
  if (!t) return { tour: false };
  for (const re of [RE_ETIQUETTE, RE_DEBUT, RE_INCISE]) {
    const nom = t.match(re)?.[1]?.trim();
    if (nom && !INTERDITS.test(nom)) return { nom, tour: true };
  }
  const pronom = t.match(RE_PRONOM)?.[1];
  if (pronom) return { genre: /^el/i.test(pronom) ? 'femme' : 'homme', tour: true };
  return { tour: RE_TOUR.test(t) || RE_SUITE.test(t) };
};

/** Analyse du livre entièrement sur le téléphone : personnages (titres,
 *  prénoms connus, locuteurs nommés), sexe des voix, attribution des répliques
 *  par alternance et incises. Aucun réseau, aucun Mac. */
export function preparerDistributionLocale(book: Book, available: Voice[], fallback: string) {
  const cast = ensureCasting(book);
  if (cast.analysis) return;
  // Les attributions des anciennes versions sont des choix utilisateur à conserver.
  cast.manualAssignments ??= Object.fromEntries(Object.keys(cast.assignments).map(key => [key, true]));
  cast.enabled = true;

  const retrouver = (nom: string): Character => {
    const cle = cleNom(nom);
    let role = cast.characters.find(c => c.id !== 'narrator' && cleNom(c.name) === cle);
    if (!role) {
      role = { id: crypto.randomUUID(), name: nom.trim().slice(0, 80), voice: '', pitch: 1, rate: 1,
        gender: genreDuNom(nom), automaticVoice: true };
      cast.characters.push(role);
    }
    const genre = genreDuNom(nom);
    if (genre !== 'indetermine' && (role.gender ?? 'indetermine') === 'indetermine') role.gender = genre;
    if (RE_TITRE.test(nom) && !RE_TITRE.test(role.name)) role.name = nom.trim().slice(0, 80);
    return role;
  };
  const manuel = (index: number) => !!cast.manualAssignments?.[String(index)];
  const roleDe = (id: string) => cast.characters.find(c => c.id === id);

  const infos = book.segments.map(segment => detecterTour(segment));

  // Personnages nommés dans le récit : titre (« Mme Martin ») ou prénom connu.
  // Cette passe précède l'attribution : « dit-elle » désigne ensuite la seule
  // femme déjà repérée dans le livre.
  book.segments.forEach((text) => {
    const nom = text.trim().match(RE_MENTION)?.[1]?.trim();
    if (!nom || INTERDITS.test(nom)) return;
    if (RE_TITRE.test(nom) || prenomConnu(nom)) retrouver(nom);
  });

  // Séries de répliques consécutives : à l'intérieur, les locuteurs alternent.
  const attribuerRun = (debut: number, fin: number) => {
    const ancres = new Map<number, string>();
    for (let i = debut; i < fin; i++) {
      const info = infos[i];
      if (info.nom) {
        const role = retrouver(info.nom);
        if (!manuel(i)) cast.assignments[String(i)] = role.id;
        ancres.set(i, role.id);
      } else if (manuel(i) && cast.assignments[String(i)] && cast.assignments[String(i)] !== 'narrator') {
        ancres.set(i, cast.assignments[String(i)]);      // une correction manuelle ancre l'alternance
      }
    }
    const locuteurs = [...new Set(ancres.values())];
    const autre = (id: string) => locuteurs.find(x => x !== id);
    const positions = [...ancres.keys()].sort((a, b) => a - b);
    for (let i = debut; i < fin; i++) {
      if (cast.assignments[String(i)] || manuel(i) || infos[i].nom) continue;
      if (infos[i].genre) {
        // « dit-elle » : la locutrice du genre si elle est unique dans l'échange,
        // sinon la seule femme (ou le seul homme) repéré(e) dans le livre.
        const locales = locuteurs.filter(id => roleDe(id)?.gender === infos[i].genre);
        if (locales.length === 1) { cast.assignments[String(i)] = locales[0]; continue; }
        if (!locales.length) {
          const candidates = cast.characters.filter(c => c.id !== 'narrator' && c.gender === infos[i].genre);
          if (candidates.length === 1) cast.assignments[String(i)] = candidates[0].id;
        }
        continue;
      }
      if (locuteurs.length !== 2) continue;              // alternance fiable à deux locuteurs seulement
      const precedent = positions.filter(p => p < i).pop();
      const suivant = positions.find(p => p > i);
      let choix: string | undefined;
      if (precedent !== undefined) choix = (i - precedent) % 2 ? autre(ancres.get(precedent)!) : ancres.get(precedent);
      if (suivant !== undefined) {
        const attendu = (suivant - i) % 2 ? autre(ancres.get(suivant)!) : ancres.get(suivant);
        choix = choix === undefined ? attendu : choix === attendu ? choix : undefined;
      }
      if (choix) cast.assignments[String(i)] = choix;
    }
  };
  let debut = -1;
  for (let i = 0; i <= infos.length; i++) {
    const tour = i < infos.length && infos[i].tour;
    if (tour && debut < 0) debut = i;
    if (!tour && debut >= 0) { attribuerRun(debut, i); debut = -1; }
  }

  cast.analysis = { completed: [], state: 'local' };
  proposerVoix(cast, available, fallback, book.language);
}
