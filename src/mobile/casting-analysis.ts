import { appliquerAnalyse, ensureCasting, preparerDistributionLocale, proposerVoix, voixParGenreParDefaut, voixLocales, type AnalyseStudio, type AnalysePersonnage } from './casting';
import type { Book, Voice } from './types';

export interface AnalyseRequest { titre: string; phrases: string[]; personnages: AnalysePersonnage[] }
export interface AnalysisProgress { done: number; total: number; chapter: string }

/** Lots bornés avec contexte chevauchant. La position, les paragraphes et les
 *  signets restent intacts : l'IA ne réécrit jamais le texte du téléphone. */
export function lotsAnalyse(book: Book) {
  return book.chapters.flatMap(chapter => {
    const lots = [];
    for (let start = chapter.start; start < chapter.end; start += 120) {
      const end = Math.min(start + 120, chapter.end);
      lots.push({ start, end, context: Math.max(chapter.start, start - 6), chapter: chapter.title, key: `${start}:${end}` });
    }
    return lots;
  });
}

export async function analyserLivre(book: Book, available: Voice[], fallback: string,
  request: (input: AnalyseRequest) => Promise<AnalyseStudio>,
  checkpoint: (progress: AnalysisProgress) => Promise<void>, cancelled: () => boolean = () => false) {
  preparerDistributionLocale(book, available, fallback);
  const cast = ensureCasting(book);
  const analysis = cast.analysis!;
  const lots = lotsAnalyse(book);
  let done = lots.filter(lot => analysis.completed.includes(lot.key)).length;
  for (const lot of lots) {
    if (analysis.completed.includes(lot.key)) continue;
    if (cancelled()) break;
    await checkpoint({ done, total: lots.length, chapter: lot.chapter });
    try {
      const result = await request({ titre: book.title.slice(0, 120), phrases: book.segments.slice(lot.context, lot.end),
        personnages: cast.characters.slice(0, 200).map(c => ({ id: c.id === 'narrator' ? 'narrateur' : c.sourceId || c.id,
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
      analysis.state = done === lots.length ? 'ready' : 'partial'; delete analysis.error;
    } catch (error) {
      analysis.state = 'error'; analysis.error = error instanceof Error ? error.message : String(error);
      await checkpoint({ done, total: lots.length, chapter: lot.chapter });
      throw error;
    }
    await checkpoint({ done, total: lots.length, chapter: lot.chapter });
  }
  return { done, total: lots.length };
}
