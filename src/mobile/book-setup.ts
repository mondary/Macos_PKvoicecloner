import { besoinsVoix, proposerVoix, speechProfile } from './casting';
import { prepareCasting } from './casting-jobs';
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

/** Attend la fin de la préparation audio d'un chapitre ; la lecture démarrée
 *  par l'utilisateur annule la séquence (le service garde la main). */
const attendrePreparation = async (book: Book) => {
  while (true) {
    const state = await Reader.getState();
    if (state.error) throw new Error(state.error);
    if (state.playing || state.loading) throw new Error('Lecture démarrée : la préparation s’arrête, reprenez-la plus tard.');
    if (!state.preparing) return;
    await new Promise(resolve => setTimeout(resolve, 600));
  }
};

/** La séquence complète, comme « Tout automatiser » du studio : analyse des
 *  personnages (IA du téléphone ou repérage local), téléchargement des voix
 *  manquantes, puis mise en cache audio du livre, chapitre par chapitre.
 *  Chaque étape est signalée ; une erreur arrête proprement avec son message. */
export async function preparerLivreAudio(book: Book, available: Voice[], settings: Settings,
  statut: (texte: string) => void): Promise<void> {
  if (!native) throw new Error('La préparation complète se lance depuis l’APK Android.');
  // 1. Analyse des personnages, si elle n'est pas déjà terminée.
  const analyse = () => book.casting?.analysis;
  if (analyse()?.state !== 'ready') {
    statut('Analyse des personnages…');
    await prepareCasting(book, available, settings);
    const resultat = analyse();
    if (resultat?.state !== 'ready') {
      throw new Error(resultat?.error ?? 'L’analyse ne s’est pas terminée. Reprenez la préparation.');
    }
  }
  // 2. Télécharger les voix manquantes proposées, puis réassocier les timbres.
  const plan = besoinsVoix(book.casting!, available, book.language);
  if (plan.downloads.length) {
    for (const item of plan.downloads) {
      statut(`Téléchargement de ${item.voices.map(v => v.name).join(' + ')}…`);
      await installer(item.voice, statut);
    }
    const catalogue = await Reader.models();
    proposerVoix(book.casting!, catalogue.voices, settings.voice, book.language);
    await library.save(book);
  }
  // 3. Recharger la file de lecture avec la distribution à jour.
  statut('Rechargement du livre…');
  await audio.pause();
  await audio.load(book, settings);
  // 4. Mise en cache audio, chapitre par chapitre (reprise possible : les
  //    passages déjà générés sont sautés par leur empreinte).
  const chapitres = chapitresPreparables(book, settings);
  const preparables = chapitres.filter(c => c.preparable);
  let faits = 0;
  for (const { chapitre } of preparables) {
    statut(`Préparation audio · chapitre ${faits + 1} / ${preparables.length}…`);
    await Reader.command({ action: 'prepare', index: chapitre.start, end: chapitre.end });
    await attendrePreparation(book);
    faits++;
  }
  const exclus = chapitres.length - preparables.length;
  statut(exclus
    ? `Livre prêt : ${faits} chapitre${faits > 1 ? 's' : ''} mis en cache · ${exclus} en voix du téléphone (lecture en direct).`
    : `Livre prêt : ${faits} chapitre${faits > 1 ? 's' : ''} mis en cache.`);
}
