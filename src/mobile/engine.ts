import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Book, Settings, Voice, Playback } from './types';
import { speechProfile } from './casting';
import type { AnalyseRequest } from './casting-analysis';

interface ReaderPlugin {
  voices(): Promise<{ voices: Voice[] }>;
  models(): Promise<{ voices: Voice[]; downloads: Record<string, { progress: number; error?: string }> }>;
  installModel(options: { id: string }): Promise<void>;
  removeModel(options: { id: string }): Promise<void>;
  voiceSettings(): Promise<void>;
  connect(options: { server: string; token: string }): Promise<{ voices: Voice[] }>;
  analyser(options: AnalyseRequest & { server: string; token: string }): Promise<{
    personnages: { id: string; nom: string; genre: string; role: string }[]; locuteurs: string[];
  }>;
  load(options: Record<string, unknown>): Promise<void>;
  command(options: { action: string; index?: number; rate?: number; minutes?: number; end?: number }): Promise<void>;
  getState(): Promise<Playback>;
  clearAudio(options: { bookId: string }): Promise<void>;
  addListener(event: 'state', callback: (state: Playback) => void): Promise<PluginListenerHandle>;
}
interface UpdatePlugin {
  check(): Promise<{
    current: string; version?: string; available: boolean;
    url?: string; size?: number; digest?: string; notes?: string; page?: string;
  }>;
  download(options: { url: string; version: string; digest?: string; size?: number }): Promise<{ path: string }>;
  install(options: { path: string }): Promise<void>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  addListener(event: 'progress', callback: (progress: { progress: number }) => void): Promise<PluginListenerHandle>;
}
export const native = Capacitor.isNativePlatform();
export const Reader = registerPlugin<ReaderPlugin>('Reader');
/** Mise à jour intégrée : vérification GitHub, téléchargement et installateur Android. */
export const Update = registerPlugin<UpdatePlugin>('Update');
export const modelCatalog: Voice[] = [
  { id: 'neural:siwis', name: 'Siwis', language: 'fr-FR', kind: 'neural', detail: 'Français · Piper · douce et posée', size: 20.9, installed: false },
  { id: 'neural:tom', name: 'Tom', language: 'fr-FR', kind: 'neural', detail: 'Français · Piper · claire et chaleureuse', size: 21, installed: false },
  { id: 'neural:gilles', name: 'Gilles', language: 'fr-FR', kind: 'neural', detail: 'Français · Piper · voix masculine', size: 21.2, installed: false },
  { id: 'neural:upmc', name: 'UPMC · Jessica', language: 'fr-FR', kind: 'neural', detail: 'Français · Piper · voix féminine', size: 22.6, installed: false },
  { id: 'neural:upmc_pierre', name: 'UPMC · Pierre', language: 'fr-FR', kind: 'neural', detail: 'Français · Piper · voix masculine · même téléchargement que Jessica', size: 22.6, installed: false },
  { id: 'neural:lessac', name: 'Lessac', language: 'en-US', kind: 'neural', detail: 'English · Piper · récit naturel', size: 21, installed: false },
];

class AudioEngine {
  state: Playback = { bookId: '', index: 0, playing: false, loading: false };
  onChange: (state: Playback) => void = () => {};
  private book?: Book;
  private settings?: Settings;
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private listener?: PluginListenerHandle;
  async init() {
    if (native) {
      this.listener = await Reader.addListener('state', s => this.update(s));
      this.update(await Reader.getState());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) void Reader.getState().then(s => this.update(s)); });
    }
  }
  private update(state: Playback) { this.state = state; this.onChange({ ...state }); }
  async voices(): Promise<Voice[]> {
    if (native) return (await Reader.voices()).voices;
    if (!('speechSynthesis' in window)) return [];
    return [{ id: 'system:default', name: 'Voix du navigateur', language: 'fr-FR', kind: 'system', installed: true, detail: 'Aperçu web · dépend du navigateur' }, ...speechSynthesis.getVoices().map(v => ({ id:`web:${v.voiceURI}`, name:v.name, language:v.lang, kind:'system' as const, installed:true, network:!v.localService }))];
  }
  async load(book: Book, settings: Settings) {
    this.book = book; this.settings = { ...settings };
    if (native) {
      await Reader.load({ bookId:book.id, title:book.title.replace(/\n/g,' '), segments:book.segments, casting:book.casting, index:book.position, language:book.language, ...settings });
      return;
    }
    this.stopWeb();
    this.update({ bookId:book.id, index:book.position, playing:false, loading:false });
  }
  async play() {
    if (native) return Reader.command({ action:'play' });
    if (!this.book || !this.settings) return;
    const profile = speechProfile(this.book, this.settings, this.state.index);
    if (!profile.voice.startsWith('system:') && !profile.voice.startsWith('web:')) throw new Error('Installe l’APK Android pour utiliser les voix téléchargées ou clonées.');
    if (!('speechSynthesis' in window)) throw new Error('La synthèse vocale n’est pas disponible dans ce navigateur.');
    this.update({ ...this.state, playing:true, error:'' }); this.speak();
  }
  private speak() {
    if (!this.book || !this.settings || !this.state.playing) return;
    const epoch = ++this.epoch;
    const text = this.book.segments[this.state.index];
    if (!text) { this.update({ ...this.state, playing:false }); return; }
    const u = new SpeechSynthesisUtterance(text);
    const profile = speechProfile(this.book, this.settings, this.state.index);
    u.lang = this.book.language; u.rate = profile.rate; u.pitch = profile.pitch;
    u.voice = speechSynthesis.getVoices().find(v => `web:${v.voiceURI}` === profile.voice) ?? speechSynthesis.getVoices().find(v => v.lang.startsWith(this.book!.language.split('-')[0])) ?? null;
    u.onend = () => {
      if (epoch !== this.epoch) return;
      this.update({ ...this.state, index:Math.min(this.state.index + 1, this.book!.segments.length), playing:this.state.index + 1 < this.book!.segments.length });
      if (this.state.playing) this.speak();
    };
    u.onerror = e => { if (epoch === this.epoch && e.error !== 'interrupted' && e.error !== 'canceled') this.update({ ...this.state, playing:false, error:'Cette voix ne peut pas lire ce passage. Choisis une autre voix.' }); };
    speechSynthesis.speak(u);
  }
  private stopWeb() { this.epoch++; if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  async pause() {
    if (native) return Reader.command({ action:'pause' });
    this.stopWeb(); this.update({ ...this.state, playing:false, loading:false });
  }
  async seek(index: number) {
    if (native) return Reader.command({ action:'seek', index });
    const playing = this.state.playing; this.stopWeb();
    this.update({ ...this.state, index:Math.max(0,Math.min(index,(this.book?.segments.length ?? 1)-1)) });
    if (playing) this.speak();
  }
  async rate(rate: number) {
    if (native) return Reader.command({ action:'rate', rate });
    if (this.settings) this.settings.rate = rate;
    if (this.state.playing) { this.stopWeb(); this.speak(); }
  }
  async sleep(minutes: number) {
    if (native) return Reader.command({ action:'sleep', minutes });
    clearTimeout(this.timer);
    const sleepAt = minutes > 0 ? Date.now()+minutes*60000 : 0;
    this.update({ ...this.state, sleepAt });
    if (minutes > 0) this.timer = setTimeout(() => { void this.pause(); this.update({ ...this.state, sleepAt:0 }); },minutes*60000);
  }
}
export const audio = new AudioEngine();
