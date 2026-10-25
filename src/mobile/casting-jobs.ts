import { analyserLivre, type AnalysisProgress } from './casting-analysis';
import { preparerDistributionLocale, proposerVoix } from './casting';
import { configIA, requeteIA, type PhaseIA } from './ia-telephone';
import { native, Reader } from './engine';
import { library } from './storage';
import type { Book, Settings, Voice } from './types';

const jobs = new Map<string, Promise<void>>();
const progress = new Map<string, AnalysisProgress>();
export interface CastingActivity {
  id: string; title: string; state: 'queued' | 'running' | 'done' | 'error';
  source: string; progress?: AnalysisProgress; error?: string; characters?: number;
}
const activities = new Map<string, CastingActivity>();
export const castingActivities = () => [...activities.values()].sort((a, b) =>
  Number(a.state === 'done' || a.state === 'error') - Number(b.state === 'done' || b.state === 'error'));
export function dismissCastingActivity(id: string) {
  if (!jobs.has(id)) activities.delete(id);
}
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
  const ia = native ? configIA(settings) : null;
  const connected = native && settings.server && settings.token;
  const activity: CastingActivity = { id: book.id, title: book.title, state: 'queued',
    source: ia ? `IA · ${ia.modele}` : connected ? 'IA · studio Mac' : 'Repérage local · sans IA' };
  activities.set(book.id, activity);
  const run = async () => {
    activity.state = 'running'; notify(book);
    preparerDistributionLocale(book, available, settings.voice);
    proposerVoix(book.casting!, available, settings.voice, book.language);
    await library.save(book);
    if (book.casting?.analysis?.state === 'ready') return;
    // Priorité à l'IA appelée depuis le téléphone (aucun Mac requis) ; la
    // passerelle du studio reste le repli, puis le repérage local seul.
    if (ia) {
      const phase = (value: PhaseIA) => {
        const courant = progress.get(book.id);
        if (courant) { courant.phase = value; activity.progress = { ...courant }; notify(book); }
      };
      await analyserLivre(book, available, settings.voice, requeteIA(Reader, ia, phase),
        async value => { progress.set(book.id, value); activity.progress = { ...value }; await library.save(book); notify(book); });
      return;
    }
    if (!connected) return;
    const connection = { server: settings.server, token: settings.token };
    await analyserLivre(book, available, settings.voice,
      input => Reader.analyser({ ...input, ...connection }), async value => {
        progress.set(book.id, value);
        activity.progress = { ...value };
        await library.save(book); notify(book);
      });
  };
  const job = queue.then(run).then(() => {
    activity.state = 'done';
    activity.characters = book.casting?.characters.filter(c => c.id !== 'narrator').length ?? 0;
  }).catch(error => {
    activity.state = 'error';
    activity.error = error instanceof Error ? error.message : String(error);
    throw error;
  }).finally(() => { jobs.delete(book.id); progress.delete(book.id); notify(book); });
  jobs.set(book.id, job); notify(book);
  queue = job.catch(() => {});
  return job;
}
