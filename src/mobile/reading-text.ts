import type { Book } from './types';

export interface PageRun { index: number; from: number; to: number }
export type ReadingPage = PageRun[];
const esc = (text: string) => text.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function chapterRuns(book: Book, start: number, end: number): PageRun[] {
  return book.segments.slice(start, end).map((text, offset) => ({ index: start + offset, from: 0, to: text.length }));
}

/** Une phrase reste adressable pour l'audio, mais n'est pas un paragraphe.
 *  Les coordonnées et le texte source restent inchangés pour le karaoké. */
export function renderReadingText(book: Book, runs: PageRun[]): string {
  let html = '', previous: number | undefined;
  for (const run of runs) {
    const paragraph = book.paragraphs?.[run.index] ?? run.index;
    const start = paragraph !== previous;
    if (start) html += `${previous === undefined ? '' : '</p>'}<p class="book-paragraph" data-paragraph="${paragraph}">`;
    else html += ' ';
    const style = book.styles?.[run.index] ?? '';
    const classes = ['sentence', run.index === book.position ? 'current-sentence' : '',
      book.bookmarks.includes(run.index) ? 'marked' : '', style.includes('i') ? 'sentence-italique' : '',
      style.includes('q') ? 'sentence-citation' : ''].filter(Boolean).join(' ');
    // Un bouton HTML est un contrôle atomique : il empêche le texte de se
    // composer naturellement sur plusieurs lignes. Le span reçoit la même
    // sémantique et les raccourcis Entrée/Espace dans le lecteur.
    html += `<span role="button" tabindex="0" class="${classes}" data-action="sentence" data-index="${run.index}" data-debut="${run.from}" ${run.index === book.position ? 'aria-current="true"' : ''}>${esc(book.segments[run.index].slice(run.from, run.to))}</span>`;
    previous = paragraph;
  }
  return html + (previous === undefined ? '' : '</p>');
}

/** Mesure le même rendu que la page réelle, y compris les paragraphes. Les
 *  longues phrases peuvent déborder sur la page suivante sans perdre de texte. */
export function paginateReading(book: Book, start: number, end: number, first: number, other: number,
  fits: (runs: PageRun[], height: number) => boolean): ReadingPage[] {
  const pages: ReadingPage[] = [];
  let current: ReadingPage = [], height = Math.max(48, first);
  const flush = () => { pages.push(current); current = []; height = Math.max(48, other); };
  for (let index = start; index < end; index++) {
    const text = book.segments[index];
    let from = 0;
    while (from < text.length) {
      const full = { index, from, to: text.length };
      if (fits([...current, full], height)) { current.push(full); break; }
      if (current.length) { flush(); continue; }
      let lo = from + 1, hi = text.length, best = from;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits([{ index, from, to: mid }], height)) { best = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      let to = Math.max(from + 1, best);
      if (to < text.length) {
        const space = text.slice(from, to).search(/\s+\S*$/);
        if (space > 0) to = from + space + 1;
      }
      current.push({ index, from, to }); from = to; flush();
    }
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}
