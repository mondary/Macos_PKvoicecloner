import type { Book } from './types';

export interface BookSearchHit {
  index: number;
  chapter: string;
  before: string;
  match: string;
  after: string;
}

/** Plie un texte sans perdre la correspondance avec l'original : accents et
 *  majuscules sont ignorés, mais l'extrait affiché garde la typographie du livre. */
function plier(texte: string) {
  const lettres: string[] = [];
  const positions: number[] = [];
  let brut = 0;
  for (const caractere of texte) {
    const plie = caractere.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
    for (const lettre of plie) { lettres.push(lettre); positions.push(brut); }
    brut += caractere.length;
  }
  return { texte: lettres.join(''), positions };
}

/** Recherche locale dans le livre, insensible aux accents et à la casse. */
export function rechercherDansLivre(book: Book, requete: string, limite = 30): BookSearchHit[] {
  const besoin = plier(requete.trim()).texte;
  if (besoin.length < 2) return [];
  const resultats: BookSearchHit[] = [];
  const vus = new Set<string>();
  book.segments.forEach((segment, index) => {
    const { texte, positions } = plier(segment);
    let depart = 0;
    while (resultats.length < limite && (depart = texte.indexOf(besoin, depart)) !== -1) {
      const debutBrut = positions[depart] ?? 0;
      const finIndex = depart + besoin.length;
      const finBrute = finIndex < positions.length ? positions[finIndex] : segment.length;
      const depuis = Math.max(0, debutBrut - 52);
      const jusqua = Math.min(segment.length, finBrute + 68);
      const chapitre = book.chapters.find(c => index >= c.start && index < c.end)?.title ?? `Chapitre ${book.chapters.length}`;
      const before = `${depuis > 0 ? '…' : ''}${segment.slice(depuis, debutBrut)}`;
      const match = segment.slice(debutBrut, finBrute);
      const after = `${segment.slice(finBrute, jusqua)}${jusqua < segment.length ? '…' : ''}`;
      const cle = `${before}|${match}|${after}`;
      if (!vus.has(cle)) {
        vus.add(cle);
        resultats.push({ index, chapter: chapitre, before, match, after });
      }
      depart = finIndex;
    }
  });
  return resultats;
}
