import { describe, expect, it } from 'vitest';
import { defaults, type Book, type Voice } from '../types';
import { etapesLivre } from '../book-progress';

const voix: Voice[] = [
  { id: 'system:default', name: 'Voix du téléphone', language: 'fr-FR', kind: 'system', installed: true },
  { id: 'neural:siwis', name: 'Siwis', language: 'fr-FR', kind: 'neural', installed: true },
];

function livre(mots = 6): Book {
  // 6 phrases → 2 chapitres ; un lot par chapitre (moins de 120 phrases).
  const segments = Array.from({ length: mots }, (_, i) => `Phrase ${i + 1}.`);
  return { id: 'etapes', title: 'Étapes', author: '', format: 'TXT', language: 'fr', color: 0,
    segments, chapters: [{ title: 'Un', start: 0, end: 3 }, { title: 'Deux', start: 3, end: 6 }],
    position: 0, completed: false, added: 0, opened: 0, bookmarks: [] };
}
const paragraphes = (book: Book) => { book.paragraphs = book.segments.map((_, i) => Math.floor(i / 2)); return book; };
const distribution = (book: Book, etat: 'local' | 'partial' | 'ready' | 'error', faits: string[] = []) => {
  book.casting = {
    enabled: true,
    characters: [
      { id: 'narrator', name: 'Narrateur', voice: 'system:default', pitch: 1, rate: 1 },
      { id: 'pierre', name: 'Pierre', voice: 'neural:siwis', pitch: 1, rate: 1, autoRole: false },
    ],
    assignments: { '1': 'pierre', '4': 'pierre' },
    analysis: { state: etat, completed: faits, error: etat === 'error' ? 'Quota atteint' : undefined },
  };
  return book;
};

describe('progression du livre en quatre étapes', () => {
  it('distingue une analyse fine terminée d’un simple repérage local', () => {
    const book = distribution(livre(), 'ready', ['0:3', '3:6']);
    const [p, a] = etapesLivre(paragraphes(book), voix, { ia: true });
    expect(p).toMatchObject({ id: 'paragraphes', pct: 100, etat: 'done', action: 'reparagrapher' });
    expect(a).toMatchObject({ id: 'analyse', pct: 100, etat: 'done' });
    expect(a.detail).toContain('2/2 chapitres');
    // Sans IA configurée, le repérage local est l'état final attendu.
    const local = etapesLivre(distribution(paragraphes(livre()), 'local'), voix, { ia: false });
    expect(local[1]).toMatchObject({ pct: 100, etat: 'done' });
    expect(local[1].detail).toContain('Repérage local');
    // Ligne par ligne : un livre sans rien reste à 0, sauf l'écoute locale.
    const vierge = etapesLivre(livre(), voix, { ia: false });
    expect(vierge.map(e => e.pct)).toEqual([0, 0, 0, 100]);
    expect(vierge[2].detail).toBe('En attente de l’analyse');
  });

  it('compte les chapitres complets, pas les lots épars', () => {
    const book = distribution(livre(), 'partial', ['0:3']);
    const [, analyse, , ecoute] = etapesLivre(book, voix, { ia: true });
    expect(analyse.pct).toBe(50);
    expect(analyse.detail).toBe('1/2 chapitres · 1/2 blocs');
    // On écoute le chapitre 1 : il est prêt, le second non.
    expect(ecoute).toMatchObject({ pct: 100, etat: 'done' });
    expect(ecoute.detail).toBe('Un · prêt à écouter');
    book.position = 3;
    expect(etapesLivre(book, voix, { ia: true })[3].pct).toBe(0);
  });

  it('signale une analyse en cours, une erreur, et les voix manquantes', () => {
    const book = distribution(livre(), 'error');
    const [, erreur] = etapesLivre(book, voix, { ia: true });
    expect(erreur.etat).toBe('error');
    expect(erreur.detail).toContain('Quota atteint');
    const enCours = etapesLivre(book, voix, { ia: true, busy: true, progress: { done: 1, total: 2, chapter: 'Un', phase: 'attribution' } })[1];
    expect(enCours).toMatchObject({ etat: 'running', pct: 50 });
    expect(enCours.detail).toBe('Attribution · 1/2 blocs');
    // Une voix absente du catalogue reste à compléter.
    const sansVoix = distribution(livre(), 'ready', ['0:3', '3:6']);
    const voixEtape = etapesLivre(sansVoix, [], { ia: true })[2];
    expect(voixEtape.pct).toBeLessThan(100);
    expect(voixEtape.detail).toContain('voix à compléter');
    expect(voixEtape.libelle).toBe('Choisir');
  });

  it('marque l’écoute en cours quand la séquence est lancée', () => {
    const book = distribution(livre(), 'partial', ['0:3']);
    const ecoute = etapesLivre(book, voix, { ia: true, setup: 'Lecture de « Un » — le reste s’analyse.' })[3];
    expect(ecoute).toMatchObject({ etat: 'running', detail: 'Lecture de « Un » — le reste s’analyse.' });
  });
});
