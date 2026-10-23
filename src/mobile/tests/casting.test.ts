import { describe, it, expect } from 'vitest';
import { appliquerAnalyse, ensureCasting, characterAt, speechProfile, suggestCasting, voixParGenreParDefaut, preparerDistributionLocale, proposerVoix, besoinsVoix } from '../casting';
import { analyserLivre } from '../casting-analysis';
import { defaults, type Book, type Voice } from '../types';

function fixture(): Book {
  return { id: 'cast', title: 'Deux voix', author: '', format: 'TXT', language: 'fr', color: 0,
    segments: ['La nuit tombe.', 'Pierre : Où allez-vous ?', '« Chez moi », répondit Alice.', 'Alice entra dans la maison.', '— Qui est là ?'],
    chapters: [{ title: 'Un', start: 0, end: 5 }], position: 0, completed: false, added: 0, opened: 0, bookmarks: [] };
}

describe('local multi-character reading', () => {
  it('keeps old books working and resolves narrator and per-sentence profiles', () => {
    const book = fixture();
    expect(characterAt(book, 0)).toBeUndefined();
    expect(speechProfile(book, defaults, 0)).toEqual({ voice: 'system:default', pitch: 1, rate: 1 });
    const cast = ensureCasting(book); cast.enabled = true;
    cast.characters[0].voice = 'neural:siwis';
    cast.characters.push({ id: 'pierre', name: 'Pierre', voice: 'neural:tom', pitch: 0.8, rate: 0.9 });
    cast.assignments['1'] = 'pierre';
    expect(speechProfile(book, { ...defaults, rate: 1.5 }, 1)).toEqual({ voice: 'neural:tom', pitch: 0.8, rate: 1.35 });
    expect(speechProfile(book, defaults, 0).voice).toBe('neural:siwis');
    cast.assignments['2'] = 'deleted-role';
    expect(characterAt(book, 2)?.id).toBe('narrator');
    expect(JSON.parse(JSON.stringify(book)).casting).toEqual(cast);
    cast.enabled = false;
    expect(speechProfile(book, defaults, 1).pitch).toBe(1);
  });

  it('suggests explicit speech only, preserves manual decisions and chapter scope', () => {
    const book = fixture(); const cast = ensureCasting(book);
    cast.characters.push({ id: 'pierre', name: 'Pierre', voice: '', pitch: 1, rate: 1 }, { id: 'alice', name: 'Alice', voice: '', pitch: 1, rate: 1 });
    expect(suggestCasting(book, 0, 2)).toBe(1);
    expect(cast.assignments).toEqual({ '1': 'pierre' });
    cast.assignments['1'] = 'narrator';
    expect(suggestCasting(book, 0, 5)).toBe(1);
    expect(cast.assignments).toEqual({ '1': 'narrator', '2': 'alice' });
    expect(suggestCasting(book, 0, 5)).toBe(0);
  });

  it('never routes local casting to a connected Mac even when the global voice is a clone', () => {
    const book = fixture(); ensureCasting(book).enabled = true;
    expect(speechProfile(book, { ...defaults, voice: 'clone:abcdef' }, 0).voice).toBe('system:default');
  });
});

