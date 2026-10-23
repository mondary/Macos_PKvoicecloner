import { describe, expect, it } from 'vitest';
import { appliquerAnalyse, characterAt, ensureCasting, preparerDistributionLocale } from '../casting';
import { paragraphsOf } from '../books';
import { defaults, type Book } from '../types';

function bookOf(segments: string[]): Book {
  return { id: 'detection', title: 'Repérage des locuteurs', author: '', format: 'TXT', language: 'fr', color: 0,
    segments, chapters: [{ title: 'Un', start: 0, end: segments.length }], position: 0,
    completed: false, added: 0, opened: 0, bookmarks: [] };
}
const prepare = (book: Book) => preparerDistributionLocale(book, [], defaults.voice);
const names = (book: Book) => book.casting!.characters.map(c => c.name);

describe('preuves de parole, pas de mots capitalisés transformés en personnages', () => {
  it('rejette les neuf faux rôles signalés, même répétés et entourés de vrais dialogues', () => {
    const labels = ['Request', 'Voilà', 'Bon', 'Elle', 'Moi', 'Puis', 'Bref', 'Exemple', 'Avec eux'];
    const book = bookOf([...labels.map(n => `${n} : une explication.`),
      '— Entrez, dit Schaltzmann.', '— Merci, répondit Élodie.',
      ...labels.map(n => `${n.toUpperCase()} : une autre explication.`)]);
    prepare(book);
    expect(names(book)).toEqual(['Narrateur', 'Schaltzmann', 'Élodie']);
    for (const i of [...labels.keys(), ...labels.map((_, i) => i + labels.length + 2)]) {
      expect(characterAt(book, i)?.id).toBe('narrator');
    }
  });

  it('ne prend pas les titres, les métadonnées ou les lieux suivis de deux-points pour des locuteurs', () => {
    const book = bookOf(['Contexte : la situation.', 'Résultat : tout est prêt.', 'Paris : capitale.',
      'Échantillon : mesure.', 'Pierre : fiche de lecture.', 'Question : qui ?', 'Réponse : personne.']);
    prepare(book);
    expect(names(book)).toEqual(['Narrateur']);
    expect(book.casting!.assignments).toEqual({});
  });

  it('reconnaît un échange étiqueté de prénoms et les noms inconnus confirmés par une incise', () => {
    const book = bookOf(['Pierre : Bonjour.', 'Alice : Bonsoir.', 'La salle se vide.',
      '— Revenez, demanda Schaltzmann.', 'Le lendemain.', 'Schaltzmann : Entrez.']);
    prepare(book);
    expect([0, 1, 3, 5].map(i => characterAt(book, i)?.name)).toEqual(['Pierre', 'Alice', 'Schaltzmann', 'Schaltzmann']);
  });

  it('préserve les noms avec accents, traits d’union, apostrophes et particules', () => {
    const book = bookOf(['— Oui, dit Jean-Pierre.', '— Non, répondit Élodie.',
      '— Venez, demanda d’Artagnan.', '— Merci, murmura Mme de La Tour.', 'Puis : le silence.']);
    prepare(book);
    expect(names(book)).toEqual(['Narrateur', 'Jean-Pierre', 'Élodie', 'd’Artagnan', 'Mme de La Tour']);
    expect(characterAt(book, 4)?.id).toBe('narrator');
  });

  it('ne résout pas un pronom depuis un nom cité dans un autre chapitre', () => {
    const book = bookOf(['Alice arriva.', '— Merci, dit-elle.', '— Venez, dit Pierre.']);
    book.chapters = [{ title: 'Un', start: 0, end: 1 }, { title: 'Deux', start: 1, end: 3 }];
    prepare(book);
    expect(names(book)).toEqual(['Narrateur', 'Pierre']);
    expect(characterAt(book, 1)?.id).toBe('narrator');
  });

  it('ne crée pas de rôles pronoms, même après un verbe de parole', () => {
    const book = bookOf(['Elle dit : je pars.', 'Moi : je reste.', '— Oui, dit Elle.', '— Non, dit Moi.',
      '— Bonjour, dit Alice.', '— Merci, dit-elle.', '— Ensemble, dirent-elles.']);
    prepare(book);
    expect(names(book)).toEqual(['Narrateur', 'Alice']);
    expect(characterAt(book, 5)?.name).toBe('Alice');
    expect(characterAt(book, 6)?.id).toBe('narrator');
  });

  it('alterne les tours de parole et non les phrases d’un même paragraphe', () => {
    const text = '— Bonjour, dit Pierre. Il est tard.\n— Bonsoir, répondit Alice.\n— Venez. Nous partons.\n— Oui, dit Alice.';
    const parsed = paragraphsOf(text);
    const book = bookOf(parsed.phrases); book.paragraphs = parsed.paragraphes;
    prepare(book);
    expect(book.segments.map((_, i) => characterAt(book, i)?.name)).toEqual(['Pierre', 'Pierre', 'Alice', 'Pierre', 'Pierre', 'Alice']);
  });

  it('arrête les inférences à la frontière d’un chapitre et d’un passage narratif', () => {
    const book = bookOf(['— Bonjour, dit Pierre.', '— Merci.', '— Bonsoir, dit Alice.',
      'La porte se ferme.', '— Et maintenant ?']);
    book.chapters = [{ title: 'Un', start: 0, end: 2 }, { title: 'Deux', start: 2, end: 5 }];
    prepare(book);
    expect(characterAt(book, 1)?.id).toBe('narrator');
    expect(characterAt(book, 4)?.id).toBe('narrator');
  });

  it('retrouve le locuteur quand le découpage sépare la réplique de son incise', () => {
    const parsed = paragraphsOf('— Qui est là ? demanda Élodie.\n— Moi, répondit Jean-Pierre.');
    const book = bookOf(parsed.phrases); book.paragraphs = parsed.paragraphes;
    prepare(book);
    expect(names(book)).toEqual(['Narrateur', 'Élodie', 'Jean-Pierre']);
    expect(characterAt(book, 0)?.name).toBe('Élodie');
    expect(characterAt(book, book.segments.length - 1)?.name).toBe('Jean-Pierre');
  });

  it('garde au narrateur un segment mêlant plusieurs locuteurs et les pronoms ambigus', () => {
    const book = bookOf(['« Oui », dit Pierre, « non », répondit Paul.', '— Viens, dit Pierre.',
      '— Attends, dit-il.', '— Non, répondit Paul.']);
    prepare(book);
    expect(characterAt(book, 0)?.id).toBe('narrator');
    expect(characterAt(book, 2)?.id).toBe('narrator');
    expect(names(book)).toEqual(['Narrateur', 'Pierre', 'Paul']);
  });

  it('le studio ne réintroduit pas les mots ordinaires comme rôles automatiques', () => {
    const cast = ensureCasting(bookOf(['Voilà : un exemple.', '— Bonjour, dit Alice.']));
    const result = appliquerAnalyse(cast, { personnages: [
      { id: 'voila', nom: 'Voilà', genre: 'indetermine', role: 'personnage' },
      { id: 'elle', nom: 'Elle', genre: 'femme', role: 'personnage' },
      { id: 'alice', nom: 'Alice', genre: 'femme', role: 'personnage' },
    ], locuteurs: ['voila', 'alice'] }, { narrateur: 'system:default', homme: 'neural:tom', femme: 'neural:siwis' }, 0);
    expect(cast.characters.map(c => c.name)).toEqual(['Narrateur', 'Alice']);
    expect(cast.assignments).toEqual({ '0': 'narrator', '1': 'studio-alice' });
    expect(result).toEqual({ personnages: 1, phrases: 1 });
  });
});

