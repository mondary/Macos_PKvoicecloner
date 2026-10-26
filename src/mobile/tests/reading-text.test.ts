// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chapterRuns, paginateReading, renderReadingText } from '../reading-text';
import { welcomeBook } from '../books';

describe('texte de livre, pas liste de phrases', () => {
  it('groupe les phrases dans les paragraphes d’origine et garde leurs indices audio', () => {
    const book = welcomeBook();
    book.segments = ['Une première phrase.', 'Une seconde phrase.', '<Le soir tombe.>'];
    book.paragraphs = [0, 0, 1]; book.position = 1;
    document.body.innerHTML = renderReadingText(book, chapterRuns(book, 0, 3));
    expect(document.querySelectorAll('.book-paragraph')).toHaveLength(2);
    expect(document.querySelector('.book-paragraph')?.textContent).toBe('Une première phrase. Une seconde phrase.');
    expect(document.querySelector('[aria-current="true"]')?.getAttribute('data-index')).toBe('1');
    expect(document.querySelector('le')).toBeNull();
  });

  it('préserve exactement les espaces, accents et ponctuation après découpage', () => {
    const book = welcomeBook();
    book.segments = ['Élodie  poursuit son voyage.\nEt voici une très longue phrase, pour plusieurs pages !'];
    book.paragraphs = [0];
    const pages = paginateReading(book, 0, 1, 48, 48,
      (runs) => runs.reduce((n, run) => n + run.to - run.from, 0) <= 20);
    const reconstructed = pages.flat().map(run => book.segments[run.index].slice(run.from, run.to)).join('');
    expect(pages.length).toBeGreaterThan(1);
    expect(reconstructed).toBe(book.segments[0]);
  });

  it('remplit une page avec plusieurs paragraphes si la place le permet', () => {
    const book = welcomeBook(); book.segments = ['Un.', 'Deux.', 'Trois.']; book.paragraphs = [0, 1, 2];
    const pages = paginateReading(book, 0, 3, 100, 100, runs => runs.length <= 3);
    expect(pages).toHaveLength(1);
    document.body.innerHTML = renderReadingText(book, pages[0]);
    expect(document.querySelectorAll('p')).toHaveLength(3);
  });
});