const catalog: Voice[] = [
  { id: 'system:default', name: 'Téléphone', kind: 'system', language: 'fr', installed: true },
  ...['siwis', 'tom', 'gilles', 'upmc', 'upmc_pierre'].map(id => ({ id: `neural:${id}`, name: id, kind: 'neural' as const, language: 'fr-FR', installed: false, size: 22 })),
];
describe('préparation automatique du livre', () => {
  it('découvre les personnages et leur sexe sur le téléphone, sans Mac ni réseau', () => {
    const book = fixture();
    book.segments.push('— Venez, dit Monsieur Dupont.', 'Madame Martin : Bonjour.', 'Chapitre : Le départ');
    preparerDistributionLocale(book, catalog, defaults.voice);
    expect(book.casting!.characters.map(c => c.name)).toEqual(['Narrateur', 'Pierre', 'Alice', 'Monsieur Dupont', 'Madame Martin']);
    expect(book.casting!.characters.find(c => c.name === 'Madame Martin')?.gender).toBe('femme');
    expect(book.casting!.characters.find(c => c.name === 'Monsieur Dupont')?.gender).toBe('homme');
    expect(book.casting!.characters.find(c => c.name === 'Pierre')?.gender).toBe('homme');
    expect(characterAt(book, 1)?.name).toBe('Pierre');
    expect(book.casting!.assignments['3']).toBeUndefined(); // mention narrative, pas une réplique
    expect(book.casting!.analysis?.state).toBe('local');    // analyse locale complète
  });

  it('ne crée pas de rôle pour un nom seulement cité dans le récit', () => {
    const book = fixture();
    book.segments = [
      'Pierre arriva dans la maison.',
      'Paul referma la porte.',
      'Marie sourit.',
      'Rose était sur la table.',
      'Victor regarda par la fenêtre.',
      '— Bonjour, dit Pierre.',
      '— Salut, répondit Paul.',
    ];
    preparerDistributionLocale(book, catalog, defaults.voice);
    expect(book.casting!.characters.map(c => c.name)).toEqual(['Narrateur', 'Pierre', 'Paul']);
    expect(book.casting!.characters.some(c => ['Marie', 'Rose', 'Victor'].includes(c.name))).toBe(false);
  });

  it('ne transforme pas des dizaines de noms cités en autant de voix', () => {
    const noms = ['Pierre', 'Paul', 'Marie', 'Rose', 'Victor', 'Claude', 'Camille', 'Martin', 'Simon',
      'Michel', 'Jacques', 'François', 'Henri', 'Georges', 'Maurice', 'Albert', 'Charles', 'Philippe',
      'Robert', 'Richard', 'Thomas', 'Nicolas', 'Alexandre', 'Julien', 'Antoine', 'Sébastien',
      'Laurent', 'Vincent', 'Xavier', 'Yves', 'Bernard', 'Daniel', 'David', 'Emmanuel', 'Éric',
      'Fabien', 'Gérard', 'Gilles', 'Guillaume', 'Hervé', 'Jean', 'Jérôme', 'Joël', 'Luc', 'Marc',
      'Mathieu', 'Olivier', 'Pascal', 'Patrick', 'Raphaël', 'René', 'Roger', 'Roland', 'Serge',
      'Stéphane', 'Thierry', 'Thibault', 'Timothée', 'Tristan', 'Alice', 'Jeanne', 'Louis'];
    const book = fixture();
    book.segments = [...noms.map(nom => `${nom} traversa la pièce.`),
      '— Bonjour, dit Pierre.', '— Salut, répondit Alice.', '— Tu viens ? demanda Pierre.', '— Oui, dit Alice.'];
    preparerDistributionLocale(book, catalog, defaults.voice);
    expect(book.casting!.characters.map(c => c.name)).toEqual(['Narrateur', 'Pierre', 'Alice']);
  });

  it('attribue les répliques alternées entre deux locuteurs ancrés', () => {
    const book = fixture();
    book.segments = ['— Bonjour, dit Pierre.', '— Salut !', '— Ça va ?', '— Oui, dit Alice.'];
    preparerDistributionLocale(book, catalog, defaults.voice);
    expect([0, 1, 2, 3].map(i => characterAt(book, i)?.name)).toEqual(['Pierre', 'Alice', 'Pierre', 'Alice']);
  });

  it('« dit-elle » désigne la seule femme repérée dans le livre', () => {
    const book = fixture();
    book.segments = ['Alice arriva.', '— Merci, dit-elle.', '— De rien, dit Pierre.'];
    preparerDistributionLocale(book, catalog, defaults.voice);
    expect(characterAt(book, 0)?.id).toBe('narrator');
    expect(characterAt(book, 1)?.name).toBe('Alice');
    expect(characterAt(book, 2)?.name).toBe('Pierre');
    expect(book.casting!.characters.find(c => c.name === 'Alice')?.gender).toBe('femme');
  });

  it('conserve les rôles, voix, réglages et corrections d’un chapitre à l’autre', () => {
    const book = fixture(); const cast = ensureCasting(book);
    const choix = { narrateur: 'system:default', homme: 'neural:tom', femme: 'neural:siwis' };
    appliquerAnalyse(cast, { personnages: [{ id: 'pierre', nom: 'Pierre', genre: 'homme', role: 'personnage' }], locuteurs: ['pierre'] }, choix, 0);
    const pierre = cast.characters[1]; pierre.voice = 'neural:gilles'; pierre.pitch = 0.8; pierre.rate = 1.2; pierre.automaticVoice = false;
    cast.manualAssignments = { '1': true }; cast.assignments['1'] = pierre.id;
    appliquerAnalyse(cast, { personnages: [{ id: 'alice', nom: 'Alice', genre: 'femme', role: 'personnage' }], locuteurs: ['alice'] }, choix, 1);
    expect(cast.characters).toContain(pierre);
    expect(cast.assignments['0']).toBe(pierre.id);
    expect(cast.assignments['1']).toBe(pierre.id);
    appliquerAnalyse(cast, { personnages: [{ id: 'pierre_dupont', nom: 'Pierre', genre: 'homme', role: 'personnage' }], locuteurs: ['pierre_dupont'] }, choix, 2);
    expect(cast.characters).toHaveLength(3);
    expect(cast.assignments['2']).toBe(pierre.id);
    proposerVoix(cast, catalog.map(v => ({ ...v, installed: true })), defaults.voice, 'fr');
    expect(pierre).toMatchObject({ voice: 'neural:gilles', pitch: 0.8, rate: 1.2 });
  });

  it('traite un chapitre de plus de 400 phrases et reprend après une coupure sans perdre de texte', async () => {
    const book = fixture();
    book.segments = Array.from({ length: 505 }, (_, i) => `Phrase ${i}.`);
    book.chapters = [{ title: 'Long', start: 0, end: 500 }, { title: 'Suite', start: 500, end: 505 }];
    const original = [...book.segments];
    let calls = 0;
    const request = async (input: Parameters<Parameters<typeof analyserLivre>[3]>[0]) => {
      calls++;
      if (calls === 2) throw new Error('Studio déconnecté');
      expect(input.phrases.length).toBeLessThanOrEqual(126);
      return { personnages: [{ id: 'pierre', nom: 'Pierre', genre: 'homme', role: 'personnage' }], locuteurs: input.phrases.map(() => 'pierre') };
    };
    const saved: string[][] = [];
    const checkpoint = async () => { saved.push([...book.casting!.analysis!.completed]); };
    await expect(analyserLivre(book, catalog, defaults.voice, request, checkpoint)).rejects.toThrow('déconnecté');
    expect(book.casting!.analysis).toMatchObject({ state: 'error', completed: ['0:120'] });
    await analyserLivre(book, catalog, defaults.voice, request, checkpoint);
    expect(calls).toBe(7); // premier lot conservé, seul le lot échoué est recommencé
    expect(book.casting!.analysis!.state).toBe('ready');
    expect(Object.keys(book.casting!.assignments)).toHaveLength(505);
    expect(new Set(Object.values(book.casting!.assignments)).size).toBe(1);
    expect(book.casting!.characters).toHaveLength(2);
    expect(book.segments).toEqual(original);
  });

  it('refuse une réponse tronquée plutôt que de décaler les locuteurs', async () => {
    const book = fixture();
    await expect(analyserLivre(book, catalog, defaults.voice, async () => ({ personnages: [], locuteurs: ['narrateur'] }), async () => {})).rejects.toThrow('incomplète');
    expect(book.casting!.analysis!.completed).toEqual([]);
    expect(book.casting!.analysis!.state).toBe('error');
  });

  it('propose des timbres distincts et respecte langue, genre et voix manuelles', () => {
    const cast = ensureCasting(fixture());
    cast.characters.push({ id: 'pierre', name: 'Pierre', gender: 'homme', voice: '', pitch: 1, rate: 1, autoRole: false },
      { id: 'alice', name: 'Alice', gender: 'femme', voice: '', pitch: 1, rate: 1, autoRole: false });
    const available = [...catalog.map(v => ({ ...v, installed: ['neural:tom', 'neural:siwis', 'system:default'].includes(v.id) })),
      { id: 'neural:lessac', name: 'English', kind: 'neural' as const, language: 'en-US', installed: true }];
    expect(proposerVoix(cast, available, defaults.voice, 'fr').missing).toHaveLength(0);
    expect(cast.characters.find(c => c.id === 'pierre')?.voice).toBe('neural:tom');
    expect(cast.characters.find(c => c.id === 'alice')?.voice).toBe('neural:siwis');
    expect(new Set(cast.characters.map(c => c.voice)).size).toBe(3);
    expect(cast.characters.some(c => c.voice === 'neural:lessac')).toBe(false);
  });

  it('compte les voix manquantes et regroupe les deux timbres UPMC en un téléchargement', () => {
    const cast = ensureCasting(fixture());
    for (let i = 0; i < 6; i++) cast.characters.push({ id: `p${i}`, name: `P${i}`, voice: '', gender: i % 2 ? 'femme' : 'homme', pitch: 1, rate: 1, autoRole: false });
    const plan = proposerVoix(cast, catalog, defaults.voice, 'fr');
    expect(plan.missing).toHaveLength(6);
    expect(plan.downloads).toHaveLength(4);
    expect(plan.downloads.flatMap(d => d.voices)).toHaveLength(5);
    expect(plan.downloads.find(d => d.voices.length === 2)?.roles).toHaveLength(2);
    const installed = catalog.map(v => ({ ...v, installed: true }));
    proposerVoix(cast, installed, defaults.voice, 'fr');
    expect(besoinsVoix(cast, installed, 'fr').missing).toHaveLength(1);
  });

  it('ne présente pas le genre inconnu des voix Android comme une correspondance vérifiée', () => {
    const cast = ensureCasting(fixture());
    cast.characters.push({ id: 'alice', name: 'Alice', gender: 'femme', voice: '', pitch: 1, rate: 1, autoRole: false });
    const voices: Voice[] = [...catalog, { id: 'system:unknown', name: 'Voix Android', language: 'fr', kind: 'system', installed: true }];
    const plan = proposerVoix(cast, voices, defaults.voice, 'fr');
    expect(plan.missing.some(c => c.id === 'alice')).toBe(true);
    expect(plan.downloads.flatMap(d => d.voices).some(v => v.id === 'neural:siwis')).toBe(true);
  });
});

