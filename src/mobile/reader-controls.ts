import type { Book } from './types';
import { chapterAt } from './books';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;

export function readerHeaderView(book: Book, analysis: string) {
  const author = /^(inconnu|unknown|auteur inconnu|auteur non renseigné)$/i.test(book.author.trim()) ? '' : book.author;
  return `<header class="reader-header"><button class="icon-button" data-action="back" aria-label="Retour à la bibliothèque">${icon('arrow-left')}</button>
    <div class="reader-title"><span>${esc(book.title.replace(/\n/g, ' '))}</span>${author ? `<small>${esc(author)}</small>` : ''}</div>
    <div class="reader-actions"><span id="reader-analysis" aria-live="polite">${analysis}</span><button class="header-action" data-action="book-settings" data-id="${esc(book.id)}">${icon('sliders-horizontal')}<span>Gérer</span></button></div></header>`;
}

/** Un seul endroit pour naviguer, chaque niveau est nommé et a sa propre icône.
 *  En lecteur réduit, la même navigation tient sur une ligne d'icônes. */
export function readerNavigationView(book: Book, layout: 'pages' | 'scroll') {
  const chapter = chapterAt(book), index = book.chapters.indexOf(chapter);
  const chapitrePrecedent = index <= 0, chapitreSuivant = index >= book.chapters.length - 1;
  return `<div class="reader-navigation" aria-label="Navigation du livre">
    <div class="reader-nav-row"><button class="reader-nav-button" data-action="chapter-step" data-id="-1" ${chapitrePrecedent ? 'disabled' : ''} aria-label="Chapitre précédent">${icon('skip-back')}<span>Chapitre</span></button>
      <button class="reader-nav-location" data-action="chapters" aria-label="Choisir un chapitre ou un signet">${esc(chapter.title)}</button>
      <button class="reader-nav-button" data-action="chapter-step" data-id="1" ${chapitreSuivant ? 'disabled' : ''} aria-label="Chapitre suivant"><span>Chapitre</span>${icon('skip-forward')}</button></div>
    <div class="reader-nav-row"><button class="reader-nav-button" data-action="page-prev" aria-label="Page précédente">${icon('chevron-left')}<span>Page</span></button>
      <span class="page-count" id="page-footer" aria-live="off">${layout === 'pages' ? '…' : 'Défilement'}</span>
      <button class="reader-nav-button" data-action="page-next" aria-label="Page suivante"><span>Page</span>${icon('chevron-right')}</button></div>
    </div>
    <div class="reader-nav-mini" role="group" aria-label="Navigation du livre : chapitre, page, phrase">
      <button type="button" data-action="chapter-step" data-id="-1" ${chapitrePrecedent ? 'disabled' : ''} aria-label="Chapitre précédent">${icon('skip-back')}</button>
      <button type="button" data-action="page-prev" aria-label="Page précédente">${icon('chevron-left')}</button>
      <button type="button" data-action="previous" aria-label="Revenir d’une phrase">${icon('rotate-ccw')}</button>
      <button type="button" data-action="next" aria-label="Avancer d’une phrase">${icon('rotate-cw')}</button>
      <button type="button" data-action="page-next" aria-label="Page suivante">${icon('chevron-right')}</button>
      <button type="button" data-action="chapter-step" data-id="1" ${chapitreSuivant ? 'disabled' : ''} aria-label="Chapitre suivant">${icon('skip-forward')}</button>
    </div>`;
}
