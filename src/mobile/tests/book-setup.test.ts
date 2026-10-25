import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults, type Book } from '../types';
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => {}), installModel: vi.fn(), models: vi.fn(async () => ({ voices: [], downloads: {} })), load: vi.fn(async () => {}), pause: vi.fn(async () => {}) }));
vi.mock('../storage', () => ({ library: { save: mocks.save } }));
vi.mock('../engine', () => ({ native: true, Reader: { installModel: mocks.installModel, models: mocks.models }, audio: { pause: mocks.pause, load: mocks.load } }));
vi.mock('../casting-jobs', () => ({ prepareCasting: vi.fn() }));
import { chapitresPreparables, preparerLivreAudio } from '../book-setup';
import { prepareCasting } from '../casting-jobs';

function livre(): Book {
  return { id: 'seq', title: 'Séquence', author: '', format: 'TXT', language: 'fr', color: 0,
    segments: ['Un récit.', '— Bonjour, dit Pierre.', '— Salut !', 'La nuit tombe.'],
    chapters: [{ title: 'Un', start: 0, end: 2 }, { title: 'Deux', start: 2, end: 4 }],
    position: 0, completed: false, added: 0, opened: 0, bookmarks: [] };
}
/** Livre sur son chapitre 2, distribution locale prête, analyse non terminée. */
function livreStreaming(): Book {
  const book = livre(); book.position = 2;
  book.casting = { enabled: true, characters: [{ id: 'narrator', name: 'Narrateur', voice: 'system:default', pitch: 1, rate: 1 }], assignments: {}, analysis: { completed: [], state: 'local' } };
  return book;
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

describe('préparer le livre audio en streaming', () => {
  beforeEach(() => vi.clearAllMocks());

  it('démarre la lecture dès le chapitre prioritaire prêt, sans attendre le livre entier', async () => {
    const book = livreStreaming();
    const statuts: string[] = [];
    let libererAnalyse!: () => void;
    const analyse = new Promise<void>(resolve => { libererAnalyse = resolve; });
    let options: { priorite?: number } = {};
    let demandePret = 0;
    vi.mocked(prepareCasting).mockImplementationOnce(async (_b, _v, _s, opts) => {
      options = opts ?? {};
      queueMicrotask(() => { demandePret++; opts?.chapitrePret?.(2); });
      return analyse;
    });
    const lectureDemarree = vi.fn(async () => {});
    await preparerLivreAudio(book, [], defaults, texte => statuts.push(texte), lectureDemarree);
    // Le premier plan est terminé : le chapitre 2 est prêt, la lecture est lancée,
    // et l'analyse du reste du livre tourne toujours en arrière-plan.
    expect(demandePret).toBe(1);
    expect(options.priorite).toBe(2);
    expect(lectureDemarree).toHaveBeenCalledTimes(1);
    expect(statuts.some(t => t.includes('en priorité'))).toBe(true);
    // Fin de l'analyse en arrière-plan : bilan signalé, lots conservés.
    book.casting!.analysis!.state = 'ready';
    libererAnalyse();
    await vi.waitFor(() => expect(statuts.some(t => t.includes('Analyse terminée'))).toBe(true));
  });

  it('survit à une erreur d’analyse après le démarrage de la lecture', async () => {
    const book = livreStreaming();
    const statuts: string[] = [];
    let echouer!: (erreur: Error) => void;
    const analyse = new Promise<void>((_resolve, reject) => { echouer = reject; });
    vi.mocked(prepareCasting).mockImplementationOnce(async (_b, _v, _s, opts) => {
      queueMicrotask(() => opts?.chapitrePret?.(2));
      return analyse;
    });
    await preparerLivreAudio(book, [], defaults, texte => statuts.push(texte), async () => {});
    echouer(new Error('Quota atteint'));
    await vi.waitFor(() => expect(statuts.some(t => t.includes('Analyse interrompue') && t.includes('Quota atteint'))).toBe(true));
  });

  it('remonte une erreur survenant avant la fin du chapitre à écouter', async () => {
    const book = livreStreaming();
    vi.mocked(prepareCasting).mockImplementationOnce(async () => { throw new Error('Réseau coupé'); });
    await expect(preparerLivreAudio(book, [], defaults, () => {}, async () => {})).rejects.toThrow('Réseau coupé');
  });

  it('sans lecture demandée, recharge la file avec la distribution du chapitre prêt', async () => {
    const book = livreStreaming();
    vi.mocked(prepareCasting).mockImplementationOnce(async (_b, _v, _s, opts) => {
      queueMicrotask(() => opts?.chapitrePret?.(2));
      return Promise.resolve();
    });
    await preparerLivreAudio(book, [], defaults, () => {});
    expect(mocks.pause).toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledWith(book, defaults);
  });
});