describe('analyse du studio reportée sur le téléphone', () => {
  it('crée un rôle par personnage avec la voix de son sexe et attribue chaque phrase', () => {
    const book = fixture();
    const cast = ensureCasting(book);
    const options = [
      { id: 'neural:siwis', name: 'Siwis', language: 'fr-FR', kind: 'neural' as const, installed: true },
      { id: 'neural:tom', name: 'Tom', language: 'fr-FR', kind: 'neural' as const, installed: true },
    ];
    const choix = voixParGenreParDefaut(options, 'neural:siwis');
    expect(choix).toEqual({ narrateur: 'neural:siwis', homme: 'neural:tom', femme: 'neural:siwis' });
    const bilan = appliquerAnalyse(cast, {
      personnages: [
        { id: 'narrateur', nom: 'Narrateur', genre: 'indetermine', role: 'narrateur' },
        { id: 'pierre', nom: 'Pierre', genre: 'homme', role: 'personnage' },
        { id: 'alice', nom: 'Alice', genre: 'femme', role: 'personnage' },
      ],
      locuteurs: ['narrateur', 'pierre', 'alice', 'pierre'],
    }, choix, 0);

    expect(bilan).toEqual({ personnages: 2, phrases: 3 });
    expect(cast.enabled).toBe(true);
    expect(cast.characters.map(c => c.name)).toEqual(['Narrateur', 'Pierre', 'Alice']);
    expect(cast.characters.find(c => c.name === 'Pierre')?.voice).toBe('neural:tom');
    expect(cast.characters.find(c => c.name === 'Alice')?.voice).toBe('neural:siwis');
    expect(cast.characters[0].voice).toBe('neural:siwis');
    expect(cast.assignments['0']).toBe('narrator');
    expect(cast.assignments['1']).toBe('studio-pierre');
    expect(cast.assignments['2']).toBe('studio-alice');
    expect(cast.assignments['3']).toBe('studio-pierre');
    // les phrases restent lisibles par le moteur de lecture
    expect(speechProfile(book, { ...defaults, voice: 'system:default' }, 1).voice).toBe('neural:tom');
  });

  it('décale les attributions au chapitre analysé et retombe sur le narrateur', () => {
    const book = fixture();
    const cast = ensureCasting(book);
    const bilan = appliquerAnalyse(cast, {
      personnages: [{ id: 'pierre', nom: 'Pierre', genre: 'indetermine', role: 'personnage' }],
      locuteurs: ['pierre', 'inconnu'],
    }, { narrateur: 'neural:siwis', homme: 'neural:tom', femme: 'neural:siwis' }, 3);
    expect(bilan.phrases).toBe(1);
    expect(cast.assignments['3']).toBe('studio-pierre');
    expect(cast.assignments['4']).toBe('narrator');
  });
});
