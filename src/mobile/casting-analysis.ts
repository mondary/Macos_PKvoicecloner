import { appliquerAnalyse, ensureCasting, preparerDistributionLocale, proposerVoix, roleAuto, voixParGenreParDefaut, voixLocales, type AnalyseStudio, type AnalysePersonnage } from './casting';
import type { Book, Voice } from './types';

export interface AnalyseRequest { titre: string; phrases: string[]; personnages: AnalysePersonnage[] }
export interface AnalysisProgress { done: number; total: number; chapter: string; phase?: 'personnages' | 'attribution' | 'verification' }
export interface OptionsAnalyse {
  /** Chapitre (index de départ) traité en premier : celui qu'on s'apprête à écouter. */
  priorite?: number;
  /** Prévenu dès qu'un chapitre a tous ses lots validés (lecture immédiate). */
  chapitrePret?: (chapterStart: number) => void;
}

/** Lots bornés avec contexte chevauchant. La position, les paragraphes et les
 *  signets restent intacts : l'IA ne réécrit jamais le texte du téléphone. */
export function lotsAnalyse(book: Book) {
  return book.chapters.flatMap(chapter => {
    const lots = [];
    for (let start = chapter.start; start < chapter.end; start += 120) {
      const end = Math.min(start + 120, chapter.end);
      lots.push({ start, end, context: Math.max(chapter.start, start - 6), chapter: chapter.title, chapterStart: chapter.start, key: `${start}:${end}` });
    }
    return lots;
  });
}

export async function analyserLivre(book: Book, available: Voice[], fallback: string,
  request: (input: AnalyseRequest) => Promise<AnalyseStudio>,
  checkpoint: (progress: AnalysisProgress) => Promise<void>, cancelled: () => boolean = () => false,
  options: OptionsAnalyse = {}) {
  preparerDistributionLocale(book, available, fallback);
  const cast = ensureCasting(book);
  const analysis = cast.analysis!;
  const tous = lotsAnalyse(book);
  // Le chapitre à écouter passe devant : la lecture peut démarrer pendant que
  // le reste du livre continue d'être analysé derrière.
  const lots = options.priorite == null ? tous
    : [...tous.filter(lot => lot.chapterStart === options.priorite), ...tous.filter(lot => lot.chapterStart !== options.priorite)];
  let done = tous.filter(lot => analysis.completed.includes(lot.key)).length;
  // Les rôles sans réplique (anciennes analyses) ne partent pas au studio : ils
  // ne doivent ni consommer la limite de 200 ni revenir comme des personnages.
  const visibles = () => {
    const utilises = new Set(Object.values(cast.assignments));
    const candidats = cast.characters.filter(c => c.id === 'narrator' || utilises.has(c.id) || !roleAuto(c));
    if (candidats.length <= 80) return candidats;
    // Gros casting : le prompt explose s'il embarque 200 personnages à chaque
    // appel. On garde le narrateur, les rôles corrigés à la main et les plus
    // bavards ; la passe CAST peut réintroduire un locuteur rare du lot.
    const compte = new Map<string, number>();
    for (const id of Object.values(cast.assignments)) compte.set(id, (compte.get(id) ?? 0) + 1);
    const manuels = new Set(Object.entries(cast.manualAssignments ?? {})
      .filter(([, manuel]) => manuel).map(([index]) => cast.assignments[Number(index)]));
    const poids = (c: typeof candidats[number]) =>
      c.id === 'narrator' || manuels.has(c.id) ? Number.MAX_SAFE_INTEGER : compte.get(c.id) ?? 0;
    return [...candidats].sort((a, b) => poids(b) - poids(a)).slice(0, 80);
  };
  const chapitreComplet = (chapterStart: number) =>
    tous.filter(lot => lot.chapterStart === chapterStart).every(lot => analysis.completed.includes(lot.key));
  const annonces = new Set<number>();
  const annoncer = (chapterStart: number) => {
    if (annonces.has(chapterStart) || !chapitreComplet(chapterStart)) return;
    annonces.add(chapterStart);
    options.chapitrePret?.(chapterStart);
  };
  if (options.priorite != null) annoncer(options.priorite);
  for (const lot of lots) {
    if (analysis.completed.includes(lot.key)) continue;
    if (cancelled()) break;
    await checkpoint({ done, total: tous.length, chapter: lot.chapter });
    try {
      const result = await request({ titre: book.title.slice(0, 120), phrases: book.segments.slice(lot.context, lot.end),
        personnages: visibles().slice(0, 200).map(c => ({ id: c.id === 'narrator' ? 'narrateur' : c.sourceId || c.id,
          nom: c.name, genre: c.gender || 'indetermine', role: c.id === 'narrator' ? 'narrateur' : 'personnage' })) });
      if (cancelled()) break;
      if (!Array.isArray(result.personnages) || !Array.isArray(result.locuteurs) || result.locuteurs.length !== lot.end - lot.context ||
          result.locuteurs.some(id => typeof id !== 'string' || !id.trim()) ||
          result.personnages.some(p => !p || typeof p.id !== 'string' || typeof p.nom !== 'string')) {
        throw new Error('Le studio a renvoyé une analyse incomplète. Reprenez la préparation pour réessayer ce passage.');
      }
      const known = new Set(result.personnages.map(p => p.id));
      if (result.locuteurs.some(id => !known.has(id) && id !== 'narrateur' && id !== 'narrator')) {
        throw new Error('Un locuteur manque dans la réponse du studio. Reprenez la préparation.');
      }
      appliquerAnalyse(cast, { ...result, locuteurs: result.locuteurs.slice(lot.start - lot.context) },
        voixParGenreParDefaut(voixLocales(available).filter(v => v.installed), fallback), lot.start);
      proposerVoix(cast, available, fallback, book.language);
      analysis.completed.push(lot.key); done++;
      analysis.state = done === tous.length ? 'ready' : 'partial'; delete analysis.error;
      annoncer(lot.chapterStart);
    } catch (error) {
      analysis.state = 'error'; analysis.error = error instanceof Error ? error.message : String(error);
      await checkpoint({ done, total: tous.length, chapter: lot.chapter });
      throw error;
    }
    await checkpoint({ done, total: tous.length, chapter: lot.chapter });
  }
  return { done, total: tous.length };
}
