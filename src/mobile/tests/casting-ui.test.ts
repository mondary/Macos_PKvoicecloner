// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults, type Book, type Voice } from '../types';
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => {}), analyser: vi.fn(), models: vi.fn(), installModel: vi.fn(), load: vi.fn(async () => {}), pause: vi.fn(async () => {}) }));
vi.mock('../storage', () => ({ library: { save: mocks.save } }));
vi.mock('../engine', () => ({ native: true, Reader: { analyser: mocks.analyser, models: mocks.models, installModel: mocks.installModel }, audio: { pause: mocks.pause, load: mocks.load, play: vi.fn() } }));
import { openCasting } from '../casting-ui';

const available: Voice[] = [
  { id: 'neural:tom', name: 'Tom', language: 'fr', kind: 'neural', installed: true },
  { id: 'neural:siwis', name: 'Siwis', language: 'fr', kind: 'neural', installed: true },
];
const bookFixture = (): Book => ({ id: crypto.randomUUID(), title: 'La rencontre', author: '', language: 'fr', format: 'TXT', color: 0,
  segments: ['La nuit tombe.', '— Bonjour, dit Pierre.', '— Bonsoir, répondit Alice.'], chapters: [{ title: 'La rencontre', start: 0, end: 3 }],
  position: 0, completed: false, added: 0, opened: 0, bookmarks: [] });
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<button id="trigger">Voix</button><dialog id="sheet"></dialog>';
  const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  sheet.showModal = () => { sheet.open = true; };
  sheet.close = () => { sheet.open = false; sheet.dispatchEvent(new Event('close')); };
  mocks.models.mockResolvedValue({ voices: available, downloads: {} });
  mocks.analyser.mockResolvedValue({ personnages: [
    { id: 'narrateur', nom: 'Narrateur', genre: 'indetermine', role: 'narrateur' },
    { id: 'pierre', nom: 'Pierre', genre: 'homme', role: 'personnage' },
    { id: 'alice', nom: 'Alice', genre: 'femme', role: 'personnage' },
  ], locuteurs: ['narrateur', 'pierre', 'alice'] });
});
const show = (title: string, body: string) => {
  const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  sheet.innerHTML = `<h2>${title}</h2>${body}`; sheet.showModal();
};
describe('parcours personnages → voix', () => {
  it('analyse automatiquement le livre puis demande seulement de valider les voix', async () => {
    const book = bookFixture();
    await openCasting(book, available, { ...defaults, server: 'http://studio', token: 'code-test' }, show, () => {});
    await vi.waitFor(() => expect(document.querySelector('.casting-summary')?.textContent).toContain('3 phrases attribuées automatiquement'));
    expect(mocks.analyser).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-character]')).toHaveLength(3);
    expect(document.querySelector<HTMLDetailsElement>('#casting-advanced')?.open).toBe(false);
    expect(document.body.textContent).not.toContain('Attribution des passages');
    const alice = book.casting!.characters.findIndex(c => c.name === 'Alice');
    const select = document.querySelector<HTMLSelectElement>(`#cast-voice-${alice}`)!;
    select.value = 'neural:tom'; select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-cast="save"]')!.click();
    await vi.waitFor(() => expect(document.querySelector<HTMLDialogElement>('#sheet')!.open).toBe(false));
    expect(book.casting!.characters[alice]).toMatchObject({ voice: 'neural:tom', automaticVoice: false });
    expect(mocks.load).toHaveBeenCalledWith(book, expect.anything());
  });

  it('signale une analyse interrompue et laisse les corrections facultatives repliées', async () => {
    mocks.analyser.mockRejectedValue(new Error('Le fournisseur IA a atteint sa limite d’usage.'));
    const book = bookFixture();
    await openCasting(book, available, { ...defaults, server: 'http://studio', token: 'code-test' }, show, () => {});
    await vi.waitFor(() => expect(document.querySelector('.casting-summary')?.textContent).toContain('limite d’usage'));
    expect(book.casting!.analysis!.state).toBe('error');
    expect(document.querySelector<HTMLDetailsElement>('#casting-advanced')?.open).toBe(false);
    expect(document.querySelector('[data-cast="analyse"]')?.textContent).toContain('tout le livre');
    document.querySelector<HTMLDialogElement>('#sheet')!.close();
  });

  it('télécharge les voix manquantes et les associe aux rôles après installation vérifiée', async () => {
    const inventory = available.map(v => ({ ...v, installed: false }));
    mocks.models.mockImplementation(async () => ({ voices: inventory, downloads: {} }));
    mocks.installModel.mockImplementation(async ({ id }: { id: string }) => { inventory.find(v => v.id === id)!.installed = true; });
    const book = bookFixture();
    await openCasting(book, inventory, { ...defaults, server: 'http://studio', token: 'code-test' }, show, () => {});
    await vi.waitFor(() => expect(document.querySelector<HTMLFieldSetElement>('.casting-controls')?.disabled).toBe(false));
    expect(document.querySelector('#casting-needs')?.textContent).toContain('2 voix');
    document.querySelector<HTMLButtonElement>('[data-cast="download"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('#casting-status')?.textContent).toContain('Voix installées'));
    expect(mocks.installModel).toHaveBeenCalledTimes(2);
    expect(book.casting!.characters.find(c => c.name === 'Pierre')?.voice).toBe('neural:tom');
    expect(book.casting!.characters.find(c => c.name === 'Alice')?.voice).toBe('neural:siwis');
    expect(document.querySelector('#casting-needs')).toBeNull();
    document.querySelector<HTMLDialogElement>('#sheet')!.close();
  });
});