describe('réparation des distributions déjà enregistrées', () => {
  it('réanalyse les anciens faux rôles ayant des phrases et conserve les vrais choix manuels', () => {
    const book = bookOf(['Voilà : une explication.', '— Bonjour, dit Pierre.', 'Exemple : un autre.', '— Mystère.']);
    const cast = ensureCasting(book);
    cast.enabled = false;
    cast.characters.push(
      { id: 'voila', name: 'Voilà', voice: 'system:default', pitch: 1, rate: 1, automaticVoice: true },
      { id: 'pierre', name: 'Pierre', voice: 'neural:tom', pitch: 0.85, rate: 1.15, automaticVoice: false, autoRole: true },
      { id: 'exemple', name: 'Exemple', voice: 'system:default', pitch: 1, rate: 1, automaticVoice: true, autoRole: true },
      { id: 'custom', name: 'Le gardien', voice: 'neural:gilles', pitch: 1, rate: 1, autoRole: false });
    cast.assignments = { '0': 'voila', '1': 'pierre', '2': 'exemple', '3': 'custom' };
    cast.manualAssignments = { '3': true };
    cast.analysis = { state: 'local', completed: [] };
    book.position = 2; book.bookmarks = [1, 3];
    const original = [...book.segments];
    prepare(book);
    expect(names(book)).toEqual(['Narrateur', 'Pierre', 'Le gardien']);
    expect(cast.assignments).toEqual({ '1': 'pierre', '3': 'custom' });
    expect(cast.characters.find(c => c.id === 'pierre')).toMatchObject({ voice: 'neural:tom', pitch: 0.85, rate: 1.15 });
    expect(cast.enabled).toBe(false);
    expect(book).toMatchObject({ position: 2, bookmarks: [1, 3], segments: original });
    const saved = JSON.stringify(cast);
    prepare(book);
    expect(JSON.stringify(cast)).toBe(saved);
  });

  it('préserve les lots du studio et les corrections manuelles pendant la migration', () => {
    const book = bookOf(['Un message sans étiquette.', 'Moi : note de lecture.', 'Bref : conclusion.']);
    const cast = ensureCasting(book);
    cast.characters.push(
      { id: 'alice', sourceId: 'alice', name: 'Alice', voice: 'neural:siwis', pitch: 1, rate: 1, automaticVoice: true },
      { id: 'moi', name: 'Moi', voice: '', pitch: 1, rate: 1, automaticVoice: true },
      { id: 'bref', name: 'Bref', voice: '', pitch: 1, rate: 1, automaticVoice: true });
    cast.assignments = { '0': 'alice', '1': 'moi', '2': 'bref' };
    cast.manualAssignments = { '1': true };
    cast.analysis = { state: 'partial', completed: ['0:1'] };
    prepare(book);
    expect(cast.assignments).toEqual({ '0': 'alice', '1': 'moi' });
    expect(cast.analysis).toMatchObject({ state: 'partial', completed: ['0:1'] });
    expect(names(book)).toEqual(['Narrateur', 'Alice', 'Moi']);
  });

  it('une correction manuelle du locuteur l’emporte sur une incise détectée', () => {
    const book = bookOf(['— Bonjour, dit Pierre.', '— Bonsoir, dit Alice.', '— Oui !', '— Non, dit Alice.']);
    const cast = ensureCasting(book);
    cast.characters.push({ id: 'manuel', name: 'Le gardien', voice: '', pitch: 1, rate: 1, autoRole: false });
    cast.assignments = { '0': 'manuel' }; cast.manualAssignments = { '0': true };
    prepare(book);
    expect(characterAt(book, 0)?.name).toBe('Le gardien');
    expect(characterAt(book, 2)?.name).toBe('Le gardien');
    expect(names(book)).not.toContain('Pierre');
  });
});
