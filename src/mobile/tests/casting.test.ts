import { describe, it, expect } from 'vitest';
import { appliquerAnalyse, ensureCasting, characterAt, speechProfile, suggestCasting, voixParGenreParDefaut } from '../casting';
import { defaults, type Book } from '../types';

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
