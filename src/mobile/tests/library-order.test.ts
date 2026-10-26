import { describe, expect, it } from 'vitest';
import { colonnesBibliotheque, trierLivres } from '../library-order';
import type { Book } from '../types';

const livre = (id: string, patch: Partial<Book> = {}): Book => ({
  id, title: `Livre ${id}`, author: '', format: 'TXT', language: 'fr', color: 0,
  segments: [''], chapters: [], position: 0, completed: false, added: 0, opened: 0, bookmarks: [], ...patch,
});

describe('ordre de la bibliothèque', () => {
  it('classe par ajout récent par défaut', () => {
    const liste = [livre('vieux', { added: 10 }), livre('neuf', { added: 30 }), livre('moyen', { added: 20 })];
    expect(trierLivres(liste, 'recent').map(b => b.id)).toEqual(['neuf', 'moyen', 'vieux']);
    expect(trierLivres(liste).map(b => b.id)).toEqual(['neuf', 'moyen', 'vieux']);
  });

  it('classe par dernier ouvert, les livres jamais ouverts en dernier', () => {
    const liste = [
      livre('jamais', { added: 50 }),
      livre('hier', { added: 10, opened: 100 }),
      livre('aujourdhui', { added: 20, opened: 200 }),
    ];
    expect(trierLivres(liste, 'opened').map(b => b.id)).toEqual(['aujourdhui', 'hier', 'jamais']);
  });

  it('classe par titre sans tenir compte des accents ni de la casse', () => {
    const liste = [
      livre('e', { title: 'Été' }),
      livre('a', { title: 'abricot' }),
      livre('z', { title: 'Zéphyr' }),
    ];
    expect(trierLivres(liste, 'alpha').map(b => b.id)).toEqual(['a', 'e', 'z']);
  });

  it('classe par année de parution, sinon par année d’ajout', () => {
    const liste = [
      livre('ancien', { year: 1980, added: 300 }),
      livre('recent', { year: 2022, added: 10 }),
      livre('sans-metadonnee', { added: new Date('2019-05-01').getTime() }),
    ];
    expect(trierLivres(liste, 'year').map(b => b.id)).toEqual(['recent', 'sans-metadonnee', 'ancien']);
  });

  it('garde une préférence de colonnes valide et retombe sur deux sinon', () => {
    expect(colonnesBibliotheque(1)).toBe(1);
    expect(colonnesBibliotheque('3')).toBe(3);
    expect(colonnesBibliotheque(2)).toBe(2);
    expect(colonnesBibliotheque(0)).toBe(2);
    expect(colonnesBibliotheque(9)).toBe(2);
    expect(colonnesBibliotheque(undefined)).toBe(2);
  });
});
