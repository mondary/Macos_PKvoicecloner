import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults, type Book } from '../types';
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => {}), installModel: vi.fn(), models: vi.fn(), load: vi.fn(async () => {}), pause: vi.fn(async () => {}) }));
vi.mock('../storage', () => ({ library: { save: mocks.save } }));
vi.mock('../engine', () => ({ native: false, Reader: { installModel: mocks.installModel, models: mocks.models }, audio: { pause: mocks.pause, load: mocks.load } }));
vi.mock('../casting-jobs', () => ({ prepareCasting: vi.fn(async () => {}) }));
import { chapitresPreparables } from '../book-setup';

function livre(): Book {
  return { id: 'seq', title: 'Séquence', author: '', format: 'TXT', language: 'fr', color: 0,
    segments: ['Un récit.', '— Bonjour, dit Pierre.', '— Salut !', 'La nuit tombe.'],
    chapters: [{ title: 'Un', start: 0, end: 2 }, { title: 'Deux', start: 2, end: 4 }],
    position: 0, completed: false, added: 0, opened: 0, bookmarks: [] };
}

describe('chapitresPreparables', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un livre sans distribution n’est pas préparable (voix du téléphone)', () => {
    const chapitres = chapitresPreparables(livre(), defaults);
    expect(chapitres.map(c => c.preparable)).toEqual([false, false]);
  });

  it('un chapitre est préparable quand toutes ses phrases ont une voix téléchargeable', () => {
    const book = livre();
    book.casting = { enabled: true, characters: [
      { id: 'narrator', name: 'Narrateur', voice: 'neural:siwis', pitch: 1, rate: 1 },
      { id: 'pierre', name: 'Pierre', voice: 'neural:tom', pitch: 1, rate: 1 },
    ], assignments: { '1': 'pierre' } };
    let chapitres = chapitresPreparables(book, defaults);
    expect(chapitres.map(c => c.preparable)).toEqual([true, true]);
    // Un rôle repassé sur la voix du téléphone bloque son chapitre, pas l’autre.
    book.casting.characters[1].voice = 'system:default';
    chapitres = chapitresPreparables(book, defaults);
    expect(chapitres.map(c => c.preparable)).toEqual([false, true]);
  });
});
