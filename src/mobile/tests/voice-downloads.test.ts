// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ models: vi.fn(), installModel: vi.fn(async () => {}) }));
vi.mock('../engine', () => ({ native: true, Reader: mocks }));
import { DownloadActivityStore, installVoice, voiceDownloads, dismissVoiceDownload, monitorVoiceDownloads, watchVoiceDownloads } from '../voice-downloads';
import { downloadActivityView } from '../activity-view';
import type { Voice } from '../types';
const miro: Voice = { id: 'neural:miro', name: 'Miro', installed: false, language: 'fr-FR', kind: 'neural' };
const snapshot = (progress: number, installed = false, error?: string) => ({
  voices: [{ ...miro, installed }], downloads: { [miro.id]: { progress, error } },
});

describe('notifications fixes des téléchargements', () => {
  it('conserve la tâche jusqu’à installation réelle puis fermeture explicite', () => {
    const store = new DownloadActivityStore();
    store.begin(miro.id, miro.name);
    store.sync(snapshot(42));
    expect(store.list()[0]).toMatchObject({ state: 'running', progress: 42 });
    store.dismiss(miro.id);
    expect(store.list()).toHaveLength(1);
    store.sync(snapshot(100));
    expect(store.list()[0].state).toBe('running');
    store.sync(snapshot(100, true));
    expect(store.list()[0].state).toBe('done');
    expect(downloadActivityView(store.list())).toContain('Miro · 100 % · Installée');
    store.dismiss(miro.id);
    store.sync(snapshot(100, true));
    expect(store.list()).toEqual([]);
    // Un nouveau téléchargement ne reste pas masqué par l'ancien bilan.
    store.sync(snapshot(10));
    expect(store.list()[0]).toMatchObject({ state: 'running', hidden: false });
  });

  it('affiche plusieurs voix et les erreurs échappées sans fermeture automatique', () => {
    const store = new DownloadActivityStore();
    store.begin(miro.id, 'Miro <test>');
    store.begin('neural:tom', 'Tom');
    store.fail(miro.id, 'Réseau <coupé>');
    const html = downloadActivityView(store.list());
    document.body.innerHTML = html;
    expect(html).toContain('Réseau &lt;coupé&gt;');
    expect(document.querySelectorAll('.download-bubble')).toHaveLength(2);
    expect(document.querySelectorAll('[data-action="download-dismiss"]')).toHaveLength(1);
    expect(document.querySelector('[data-action="nav"]')?.getAttribute('aria-label')).toContain('Miro <test>');
  });

  it('suit les progressions par une seule boucle, même en cas de demandes simultanées', async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const unwatch = watchVoiceDownloads(listener);
    try {
      let resolve!: (value: ReturnType<typeof snapshot>) => void;
      mocks.models.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue(snapshot(100, true));
      await installVoice(miro.id, miro.name);
      await monitorVoiceDownloads();
      expect(mocks.models).toHaveBeenCalledTimes(1);
      resolve(snapshot(25));
      await vi.advanceTimersByTimeAsync(0);
      expect(voiceDownloads()[0]).toMatchObject({ state: 'running', progress: 25 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(voiceDownloads()[0].state).toBe('done');
      expect(listener).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mocks.models).toHaveBeenCalledTimes(2);
      expect(voiceDownloads()).toHaveLength(1);
      dismissVoiceDownload(miro.id);
      expect(voiceDownloads()).toEqual([]);
    } finally { unwatch(); vi.useRealTimers(); }
  });
});
