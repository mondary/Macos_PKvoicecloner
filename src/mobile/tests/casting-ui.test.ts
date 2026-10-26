// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaults, type Book, type Voice } from '../types';
import { ensureCasting } from '../casting';
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
    await vi.waitFor(() => expect(book.casting?.analysis?.state).toBe('ready'));
    expect(document.querySelector('.casting-summary')?.textContent).toContain('2 phrases attribuées automatiquement à un personnage');
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

  it('attribue toutes les voix en un geste et enregistre la distribution', async () => {
    const book = bookFixture();
    await openCasting(book, available, { ...defaults, server: 'http://studio', token: 'code-test' }, show, () => {});
    await vi.waitFor(() => expect(document.querySelector('[data-cast="auto"]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('[data-cast="auto"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.casting-auto-note')?.textContent).toContain('voix attribuées'));
    expect(book.casting!.characters.every(c => !!c.voice && c.automaticVoice === false)).toBe(true);
    expect(mocks.save).toHaveBeenCalled();
    document.querySelector<HTMLDialogElement>('#sheet')!.close();
  });

  it('signale une analyse interrompue et laisse les corrections facultatives repliées', async () => {
    mocks.analyser.mockRejectedValue(new Error('Le fournisseur IA a atteint sa limite d’usage.'));
    const book = bookFixture();
    await openCasting(book, available, { ...defaults, server: 'http://studio', token: 'code-test' }, show, () => {});
    await vi.waitFor(() => expect(document.querySelector('.casting-summary')?.textContent).toContain('limite d’usage'));
    expect(book.casting!.analysis!.state).toBe('error');
    expect(document.querySelector('.casting-summary')?.textContent).toContain('analyse du téléphone reste appliquée');
    expect(document.querySelector('[data-cast="analyse"]')).toBeNull();   // plus de bouton « connecter le studio »
    expect(document.querySelector<HTMLDetailsElement>('#casting-advanced')?.open).toBe(false);
    document.querySelector<HTMLDialogElement>('#sheet')!.close();
  });

  it('masque et nettoie les rôles sans réplique hérités d’une ancienne analyse', async () => {
    const book = bookFixture();
    // Rôle hérité d'une ancienne analyse : pas de autoRole, seulement automaticVoice.
    ensureCasting(book).characters.push({ id: 'fantome', name: 'Fantôme', voice: '', pitch: 1, rate: 1, automaticVoice: true });
    await openCasting(book, available, { ...defaults }, show, () => {});
    await vi.waitFor(() => expect(document.querySelector('.casting-summary')?.textContent).toContain('2 phrases attribuées automatiquement'));
    expect(document.querySelectorAll('[data-character]')).toHaveLength(3);
    expect(document.body.textContent).not.toContain('Fantôme');
    document.querySelector<HTMLButtonElement>('[data-cast="save"]')!.click();
    await vi.waitFor(() => expect(book.casting!.characters.some(c => c.id === 'fantome')).toBe(false));
  });

  it('répare un ancien faux rôle avec des phrases avant le premier affichage et montre un passage vérifiable', async () => {
    const book = bookFixture();
    book.segments[0] = 'Exemple : <img src=x onerror=alert(1)>.';
    const cast = ensureCasting(book);
    cast.characters.push({ id: 'exemple', name: 'Exemple', voice: 'neural:tom', pitch: 1, rate: 1, automaticVoice: true });
    cast.assignments = { '0': 'exemple' }; cast.manualAssignments = {};
    cast.analysis = { state: 'local', completed: [] };
    const renders: string[] = [];
    await openCasting(book, available, { ...defaults }, (title, body) => { renders.push(body); show(title, body); }, () => {});
    // Le formulaire reste utilisable pendant l'analyse : on attend le bilan, pas
    // la fin du repérage, pour vérifier que la feuille est déjà interactive.
    await vi.waitFor(() => expect(document.querySelector('.casting-summary')?.textContent).toContain('Les passages incertains restent au narrateur'));
    expect(document.querySelector<HTMLFieldSetElement>('.casting-controls')?.disabled).toBe(false);
    expect(renders.every(body => !body.includes('<legend>Exemple</legend>'))).toBe(true);
    expect(book.casting!.assignments['0']).toBeUndefined();
    expect(mocks.save).toHaveBeenCalledWith(book);
    expect(document.querySelector('.casting-evidence')?.textContent).toContain('— Bonjour, dit Pierre.');
    expect(document.querySelector('#sheet img')).toBeNull();
    document.querySelector<HTMLDialogElement>('#sheet')!.close();
  });

  it('télécharge les voix manquantes et les associe aux rôles après installation vérifiée', async () => {
    const inventory = available.map(v => ({ ...v, installed: false }));
    mocks.models.mockImplementation(async () => ({ voices: inventory, downloads: {} }));
    mocks.installModel.mockImplementation(async ({ id }: { id: string }) => { inventory.find(v => v.id === id)!.installed = true; });
    const book = bookFixture();
    await openCasting(book, inventory, { ...defaults, server: 'http://studio', token: 'code-test' }, show, () => {});
    await vi.waitFor(() => expect(document.querySelector<HTMLFieldSetElement>('.casting-controls')?.disabled).toBe(false));
    expect(document.querySelector('#casting-needs')?.textContent).toContain('2 timbres supplémentaires');
    document.querySelector<HTMLButtonElement>('[data-cast="download"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('#casting-status')?.textContent).toContain('Voix installées'));
    expect(mocks.installModel).toHaveBeenCalledTimes(2);
    expect(book.casting!.characters.find(c => c.name === 'Pierre')?.voice).toBe('neural:tom');
    expect(book.casting!.characters.find(c => c.name === 'Alice')?.voice).toBe('neural:siwis');
    expect(document.querySelector('#casting-needs')).toBeNull();
    document.querySelector<HTMLDialogElement>('#sheet')!.close();
  });
});
