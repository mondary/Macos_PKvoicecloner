export interface Chapter { title: string; start: number; end: number }
export interface Book {
  id: string; title: string; author: string; format: string; language: string;
  cover?: string; color: number; segments: string[]; chapters: Chapter[];
  position: number; completed: boolean; added: number; opened: number;
  bookmarks: number[]; sample?: boolean;
}
export interface Voice {
  id: string; name: string; language: string; kind: 'system' | 'neural' | 'clone';
  detail?: string; installed: boolean; size?: number; network?: boolean;
}
export interface Settings {
  voice: string; rate: number; theme: 'light' | 'dark' | 'paper';
  fontSize: number; server: string; token: string;
}
export interface Playback {
  bookId: string; index: number; playing: boolean; loading: boolean;
  error?: string; sleepAt?: number; preparing?: boolean; prepared?: number; total?: number;
}
export const defaults: Settings = { voice: 'system:default', rate: 1, theme: 'light', fontSize: 22, server: '', token: '' };
