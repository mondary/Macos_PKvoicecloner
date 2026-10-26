import { describe, expect, it } from 'vitest';
import { rechercherDansLivre } from '../book-search';
import type { Book } from '../types';

const livre = (): Book => ({
  id: 'recherche', title: 'Recherche', author: '', format: 'TXT', language: 'fr', color: 0,
  segments: ['Le café est bon.', 'Une autre phrase sans accents.', 'Camille longeait le fleuve.'],
  chapters: [{ title: 'Un', start: 0, end: 2 }, { title: 'Deux', start: 2, end: 3 }],
  position: 0, completed: false, added: 0, opened: 0, bookmarks: [],
});

describe('recherche dans le livre', () => {
  it('ignore les accents et la casse, avec le passage original', () => {
    const [hit] = rechercherDansLivre(livre(), 'CAFE');
    expect(hit).toMatchObject({ index: 0, chapter: 'Un', match: 'café' });
    expect(`${hit.before}${hit.match}${hit.after}`).toContain('Le café est bon.');
  });

  it('trouve un mot dans le chapitre suivant et respecte la limite', () => {
    const hits = rechercherDansLivre(livre(), 'camille');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ index: 2, chapter: 'Deux', match: 'Camille' });
    expect(rechercherDansLivre(livre(), 'e', 1)).toHaveLength(0); // moins de deux lettres
  });

  it('trouve plusieurs occurrences dans une même phrase sans répéter un extrait identique', () => {
    const book = livre();
    book.segments[0] = 'Café, café, café.';
    const hits = rechercherDansLivre(book, 'café');
    expect(hits).toHaveLength(3);
    expect(hits.every(h => h.index === 0)).toBe(true);
    book.segments.push('Café, café, café.');
    expect(rechercherDansLivre(book, 'café')).toHaveLength(3);
  });
});
