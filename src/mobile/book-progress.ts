import { lotsAnalyse, type AnalysisProgress } from './casting-analysis';
import { besoinsVoix, roleAuto } from './casting';
import { chapterAt } from './books';
import type { Book, Voice } from './types';

export type EtatEtape = 'done' | 'running' | 'todo' | 'error';

export interface EtapeLivre {
  id: 'paragraphes' | 'analyse' | 'voix' | 'ecoute';
  titre: string;
  detail: string;
  pct: number;
  etat: EtatEtape;
  action: string;
  libelle: string;
}

export interface ContexteEtapes {
  busy?: boolean;
  progress?: AnalysisProgress;
  /** Texte de la séquence « Préparer et écouter » quand elle tourne. */
  setup?: string;
  /** Une IA est configurée : sans elle, le repérage local est l'état final. */
  ia?: boolean;
}

const phases = { personnages: 'Personnages', attribution: 'Attribution', verification: 'Relecture' } as const;
const pourcent = (fait: number, total: number) => total > 0 ? Math.round(fait / total * 100) : 0;

/** Les quatre étapes d'un livre, avec leur avancement réel. Les pourcentages
 *  parlent du travail attendu : 100 % signifie « rien à relancer » pour l'étape,
 *  pas seulement « ça a commencé ». */
export function etapesLivre(book: Book, available: Voice[], contexte: ContexteEtapes = {}): EtapeLivre[] {
  const lots = lotsAnalyse(book);
  const analysis = book.casting?.analysis;
  const completes = new Set(analysis?.completed ?? []);
  const lotsFaits = (chapterStart?: number) => lots.filter(l =>
    (chapterStart === undefined || l.chapterStart === chapterStart) && completes.has(l.key)).length;

  const paragraphes = !!book.paragraphs?.length && book.paragraphs.length === book.segments.length;
  const chapitre = chapterAt(book);
  const lotsChapitre = lots.filter(l => l.chapterStart === chapitre.start);
  const faitsChapitre = lotsChapitre.filter(l => completes.has(l.key)).length;

  // 1. Paragraphes : prérequis de la navigation, indépendant de l'IA.
  const etapeParagraphes: EtapeLivre = {
    id: 'paragraphes', titre: 'Paragraphes',
    detail: paragraphes ? `${book.segments.length} phrases numérotées` : 'À reconstruire pour la navigation',
    pct: paragraphes ? 100 : 0, etat: paragraphes ? 'done' : 'todo',
    action: 'reparagrapher', libelle: 'Reconstruire',
  };

  // 2. Analyse fine : 100 % = tous les lots traités (ou repérage local assumé).
  const total = lots.length;
  const faits = lotsFaits();
  const chapitresFaits = book.chapters.filter(c =>
    lots.filter(l => l.chapterStart === c.start).every(l => completes.has(l.key))).length;
  const phase = contexte.progress?.phase;
  let analyseEtat: EtatEtape = 'todo';
  let analyseDetail: string;
  if (contexte.busy) {
    analyseEtat = 'running';
    analyseDetail = `${phase ? phases[phase] : 'Analyse'} · ${contexte.progress?.done ?? faits}/${contexte.progress?.total ?? total} blocs`;
  } else if (analysis?.state === 'error') {
    analyseEtat = 'error';
    analyseDetail = `Interrompue · ${analysis.error ?? 'à reprendre'}`;
  } else if (analysis?.state === 'ready') {
    analyseEtat = 'done';
    analyseDetail = `${book.chapters.length}/${book.chapters.length} chapitres · ${total} blocs`;
  } else if (!contexte.ia && book.casting) {
    analyseEtat = 'done';
    analyseDetail = `Repérage local · ${Object.keys(book.casting.assignments).length} phrases attribuées`;
  } else if (faits > 0) {
    analyseDetail = `${chapitresFaits}/${book.chapters.length} chapitres · ${faits}/${total} blocs`;
  } else {
    analyseDetail = 'Pas encore analysé';
  }
  const etapeAnalyse: EtapeLivre = {
    id: 'analyse', titre: 'Analyse des personnages',
    detail: analyseDetail,
    pct: contexte.busy && contexte.progress
      ? pourcent(contexte.progress.done, contexte.progress.total)
      : analyseEtat === 'done' && !contexte.ia ? 100 : pourcent(faits, total),
    etat: analyseEtat, action: 'reanalyser', libelle: 'Relancer',
  };

  // 3. Voix : chaque rôle visible doit avoir un timbre distinct et adapté.
  let voixPct = 0, voixEtat: EtatEtape = 'todo', voixDetail = 'En attente de l’analyse';
  if (book.casting) {
    const { missing } = besoinsVoix(book.casting, available, book.language);
    const utilises = new Set(Object.values(book.casting.assignments));
    const roles = book.casting.characters.filter(c => c.id === 'narrator' || utilises.has(c.id) || !roleAuto(c));
    const ok = Math.max(0, roles.length - missing.length);
    voixPct = roles.length ? pourcent(ok, roles.length) : 100;
    voixEtat = missing.length ? 'todo' : 'done';
    voixDetail = !roles.length ? 'Aucun personnage à doubler'
      : missing.length ? `${ok}/${roles.length} personnages · ${missing.length} voix à compléter`
      : `${roles.length} personnages avec une voix`;
  }
  const etapeVoix: EtapeLivre = {
    id: 'voix', titre: 'Voix des personnages', detail: voixDetail,
    pct: voixPct, etat: voixEtat, action: 'casting',
    libelle: voixEtat === 'done' ? 'Vérifier' : 'Choisir',
  };

  // 4. Écoute : le chapitre où l'on en est doit être analysé pour démarrer.
  const chapitrePret = !contexte.ia || lotsChapitre.length === 0 ? 100 : pourcent(faitsChapitre, lotsChapitre.length);
  const etapeEcoute: EtapeLivre = {
    id: 'ecoute', titre: `Écoute · ${chapitre.title}`,
    detail: contexte.setup ? contexte.setup
      : chapitrePret === 100 ? 'Prêt à écouter'
      : `${faitsChapitre}/${lotsChapitre.length} blocs du chapitre`,
    pct: contexte.setup ? pourcent(faitsChapitre, lotsChapitre.length) : chapitrePret,
    etat: contexte.setup ? 'running' : chapitrePret === 100 ? 'done' : 'todo',
    action: 'prepare-book', libelle: 'Préparer',
  };

  return [etapeParagraphes, etapeAnalyse, etapeVoix, etapeEcoute];
}
