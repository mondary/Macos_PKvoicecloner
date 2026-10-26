// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { normaliserTitresChapitres, welcomeBook } from '../books';
import { readerHeaderView, readerNavigationView } from '../reader-controls';
import { analysisChip } from '../activity-view';

describe('lecteur regroupé', () => {
  it('regroupe gérer et le compteur d’analyse, sans boutons voix/apparence en double', () => {
    const book = welcomeBook();
    const chip = analysisChip([{ id: book.id, title: book.title, source: 'IA', state: 'running', debut: 0,
      progress: { done: 28, total: 141, chapter: 'Chapitre 1' } }], book.id);
    document.body.innerHTML = readerHeaderView(book, chip);
    expect(document.querySelector('.reader-actions [data-action="casting"]')?.textContent).toContain('28/141');
    expect(document.querySelector('.reader-actions [data-action="book-settings"]')?.textContent).toContain('Gérer');
    expect(document.querySelector('[data-action="appearance"]')).toBeNull();
    expect(document.querySelectorAll('.reader-actions button')).toHaveLength(2);
  });

  it('sépare pages et chapitres par des icônes et libellés explicites', () => {
    document.body.innerHTML = readerNavigationView(welcomeBook(), 'pages');
    expect(document.querySelectorAll('[data-action="page-prev"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-action="chapter-step"]')).toHaveLength(4);
    expect(document.querySelector('[aria-label="Chapitre précédent"]')?.hasAttribute('disabled')).toBe(true);
    expect(document.querySelector('[aria-label="Page suivante"] [data-lucide="chevron-right"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Chapitre suivant"] [data-lucide="skip-forward"]')).not.toBeNull();
    expect(document.querySelector('[data-action="chapters"]')?.getAttribute('aria-label')).toContain('signet');
    // Mini-lecteur : chapitre, page et phrase tiennent sur une seule ligne.
    const mini = document.querySelector('.reader-nav-mini');
    expect(mini?.getAttribute('role')).toBe('group');
    expect(mini?.querySelectorAll('button')).toHaveLength(7);
    expect(mini?.querySelectorAll('button')[3].dataset.action).toBe('toggle');
    expect(mini?.querySelector('[data-action="next"] [data-lucide="rotate-cw"]')).not.toBeNull();
    expect(mini?.querySelector('[aria-label="Chapitre précédent"]')?.hasAttribute('disabled')).toBe(true);
  });

  it('répare les titres de chapitres inconnus sans toucher au texte ni aux lots validés', () => {
    const book = welcomeBook(), segments = [...book.segments];
    const bounds = book.chapters.map(c => [c.start, c.end]);
    book.chapters[0].title = 'Inconnu'; book.chapters[1].title = 'UNKNOWN UNKNOWN';
    const real = book.chapters[2].title;
    expect(normaliserTitresChapitres(book)).toBe(true);
    expect(book.chapters.map(c => c.title)).toEqual(['Chapitre 1', 'Chapitre 2', real]);
    expect(book.segments).toEqual(segments);
    expect(book.chapters.map(c => [c.start, c.end])).toEqual(bounds);
    expect(normaliserTitresChapitres(book)).toBe(false);
  });
});
