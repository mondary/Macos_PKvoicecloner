import { unzipSync, strFromU8 } from 'fflate';
import type { Book, Chapter } from './types';

/* Marqueurs internes de mise en forme (jamais affichés) : l'import les pose
   autour des passages italiques et des citations pour que la page de lecture
   garde un peu du livre d'origine. */
const ITALIQUE_DEBUT = '\uE000', ITALIQUE_FIN = '\uE001';
const CITATION_DEBUT = '\uE002', CITATION_FIN = '\uE003';

interface Decoupage { phrases: string[]; paragraphes: number[]; styles: string[] }

/** Texte brut + marques de style caractère par caractère. */
function extraire(texte: string): { plain: string; italique: boolean[]; citation: boolean[] } {
  let plain = '';
  const italique: boolean[] = [];
  const citation: boolean[] = [];
  let ital = 0, cit = 0;
  for (const ch of texte) {
    if (ch === ITALIQUE_DEBUT) { ital++; continue; }
    if (ch === ITALIQUE_FIN) { ital = Math.max(0, ital - 1); continue; }
    if (ch === CITATION_DEBUT) { cit++; continue; }
    if (ch === CITATION_FIN) { cit = Math.max(0, cit - 1); continue; }
    plain += ch; italique.push(ital > 0); citation.push(cit > 0);
  }
  return { plain, italique, citation };
}

/** Coupe une phrase trop longue en préférant les frontières de clause
 *  (point-virgule, deux-points, virgule, tiret), puis l'espace. 400 maxi. */
export function couperLongue(texte: string, maxi = 400): string[] {
  const parts: string[] = [];
  let reste = texte.trim();
  while (reste.length > maxi) {
    let coupe = 0;
    for (const separateur of [' ; ', ' : ', ', ', ' — ']) {
      const at = reste.lastIndexOf(separateur, maxi);
      if (at > 120) coupe = Math.max(coupe, at + separateur.trimEnd().length);
    }
    if (coupe <= 0) {
      const at = reste.lastIndexOf(' ', maxi);
      coupe = at > 120 ? at : maxi;
    }
    parts.push(reste.slice(0, coupe).trimEnd());
    reste = reste.slice(coupe).trimStart();
  }
  if (reste) parts.push(reste);
  return parts;
}

/** Phrases d'un texte, paragraphe d'origine et style (italique, citation).
 *  `i` = italique, `q` = citation — appliqués à la phrase entière au rendu. */
export function paragraphsOf(text: string): Decoupage {
  const cleaned = text.replace(/\r/g, '').replace(/[\t\u00a0]/g, ' ')
    // Les répliques sur des lignes consécutives restent des tours de parole.
    .replace(/(^|\n)([ ]*[—–][^\n]*)/g, '\n\n$2\n\n').trim();
  const phrases: string[] = [];
  const paragraphes: number[] = [];
  const styles: string[] = [];
  const segmenter = new Intl.Segmenter('fr', { granularity: 'sentence' });
  let paragraphe = 0;
  for (const block of cleaned.split(/\n\s*\n/)) {
    const { plain, italique, citation } = extraire(block.replace(/\s+/g, ' ').trim());
    if (!plain.trim()) continue;
    let compte = 0;
    const decoupes = Array.from(segmenter.segment(plain));
    for (let i = 0; i < decoupes.length; i++) {
      let { segment } = decoupes[i];
      const { index } = decoupes[i];
      // Intl coupe parfois « M. Dupont » après le titre : garder le nom avec
      // sa réplique, indispensable à la détection des personnages.
      while (/\b(?:M|Mme|Mlle|Dr|Pr|Mr|Mrs|Ms)\.$/.test(segment.trimEnd()) && i + 1 < decoupes.length) {
        segment += decoupes[++i].segment;
      }
      const debut = index + (segment.length - segment.trimStart().length);
      const fin = index + segment.trimEnd().length;
      if (fin <= debut) continue;
      let italiques = 0, citations = 0;
      for (let i = debut; i < fin; i++) { if (italique[i]) italiques++; if (citation[i]) citations++; }
      let style = '';
      if (italiques > (fin - debut) * 0.55) style += 'i';
      if (citations > (fin - debut) * 0.5) style += 'q';
      for (const morceau of couperLongue(segment.trim())) {
        phrases.push(morceau); paragraphes.push(paragraphe); styles.push(style); compte++;
      }
    }
    if (compte) paragraphe++;
  }
  return { phrases, paragraphes, styles };
}

