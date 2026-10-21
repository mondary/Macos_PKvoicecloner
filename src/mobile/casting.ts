import type { Book, Casting, Character, Settings, Voice } from './types';

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

/** Applique l'analyse du studio : un rôle par personnage détecté (voix selon le
 *  sexe), puis un locuteur par phrase à partir de `depart`. Tout reste éditable. */
export function appliquerAnalyse(draft: Casting, analyse: AnalyseStudio,
  choix: { narrateur: string; homme: string; femme: string }, depart: number) {
  const narrateur: Character = draft.characters.find(c => c.id === 'narrator')
    ?? { id: 'narrator', name: 'Narrateur', voice: '', pitch: 1, rate: 1 };
  if (choix.narrateur) narrateur.voice = choix.narrateur;
  const voix = (genre: string) => genre === 'homme' ? choix.homme
    : genre === 'femme' ? choix.femme : narrateur.voice;
  const personnages = (analyse.personnages || []).filter(p =>
    p && p.id !== 'narrateur' && p.id !== 'narrator' && p.role !== 'narrateur');
  const correspondance = new Map<string, string>([['narrateur', 'narrator'], ['narrator', 'narrator']]);
  const roles: Character[] = [narrateur];
  personnages.forEach((personnage, rang) => {
    const id = `studio-${personnage.id}`;      // préfixe : jamais en collision avec un id existant
    correspondance.set(personnage.id, id);
    roles.push({
      id, name: (personnage.nom || personnage.id).slice(0, 60), voice: voix(personnage.genre),
      pitch: rang % 3 === 1 ? 0.94 : rang % 3 === 2 ? 1.06 : 1, rate: 1,
    });
  });
  draft.characters = roles;
  draft.enabled = true;
  let phrases = 0;
  (analyse.locuteurs || []).forEach((locuteur, offset) => {
    const index = String(depart + offset);
    const id = correspondance.get(locuteur);
    draft.assignments[index] = id ?? 'narrator';
    if (id && id !== 'narrator') phrases++;
  });
  return { personnages: personnages.length, phrases };
}
