import { analyserLivre, type AnalysisProgress } from './casting-analysis';
import { preparerDistributionLocale, proposerVoix } from './casting';
import { configIA, requeteIA, type PhaseIA } from './ia-telephone';
import { native, Reader } from './engine';
import { library } from './storage';
import type { Book, Settings, Voice } from './types';

const jobs = new Map<string, Promise<void>>();
const progress = new Map<string, AnalysisProgress>();
const listeners = new Set<(id: string) => void>();
let queue = Promise.resolve();
export const castingBusy = (book: Book) => jobs.has(book.id);
export const castingProgress = (book: Book) => progress.get(book.id);
export function watchCasting(listener: (id: string) => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
const notify = (book: Book) => listeners.forEach(fn => fn(book.id));

/** Les imports multiples sont préparés en série ; fermer la feuille ne perd pas
 *  le travail. Chaque lot est sauvegardé, une relance reprend les lots manquants. */
export function prepareCasting(book: Book, available: Voice[], settings: Settings): Promise<void> {
  const existing = jobs.get(book.id);
  if (existing) return existing;
  preparerDistributionLocale(book, available, settings.voice);
  const run = async () => {
    proposerVoix(book.casting!, available, settings.voice, book.language);
    await library.save(book);
    if (book.casting?.analysis?.state === 'ready') return;
    // Priorité à l'IA appelée depuis le téléphone (aucun Mac requis) ; la
    // passerelle du studio reste le repli, puis le repérage local seul.
    const ia = native ? configIA(settings) : null;
    if (ia) {
      const phase = (value: PhaseIA) => {
        const courant = progress.get(book.id);
        if (courant) { courant.phase = value; notify(book); }
      };
      await analyserLivre(book, available, settings.voice, requeteIA(Reader, ia, phase),
        async value => { progress.set(book.id, value); await library.save(book); notify(book); });
      return;
    }
    const connected = native && settings.server && settings.token;
    if (!connected) return;
    const connection = { server: settings.server, token: settings.token };
    await analyserLivre(book, available, settings.voice,
      input => Reader.analyser({ ...input, ...connection }), async value => {
        progress.set(book.id, value);
        await library.save(book); notify(book);
      });
  };
  const job = queue.then(run).finally(() => { jobs.delete(book.id); progress.delete(book.id); notify(book); });
  jobs.set(book.id, job); notify(book);
  queue = job.catch(() => {});
  return job;
}
