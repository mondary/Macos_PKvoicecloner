export interface Chapter { title: string; start: number; end: number }
export type Gender = 'homme' | 'femme' | 'indetermine';
export interface Character {
  id: string; name: string; voice: string; pitch: number; rate: number;
  gender?: Gender; sourceId?: string; automaticVoice?: boolean;
  /** Rôle déduit par l'analyse (par opposition à un rôle ajouté à la main). */
  autoRole?: boolean;
}
export interface Casting {
  enabled: boolean; characters: Character[]; assignments: Record<string, string>;
  manualAssignments?: Record<string, boolean>;
  analysis?: { completed: string[]; state: 'local' | 'partial' | 'ready' | 'error'; error?: string };
}
export interface Book {
  id: string; title: string; author: string; format: string; language: string;
  cover?: string; color: number; segments: string[]; chapters: Chapter[];
  position: number; completed: boolean; added: number; opened: number;
  bookmarks: number[]; sample?: boolean; casting?: Casting;
  /** Paragraphe d'origine de chaque phrase (id stable dans le livre). */
  paragraphs?: number[];
  /** Style de chaque phrase : '' | 'i' (italique) | 'q' (citation) | 'iq'. */
  styles?: string[];
}
export interface Voice {
  id: string; name: string; language: string; kind: 'system' | 'neural' | 'clone';
  detail?: string; installed: boolean; size?: number; network?: boolean;
  gender?: Gender; modelId?: string;
}
export interface Settings {
  voice: string; rate: number; theme: 'light' | 'dark' | 'paper';
  fontSize: number; layout: 'pages' | 'scroll'; server: string; token: string;
  /** Afficher les voix du téléphone dans toutes les langues (sinon : français seulement). */
  voiceLangues?: boolean;
  /** Vitesse mémorisée par voix : chaque timbre garde la sienne. */
  voiceRates?: Record<string, number>;
  /** Interligne de lecture (1.6 à 2.1). */
  interligne?: number;
  /** Marges latérales de la page de lecture, en pixels. */
  marges?: number;
  /** Demi-hauteur de la bande de confort du suivi (0,18 serré → 0,35 large). */
  bande?: number;
  /** Lecteur réduit à l'essentiel pendant la lecture. */
  focus?: boolean;
  /** Suivi visuel : mots (karaoké), phrase seule, ou aucun surlignage. */
  surlignage?: 'mots' | 'phrase' | 'aucun';
}
/** Réponse de la vérification de version : release GitHub `pk-…` la plus récente. */
export interface UpdateInfo {
  current: string; version?: string; available: boolean;
  url?: string; size?: number; digest?: string; notes?: string; page?: string;
}
export interface Playback {
  bookId: string; index: number; playing: boolean; loading: boolean;
  error?: string; sleepAt?: number; preparing?: boolean; prepared?: number; total?: number;
  speaker?: string; voice?: string;
  /** Suivi de lecture : position et durée du passage (WAV), ou plage du mot lu (TTS). */
  position?: number; duree?: number; mot?: { debut: number; fin: number } | null;
}
export const defaults: Settings = { voice: 'system:default', rate: 1, theme: 'light', fontSize: 22, layout: 'pages', server: '', token: '', voiceLangues: false, voiceRates: {}, interligne: 1.95, marges: 0, bande: 0.28, surlignage: 'mots' };
