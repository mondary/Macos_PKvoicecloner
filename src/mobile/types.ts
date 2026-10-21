export interface Chapter { title: string; start: number; end: number }
export interface Character { id: string; name: string; voice: string; pitch: number; rate: number }
export interface Casting { enabled: boolean; characters: Character[]; assignments: Record<string, string> }
export interface Book {
  id: string; title: string; author: string; format: string; language: string;
  cover?: string; color: number; segments: string[]; chapters: Chapter[];
  position: number; completed: boolean; added: number; opened: number;
  bookmarks: number[]; sample?: boolean; casting?: Casting;
  /** Paragraphe d'origine de chaque phrase (id stable dans le livre). */
  paragraphs?: number[];
}
export interface Voice {
  id: string; name: string; language: string; kind: 'system' | 'neural' | 'clone';
  detail?: string; installed: boolean; size?: number; network?: boolean;
}
export interface Settings {
  voice: string; rate: number; theme: 'light' | 'dark' | 'paper';
  fontSize: number; layout: 'pages' | 'scroll'; server: string; token: string;
  /** Afficher les voix du téléphone dans toutes les langues (sinon : français seulement). */
  voiceLangues?: boolean;
  /** Vitesse mémorisée par voix : chaque timbre garde la sienne. */
  voiceRates?: Record<string, number>;
}
export interface Playback {
  bookId: string; index: number; playing: boolean; loading: boolean;
  error?: string; sleepAt?: number; preparing?: boolean; prepared?: number; total?: number;
  speaker?: string; voice?: string;
  /** Suivi de lecture : position et durée du passage (WAV), ou plage du mot lu (TTS). */
  position?: number; duree?: number; mot?: { debut: number; fin: number } | null;
}
export const defaults: Settings = { voice: 'system:default', rate: 1, theme: 'light', fontSize: 22, layout: 'pages', server: '', token: '', voiceLangues: false, voiceRates: {} };
