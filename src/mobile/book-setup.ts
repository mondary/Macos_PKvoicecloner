import { besoinsVoix, proposerVoix, speechProfile } from './casting';
import { prepareCasting } from './casting-jobs';
import { chapterAt } from './books';
import { audio, native, Reader } from './engine';
import { library } from './storage';
import type { Book, Chapter, Settings, Voice } from './types';

/** Chapitres dont chaque phrase a une voix téléchargeable (Piper) : seuls eux
 *  peuvent être mis en cache hors ligne ; une voix du téléphone se lit en direct. */
export function chapitresPreparables(book: Book, settings: Settings): { chapitre: Chapter; preparable: boolean }[] {
  return book.chapters.map(chapitre => ({
    chapitre,
    preparable: book.segments.slice(chapitre.start, chapitre.end)
      .every((_, offset) => !speechProfile(book, settings, chapitre.start + offset).voice.startsWith('system:')),
  }));
}

const installer = async (voice: Voice, statut: (texte: string) => void) => {
  await Reader.installModel({ id: voice.id });
  while (true) {
    const result = await Reader.models();
    const state = result.downloads[voice.id];
    if (state?.error) throw new Error(`${voice.name} : ${state.error}`);
    if (result.voices.find(v => v.id === voice.id)?.installed) return;
    statut(`${voice.name} : ${Math.round(state?.progress || 0)} %`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

/** Télécharge les voix manquantes proposées puis réassocie les timbres. Les
 *  téléchargements sont indépendants du service audio : ils peuvent continuer
 *  pendant l'écoute. Retourne le nombre de timbres installés. */
async function telechargerVoixManquantes(book: Book, available: Voice[], settings: Settings,
  statut: (texte: string) => void): Promise<number> {
  const plan = besoinsVoix(book.casting!, available, book.language);
  if (!plan.downloads.length) return 0;
  for (const item of plan.downloads) {
    statut(`Téléchargement de ${item.voices.map(v => v.name).join(' + ')}…`);
    await installer(item.voice, statut);
  }
  const catalogue = await Reader.models();
  proposerVoix(book.casting!, catalogue.voices, settings.voice, book.language);
  await library.save(book);
  return plan.downloads.length;
}

/** La séquence complète, chapitre par chapitre : le chapitre à écouter est
 *  analysé en priorité, ses voix sont téléchargées, puis la lecture démarre
 *  pendant que le reste du livre continue d'être analysé en arrière-plan.
 *  Les lots déjà validés sont conservés ; une erreur arrête proprement avec
 *  son message. La mise en cache hors ligne reste disponible depuis le lecteur. */
export async function preparerLivreAudio(book: Book, available: Voice[], settings: Settings,
  statut: (texte: string) => void, demarrerLecture?: () => Promise<void>): Promise<void> {
  if (!native) throw new Error('La préparation complète se lance depuis l’APK Android.');
  const chapitre = chapterAt(book);
  // 1. Analyse du chapitre courant en priorité — on n'attend pas le livre entier.
  const analyse = () => book.casting?.analysis;
  let liberer!: () => void;
  const chapitrePret = new Promise<void>(resolve => { liberer = resolve; });
  statut(`Analyse du chapitre « ${chapitre.title} » en priorité…`);
  const arrierePlan = prepareCasting(book, available, settings, {
    priorite: chapitre.start,
    chapitrePret: start => { if (start === chapitre.start) liberer(); },
  });
  arrierePlan.catch(() => {}); // le rejet est traité par la course ou la suite
  if (analyse()?.state !== 'ready') {
    // Seule une erreur survenant avant la fin du chapitre bloque la lecture.
    await Promise.race([chapitrePret, arrierePlan]);
  }
  // 2. Télécharger les voix manquantes proposées, puis réassocier les timbres.
  if (await telechargerVoixManquantes(book, available, settings, statut)) {
    statut('Voix du chapitre installées.');
  }
  // 3. Lecture immédiate : le reste de l'analyse continue en arrière-plan et
  //    la file est rechargée au prochain changement de chapitre.
  if (demarrerLecture) {
    statut(`Lecture de « ${chapitre.title} » — le reste du livre s’analyse en arrière-plan.`);
    await demarrerLecture();
  } else {
    statut('Rechargement du livre…');
    await audio.pause();
    await audio.load(book, settings);
  }
  // 4. Arrière-plan : fin de l'analyse, voix découvertes en route, statut final.
  void suiteArrierePlan(arrierePlan, book, available, settings, statut);
}

async function suiteArrierePlan(arrierePlan: Promise<void>, book: Book, available: Voice[], settings: Settings,
  statut: (texte: string) => void) {
  try {
    await arrierePlan;
    const resultat = book.casting?.analysis;
    if (resultat?.state !== 'ready') throw new Error(resultat?.error ?? 'L’analyse ne s’est pas terminée. Reprenez-la plus tard.');
    await telechargerVoixManquantes(book, available, settings, () => {});
    statut('Analyse terminée : la distribution s’affine au fil des chapitres. Pour l’écoute hors ligne, « Emporter ce chapitre » reste disponible dans le lecteur.');
  } catch (error) {
    statut(`Analyse interrompue : ${error instanceof Error ? error.message : error} Les lots déjà validés sont conservés.`);
  }
}