export function sentences(text: string): string[] {
  return paragraphsOf(text).phrases;
}

/** Reconstruit des paragraphes plausibles pour un livre importé avant leur suivi.
 *  Chaque réplique (tiret cadratin, guillemet) forme son bloc ; le récit est
 *  regroupé par quatre phrases au plus. Aucun texte n'est modifié. */
export function reparerParagraphes(book: Book): number {
  const paragraphs: number[] = [];
  let id = 0, recit = 0;
  book.chapters.forEach(chapitre => { if (chapitre.start < book.segments.length) { /* bornes utiles */ } });
  const debuts = new Set(book.chapters.map(c => c.start));
  for (let i = 0; i < book.segments.length; i++) {
    const texte = (book.segments[i] ?? '').trim();
    const replique = /^[—–«"“]/.test(texte);
    let nouveau = i === 0 || debuts.has(i);
    if (replique) nouveau = nouveau || i > 0;
    else nouveau = nouveau || recit >= 4;
    if (nouveau) { id++; recit = 0; }
    paragraphs.push(id);
    if (!replique) recit++;
  }
  book.paragraphs = paragraphs;
  return id;
}
/** Réduit la couverture (~24–48 Ko) : une data-URL plein format alourdissait
 *  chaque sauvegarde du livre. Repli sur l'image d'origine si le canvas manque. */
async function compacterCouverture(blob: Blob): Promise<string> {
  try {
    if (typeof createImageBitmap !== 'function') throw new Error('canvas indisponible');
    const bitmap = await createImageBitmap(blob);
    try {
      const largeur = Math.min(420, bitmap.width || 420);
      const hauteur = Math.max(1, Math.round((bitmap.height || largeur) * largeur / (bitmap.width || largeur)));
      const canvas = document.createElement('canvas');
      canvas.width = largeur; canvas.height = hauteur;
      const contexte = canvas.getContext('2d');
      if (!contexte) throw new Error('canvas indisponible');
      contexte.drawImage(bitmap, 0, 0, largeur, hauteur);
      const webp = canvas.toDataURL('image/webp', 0.82);
      if (webp.startsWith('data:image/webp') && webp.length < 160_000) return webp;
      const jpeg = canvas.toDataURL('image/jpeg', 0.82);
      return jpeg.length < 160_000 ? jpeg : webp;
    } finally { bitmap.close?.(); }
  } catch {
    return await new Promise<string>((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(String(lecteur.result));
      lecteur.onerror = () => reject(lecteur.error);
      lecteur.readAsDataURL(blob);
    });
  }
}

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Le fichier EPUB contient un document XML illisible.');
  return doc;
}
function byName(doc: Document | Element, name: string): Element[] { return Array.from(doc.getElementsByTagNameNS('*', name)); }
function textFromHTML(source: string): { title: string; text: string } {
  // HTML is parsed in an inert document, never inserted into the live reader.
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script,style,nav,svg,form,iframe').forEach(e => e.remove());
  const title = doc.querySelector('h1,h2,title')?.textContent?.trim() ?? '';
  // Les italiques et les citations gardent une marque, retirée au découpage ;
  // le texte lui-même n'est jamais interprété comme du HTML par le lecteur.
  const blocs = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BR', 'BLOCKQUOTE']);
  let sortie = '';
  const visiter = (noeud: Node, italique: boolean, citation: boolean) => {
    if (noeud.nodeType === Node.TEXT_NODE) {
      const texte = (noeud.textContent ?? '').replace(/\s+/g, ' ');
      if (!texte.trim()) return;
      if (italique) sortie += ITALIQUE_DEBUT;
      if (citation) sortie += CITATION_DEBUT;
      sortie += texte;
      if (citation) sortie += CITATION_FIN;
      if (italique) sortie += ITALIQUE_FIN;
      return;
    }
    if (noeud.nodeType !== Node.ELEMENT_NODE) return;
    const el = noeud as HTMLElement;
    if (blocs.has(el.tagName)) sortie += '\n\n';
    const ital = italique || el.tagName === 'EM' || el.tagName === 'I';
    const cit = citation || el.tagName === 'BLOCKQUOTE';
    el.childNodes.forEach(enfant => visiter(enfant, ital, cit));
    if (blocs.has(el.tagName)) sortie += '\n\n';
  };
  visiter(doc.body, false, false);
  return { title, text: sortie };
}
function resolvePath(base: string, href: string): string {
  const url = new URL(href, `https://epub.local/${base}`);
  return decodeURIComponent(url.pathname.slice(1));
}
export async function importBook(file: File): Promise<Book> {
  if (file.size > 80 * 1024 * 1024) throw new Error('Ce fichier dépasse 80 Mo. Importe un EPUB ou un PDF plus léger.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash).slice(0, 12), v => v.toString(16).padStart(2, '0')).join('');
  const format = file.name.split('.').pop()?.toLowerCase() ?? '';
  const book: Book = { id, title: file.name.replace(/\.[^.]+$/, ''), author: 'Auteur non renseigné', format: format.toUpperCase(), language: 'fr', color: parseInt(id.slice(0, 2), 16) % 5, segments: [], chapters: [], position: 0, completed: false, added: Date.now(), opened: 0, bookmarks: [], paragraphs: [], styles: [] };
  let paragrapheSuivant = 0;
  function addChapter(title: string, text: string) {
    const start = book.segments.length;
    const { phrases, paragraphes, styles } = paragraphsOf(text);
    book.segments.push(...phrases);
    book.styles!.push(...styles);
    // ids de paragraphe uniques dans le livre, chapitre après chapitre
    book.paragraphs!.push(...paragraphes.map(p => p + paragrapheSuivant));
    paragrapheSuivant += (paragraphes.length ? Math.max(...paragraphes) + 1 : 0);
    if (book.segments.length > start) book.chapters.push({ title, start, end: book.segments.length });
  }
  if (format === 'epub') {
    let expanded = 0;
    const files = unzipSync(bytes, { filter: entry => {
      expanded += entry.originalSize;
      if (expanded > 160 * 1024 * 1024) throw new Error('EPUB trop volumineux une fois décompressé.');
      return !/\.(mp4|mp3|woff2?|ttf|otf)$/i.test(entry.name);
    } });
    const get = (path: string) => { if (!files[path]) throw new Error(`Fichier EPUB manquant : ${path}`); return strFromU8(files[path]); };
    if (files['META-INF/encryption.xml']) {
      const encryption = get('META-INF/encryption.xml');
      if (/adobe:adept|xmlenc#aes/i.test(encryption)) throw new Error('Cet EPUB est protégé par DRM. Importe une copie sans DRM.');
    }
    const container = xml(get('META-INF/container.xml'));
    const opfPath = byName(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw new Error('Structure EPUB non reconnue.');
    const opf = xml(get(opfPath));
    book.title = byName(opf, 'title')[0]?.textContent?.trim() || book.title;
    book.author = byName(opf, 'creator')[0]?.textContent?.trim() || book.author;
    book.language = byName(opf, 'language')[0]?.textContent?.trim() || 'fr';
    const manifest = new Map(byName(opf, 'item').map(item => [item.id, item]));
    const coverMeta = byName(opf, 'meta').find(e => e.getAttribute('name') === 'cover')?.getAttribute('content');
    const cover = [...manifest.values()].find(e => e.getAttribute('properties')?.split(' ').includes('cover-image')) || manifest.get(coverMeta ?? '');
    if (cover) {
      const data = files[resolvePath(opfPath, cover.getAttribute('href') ?? '')];
      const mime = cover.getAttribute('media-type') ?? '';
      if (data && data.length < 4_000_000 && ['image/jpeg','image/png','image/webp'].includes(mime)) {
        book.cover = await compacterCouverture(new Blob([new Uint8Array(data)], { type: mime }));
      }
    }
    for (const ref of byName(opf, 'itemref')) {
      if (ref.getAttribute('linear') === 'no') continue;
      const item = manifest.get(ref.getAttribute('idref') ?? '');
      if (!item) continue;
      const path = resolvePath(opfPath, item.getAttribute('href') ?? '');
      const { title, text } = textFromHTML(get(path));
      addChapter(title || `Chapitre ${book.chapters.length + 1}`, text);
    }
  } else if (format === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
        addChapter(`Page ${i}`, text);
        page.cleanup();
      }
    } finally { await loadingTask.destroy(); }
  } else if (['txt', 'md'].includes(format)) {
    addChapter('Le texte', new TextDecoder().decode(bytes));
  } else { throw new Error('Choisis un livre au format EPUB, PDF, TXT ou Markdown.'); }
  if (!book.segments.length) throw new Error('Aucun texte lisible dans ce fichier. Les PDF scannés nécessitent une reconnaissance de texte préalable.');
  return book;
}
/** Répare les métadonnées vides/génériques des EPUB sans modifier leur texte,
 *  ni les bornes des chapitres, donc sans invalider les lots déjà analysés. */
export function normaliserTitresChapitres(book: Book): boolean {
  let changed = false;
  book.chapters.forEach((chapter, index) => {
    if (!chapter.title?.trim() || /^(?:(?:inconnu(?:e)?|unknown|untitled|sans titre|n\/a)[\s·,;:/—-]*)+$/i.test(chapter.title.trim())) {
      chapter.title = `Chapitre ${index + 1}`; changed = true;
    }
  });
  return changed;
}
export function chapterAt(book: Book, position = book.position): Chapter { return book.chapters.find(c => position >= c.start && position < c.end) ?? book.chapters[book.chapters.length - 1]; }
export function minutesLeft(book: Book, rate: number): number { return Math.max(1, Math.ceil(book.segments.slice(book.position).join(' ').split(/\s+/).length / (165 * rate))); }
export function welcomeBook(): Book {
  const chapters = [
    { title: 'Le plaisir de tourner la page', text: "Il y a des livres que l’on emporte partout. Dans un train, au bord d’une fenêtre, dans le silence de la maison. Et puis il y a les jours où les mains sont occupées, mais où l’esprit a envie de voyager.\n\nPK Reader est né pour ces moments-là. Vos livres prennent la parole, à votre rythme, avec la voix que vous choisissez. Commencez doucement. Puis trouvez la vitesse qui vous ressemble.\n\nTouchez une phrase pour commencer la lecture à cet endroit. Le passage en cours reste surligné, comme un fil discret entre la page et la voix. Vous pouvez fermer l’écran de votre téléphone : l’histoire continue." },
    { title: 'Une voix qui vous ressemble', text: "La voix de votre téléphone est prête à lire. Dans l’onglet Voix, vous pouvez aussi télécharger une voix française légère. Une fois installée, elle fonctionne sans connexion et sans abonnement.\n\nVous avez créé une voix dans PK Voice Studio ? Reliez votre Mac dans les réglages. Les passages générés sont conservés sur votre téléphone. Préparez un chapitre avant de partir, puis écoutez-le même sans réseau.\n\nLe minuteur permet de s’endormir avec quelques pages. Les signets gardent les passages que vous souhaitez retrouver. Et la prochaine fois, votre livre vous attend exactement là où vous l’avez laissé." },
    { title: 'Votre prochain livre vous attend', text: "Revenez à votre bibliothèque et touchez le bouton plus. Choisissez un EPUB, un PDF contenant du texte ou un simple fichier texte. Le livre est importé sur votre appareil.\n\nPour lire confortablement, ajustez la taille du texte et choisissez le thème clair, papier ou nuit. Pour écouter plus vite, passez progressivement à une fois et demie, puis deux fois la vitesse normale.\n\nCe court guide est un texte original de démonstration. Il ne vous reste plus qu’à ouvrir un livre qui vous plaît. Bonne lecture." },
  ];
  const segments: string[] = []; const chapterList: Chapter[] = []; const paragraphs: number[] = []; const styles: string[] = [];
  let paragrapheSuivant = 0;
  for (const c of chapters) {
    const start = segments.length;
    const { phrases, paragraphes, styles: bloc } = paragraphsOf(c.text);
    segments.push(...phrases);
    styles.push(...bloc);
    paragraphs.push(...paragraphes.map(p => p + paragrapheSuivant));
    paragrapheSuivant += (paragraphes.length ? Math.max(...paragraphes) + 1 : 0);
    chapterList.push({ title: c.title, start, end: segments.length });
  }
  return { id:'welcome', title:'Un livre.\nUne voix.\nEt vous.', author:'Bienvenue dans PK Reader', format:'GUIDE', language:'fr', color:0, segments, chapters:chapterList, position:0, completed:false, added:Date.now(), opened:0, bookmarks:[], paragraphs, styles, sample:true };
}
