import type { Book } from './types';
import { chapterAt } from './books';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;

export function readerHeaderView(book: Book, analysis: string) {
  const author = /^(inconnu|unknown|auteur inconnu|auteur non renseigné)$/i.test(book.author.trim()) ? '' : book.author;
  return `<header class="reader-header"><button class="icon-button" data-action="back" aria-label="Retour à la bibliothèque">${icon('arrow-left')}</button>
    <div class="reader-title"><span>${esc(book.title.replace(/\n/g, ' '))}</span>${author ? `<small>${esc(author)}</small>` : ''}</div>
    <div class="reader-actions"><span id="reader-analysis" aria-live="polite">${analysis}</span><button class="icon-button" data-action="book-search" aria-label="Rechercher dans le livre" title="Rechercher">${icon('search')}</button><button class="icon-button" data-action="appearance" aria-label="Apparence et réglages de lecture" title="Apparence">${icon('sun-moon')}</button><button class="icon-button" data-action="book-settings" data-id="${esc(book.id)}" aria-label="Gérer le livre" title="Gérer le livre">${icon('settings')}</button></div></header>`;
}

/** Le transport du lecteur : chapitre, page et phrase sur une seule ligne.
 *  Les libellés complets restent dans les aria-label ; l'écran gagne la place
 *  d'un paragraphe entier face aux anciennes barres empilées. */
export function readerNavigationView(book: Book, layout: 'pages' | 'scroll', playing = false, loading = false) {
  const chapter = chapterAt(book), index = book.chapters.indexOf(chapter);
  const chapitrePrecedent = index <= 0, chapitreSuivant = index >= book.chapters.length - 1;
  const defilement = layout === 'scroll';
  return `<div class="reader-nav-mini" role="group" aria-label="Navigation : chapitre, page, phrase">
    <button type="button" data-action="chapter-step" data-id="-1" ${chapitrePrecedent ? 'disabled' : ''} aria-label="Chapitre précédent">${icon('skip-back')}</button>
    <button type="button" data-action="page-prev" ${defilement ? 'disabled' : ''} aria-label="Page précédente">${icon('chevron-left')}</button>
    <button type="button" data-action="previous" aria-label="Revenir d’une phrase">${icon('rotate-ccw')}</button>
    <button type="button" class="play-button ${loading ? 'loading' : ''}" data-action="toggle" aria-label="${playing ? 'Mettre en pause' : 'Lire à voix haute'}">${icon(loading ? 'loader-circle' : playing ? 'pause' : 'play')}</button>
    <button type="button" data-action="next" aria-label="Avancer d’une phrase">${icon('rotate-cw')}</button>
    <button type="button" data-action="page-next" ${defilement ? 'disabled' : ''} aria-label="Page suivante">${icon('chevron-right')}</button>
    <button type="button" data-action="chapter-step" data-id="1" ${chapitreSuivant ? 'disabled' : ''} aria-label="Chapitre suivant">${icon('skip-forward')}</button>
  </div>`;
}
