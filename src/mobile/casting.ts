import type { Book, Casting, Character, Gender, Settings, Voice } from './types';
import { genreDuNom } from './prenoms';
import { cleNom, nomOrdinaire, toursLocaux, type TourLocal } from './dialogue-local';

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

export interface AnalysePersonnage { id: string; nom: string; genre: string; role: string; aliases?: string[] }
export interface AnalyseStudio { personnages: AnalysePersonnage[]; locuteurs: string[]; incertains?: number[] }

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
/** Rôle déduit par une analyse, par opposition à un rôle ajouté à la main.
 *  Les distributions antérieures à autoRole se reconnaissent à automaticVoice. */
export const roleAuto = (c: Character) => c.autoRole === true || (c.autoRole === undefined && c.automaticVoice === true);
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
    p && p.id !== 'narrateur' && p.id !== 'narrator' && p.role !== 'narrateur' && !nomOrdinaire(p.nom || p.id));
  const correspondance = new Map<string, string>([['narrateur', 'narrator'], ['narrator', 'narrator']]);
  personnages.forEach(personnage => {
    const name = (personnage.nom || personnage.id).slice(0, 80);
    let role = draft.characters.find(c => c.id !== 'narrator' &&
      (c.sourceId === personnage.id || c.id === `studio-${personnage.id}` || normaliser(c.name) === normaliser(name)));
    if (!role) {
      role = { id: `studio-${personnage.id}`, name, voice: voix(personnage.genre),
        pitch: 1, rate: 1, automaticVoice: true, autoRole: true };
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
  // Le cast du studio remplace le repérage local : les rôles automatiques hors
  // distribution du studio qui n'ont plus aucune phrase disparaissent au fil des
  // lots, au lieu de s'empiler. Les rôles listés par le studio restent.
  const listes = new Set(personnages.map(p => correspondance.get(p.id)).filter((id): id is string => !!id));
  const utilises = new Set(Object.values(draft.assignments));
  draft.characters = draft.characters.filter(c =>
    c.id === 'narrator' || utilises.has(c.id) || listes.has(c.id) || !roleAuto(c) || !c.automaticVoice);
  return { personnages: personnages.length, phrases };
}

/** Le genre des voix Android n'est pas fourni par leur API : ne pas le deviner
 *  depuis leur nom. Les timbres Piper du catalogue ont des métadonnées connues. */
const genresPiper: Record<string, Gender> = {
  'neural:siwis': 'femme', 'neural:siwis_leger': 'femme', 'neural:tom': 'homme', 'neural:gilles': 'homme',
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
  // Une mention sans réplique n'a pas besoin d'une voix : seuls le narrateur,
  // les rôles qui parlent et les rôles ajoutés à la main sont proposés.
  const utilises = new Set(Object.values(casting.assignments));
  const visible = (c: Character) => c.id === 'narrator' || utilises.has(c.id) || !roleAuto(c);
  const used = new Set(casting.characters.filter(c => visible(c) && c.voice && !c.automaticVoice).map(c => c.voice));
  const automatic = casting.characters.filter(c => visible(c) && (!c.voice || c.automaticVoice))
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
  const utilises = new Set(Object.values(casting.assignments));
  for (const role of casting.characters) {
    if (role.id !== 'narrator' && !utilises.has(role.id) && roleAuto(role)) continue;
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

/* -------------------------------- repérage local prudent (sur le téléphone) */

export const LOCAL_CASTING_REVISION = 2;
export const analyseLocalePerimee = (book: Book) => book.casting?.analysis?.localRevision !== LOCAL_CASTING_REVISION;

/** Relance une analyse complète : efface les attributions automatiques et les
 *  rôles auto devenus inutiles, conserve corrections manuelles, voix choisies et
 *  réglages. `prepareCasting` enchaîne ensuite le repérage local puis l'IA. */
export function relancerAnalyse(book: Book): void {
  const cast = book.casting;
  if (!cast) return;
  const manuel = cast.manualAssignments ?? {};
  cast.assignments = Object.fromEntries(Object.entries(cast.assignments).filter(([index]) => manuel[index]));
  const utilises = new Set(Object.values(cast.assignments));
  cast.characters = cast.characters.filter(c =>
    c.id === 'narrator' || !roleAuto(c) || !c.automaticVoice || utilises.has(c.id));
  cast.analysis = undefined;
}

/** Recalcule les anciennes attributions locales, pas les choix manuels ni les
 * lots déjà validés par le studio. Les indices ambigus restent au narrateur. */
export function preparerDistributionLocale(book: Book, available: Voice[], fallback: string) {
  const cast = ensureCasting(book);
  if (!analyseLocalePerimee(book)) return false;
  const ancienneAnalyse = cast.analysis;
  // Avant l'analyse automatique, les attributions enregistrées étaient manuelles.
  cast.manualAssignments ??= ancienneAnalyse ? {} : Object.fromEntries(Object.keys(cast.assignments).map(key => [key, true]));
  if (!ancienneAnalyse) cast.enabled = true;
  const parId = new Map(cast.characters.map(c => [c.id, c]));
  const manuels = new Set(Object.entries(cast.manualAssignments).filter(([, manuel]) => manuel).map(([i]) => cast.assignments[i]));
  const lotsStudio = (ancienneAnalyse?.completed ?? []).flatMap(key => {
    const m = /^(\d+):(\d+)$/.exec(key);
    return m ? [[Number(m[1]), Number(m[2])]] : [];
  });
  const studio = (i: number) => lotsStudio.some(([debut, fin]) => i >= debut && i < fin);
  cast.assignments = Object.fromEntries(Object.entries(cast.assignments).filter(([index, id]) =>
    cast.manualAssignments![index] || (studio(Number(index)) && (id === 'narrator' || !nomOrdinaire(parId.get(id)?.name ?? '')))));
  const proteges = new Set(Object.keys(cast.assignments));
  const conserver = (c: Character) => c.id === 'narrator' || manuels.has(c.id) || !roleAuto(c);
  const retrouver = (nom: string): Character => {
    const cle = cleNom(nom);
    let role = cast.characters.find(c => c.id !== 'narrator' && cleNom(c.name) === cle);
    if (!role) {
      role = { id: crypto.randomUUID(), name: nom.trim().slice(0, 80), voice: '', pitch: 1, rate: 1,
        gender: genreDuNom(nom), automaticVoice: true, autoRole: true };
      cast.characters.push(role);
    }
    const sexe = genreDuNom(nom);
    if (sexe !== 'indetermine' && (role.gender ?? 'indetermine') === 'indetermine') role.gender = sexe;
    return role;
  };
  const tours = toursLocaux(book, cast.characters.filter(c => !roleAuto(c)).map(c => c.name));
  const attribuer = (tour: TourLocal, id: string) => {
    for (let i = tour.debut; i < tour.fin; i++) {
      if (!proteges.has(String(i)) && !studio(i)) cast.assignments[String(i)] = id;
    }
  };
  const attribuerEchange = (echange: TourLocal[]) => {
    const ancres = new Map<number, string>();
    echange.forEach((tour, n) => {
      const idsManuels = new Set<string>();
      for (let i = tour.debut; i < tour.fin; i++) if (cast.manualAssignments![String(i)]) idsManuels.add(cast.assignments[String(i)]);
      // Une correction explicite gagne sur le nom détecté, y compris Narrateur.
      if (idsManuels.size) {
        if (idsManuels.size === 1 && !idsManuels.has('narrator')) ancres.set(n, [...idsManuels][0]);
        else tour.incertain = true;
      } else if (tour.nom && !tour.incertain) ancres.set(n, retrouver(tour.nom).id);
    });
    const locuteurs = [...new Set(ancres.values())];
    const autre = (id: string) => locuteurs.find(x => x !== id);
    const positions = [...ancres.keys()].sort((a, b) => a - b);
    echange.forEach((tour, n) => {
      if (tour.incertain) return;
      const ancre = ancres.get(n);
      if (ancre) { attribuer(tour, ancre); return; }
      if (tour.genre) {
        const compatibles = locuteurs.filter(id => cast.characters.find(c => c.id === id)?.gender === tour.genre);
        if (compatibles.length === 1) attribuer(tour, compatibles[0]);
        return;
      }
      // Interpoler seulement entre deux ancres cohérentes : aucune extrapolation
      // en fin de scène, aucun changement de voix à chaque phrase du paragraphe.
      if (locuteurs.length !== 2) return;
      const avant = positions.filter(p => p < n).pop(), apres = positions.find(p => p > n);
      if (avant === undefined || apres === undefined) return;
      const gauche = (n - avant) % 2 ? autre(ancres.get(avant)!) : ancres.get(avant);
      const droite = (apres - n) % 2 ? autre(ancres.get(apres)!) : ancres.get(apres);
      if (gauche && gauche === droite) attribuer(tour, gauche);
    });
  };
  for (let debut = 0; debut < tours.length;) {
    if (!tours[debut].dialogue) { debut++; continue; }
    let fin = debut + 1;
    while (fin < tours.length && tours[fin].dialogue && tours[fin].chapitre === tours[debut].chapitre) fin++;
    attribuerEchange(tours.slice(debut, fin));
    debut = fin;
  }

  const utilises = new Set(Object.values(cast.assignments));
  cast.characters = cast.characters.filter(c => conserver(c) || utilises.has(c.id));
  cast.analysis = { ...(ancienneAnalyse ?? { completed: [], state: 'local' }), localRevision: LOCAL_CASTING_REVISION };
  proposerVoix(cast, available, fallback, book.language);
  return true;
}
