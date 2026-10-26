import type { Book, LibrarySort } from './types';

const collateur = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const annee = (book: Book) => book.year ?? new Date(book.added).getFullYear();
const titre = (book: Book) => book.title.replace(/\s+/g, ' ').trim();

/** Tri stable et explicite de la bibliothèque. « Année » utilise l'année de
 *  parution de l'EPUB, sinon l'année d'ajout, pour rester utile sur les PDF et
 *  les textes collés. */
export function trierLivres(list: Book[], ordre: LibrarySort = 'recent'): Book[] {
  const copie = [...list];
  switch (ordre) {
    case 'opened':
      return copie.sort((a, b) => (b.opened || 0) - (a.opened || 0) || b.added - a.added);
    case 'alpha':
      return copie.sort((a, b) => collateur.compare(titre(a), titre(b)) || b.added - a.added);
    case 'year':
      return copie.sort((a, b) => annee(b) - annee(a) || collateur.compare(titre(a), titre(b)));
    default:
      return copie.sort((a, b) => b.added - a.added);
  }
}

/** Une préférence invalide ou absente retombe sur les deux colonnes du mobile. */
export function colonnesBibliotheque(valeur: unknown): 1 | 2 | 3 {
  const colonnes = Number(valeur);
  return colonnes === 1 || colonnes === 3 ? colonnes : 2;
}
