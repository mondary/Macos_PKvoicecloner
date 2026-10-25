import { native, Reader } from './engine';
import type { Voice } from './types';

export interface VoiceDownload {
  id: string; name: string; progress: number; state: 'running' | 'done' | 'error';
  error?: string; hidden?: boolean;
}
type Snapshot = { voices: Voice[]; downloads: Record<string, { progress: number; error?: string }> };

/** Les notifications ne dépendent ni de l'écran ouvert ni d'un toast. Un bilan
 *  fermé n'est pas réaffiché par un ancien résultat natif resté en mémoire. */
export class DownloadActivityStore {
  private entries = new Map<string, VoiceDownload>();
  list() { return [...this.entries.values()].filter(d => !d.hidden); }
  begin(id: string, name: string) {
    this.entries.set(id, { id, name, progress: 0, state: 'running' });
  }
  dismiss(id: string) {
    const entry = this.entries.get(id);
    if (entry && entry.state !== 'running') entry.hidden = true;
  }
  fail(id: string, error: string) {
    const entry = this.entries.get(id);
    if (entry) { entry.state = 'error'; entry.error = error; entry.hidden = false; }
  }
  sync(snapshot: Snapshot) {
    for (const [id, status] of Object.entries(snapshot.downloads)) {
      const previous = this.entries.get(id);
      const voice = snapshot.voices.find(v => v.id === id);
      const progress = Math.max(0, Math.min(100, Number.isFinite(status.progress) ? status.progress : 0));
      // 100 % de transfert ne signifie pas encore « installée ».
      const state = status.error ? 'error' : voice?.installed ? 'done' : 'running';
      const restarted = previous && previous.state !== 'running' && state === 'running';
      this.entries.set(id, { id, name: voice?.name ?? previous?.name ?? id, progress,
        state, error: status.error, hidden: restarted ? false : previous?.hidden });
    }
  }
}

const store = new DownloadActivityStore();
const listeners = new Set<(voices?: Voice[]) => void>();
let polling = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const notify = (voices?: Voice[]) => listeners.forEach(listener => listener(voices));
export const voiceDownloads = () => store.list();
export function watchVoiceDownloads(listener: (voices?: Voice[]) => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function dismissVoiceDownload(id: string) { store.dismiss(id); notify(); }

/** Une seule boucle pour les installations manuelles, les voix proposées et la
 *  préparation du livre. Le natif poursuit le téléchargement indépendamment. */
export async function monitorVoiceDownloads() {
  if (!native || polling) return;
  if (timer) { clearTimeout(timer); timer = undefined; }
  polling = true;
  try {
    const snapshot = await Reader.models();
    store.sync(snapshot); notify(snapshot.voices);
  } catch (error) {
    for (const entry of store.list().filter(d => d.state === 'running')) {
      store.fail(entry.id, `Suivi indisponible : ${error instanceof Error ? error.message : String(error)}`);
    }
    notify();
  } finally {
    polling = false;
    if (store.list().some(d => d.state === 'running')) {
      timer = setTimeout(() => { timer = undefined; void monitorVoiceDownloads(); }, 1000);
    }
  }
}

export async function installVoice(id: string, name = id) {
  store.begin(id, name); notify();
  try {
    await Reader.installModel({ id });
    void monitorVoiceDownloads();
  } catch (error) {
    store.fail(id, error instanceof Error ? error.message : String(error)); notify();
    throw error;
  }
}
