import { unzipSync, strFromU8 } from 'fflate';
import type { Book, Chapter } from './types';

export function sentences(text: string): string[] {
  const cleaned = text.replace(/\r/g, '').replace(/[\t\u00a0]/g, ' ').trim();
  const result: string[] = [];
  const segmenter = new Intl.Segmenter('fr', { granularity: 'sentence' });
  for (const paragraph of cleaned.split(/\n\s*\n/)) {
    for (const { segment } of segmenter.segment(paragraph.replace(/\s+/g, ' ').trim())) {
      let rest = segment.trim();
      while (rest.length > 400) {
        const at = rest.lastIndexOf(' ', 400);
        const split = at > 150 ? at : 400;
        result.push(rest.slice(0, split)); rest = rest.slice(split).trim();
      }
      if (rest) result.push(rest);
    }
  }
  return result;
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
  doc.querySelectorAll('p,div,h1,h2,h3,li,br,blockquote').forEach(e => e.append('\n\n'));
  return { title, text: doc.body.textContent ?? '' };
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
  const book: Book = { id, title: file.name.replace(/\.[^.]+$/, ''), author: 'Auteur non renseigné', format: format.toUpperCase(), language: 'fr', color: parseInt(id.slice(0, 2), 16) % 5, segments: [], chapters: [], position: 0, completed: false, added: Date.now(), opened: 0, bookmarks: [] };
  function addChapter(title: string, text: string) {
    const start = book.segments.length;
    book.segments.push(...sentences(text));
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
        book.cover = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(new Blob([new Uint8Array(data)], { type: mime })); });
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
export function chapterAt(book: Book, position = book.position): Chapter { return book.chapters.find(c => position >= c.start && position < c.end) ?? book.chapters[book.chapters.length - 1]; }
export function minutesLeft(book: Book, rate: number): number { return Math.max(1, Math.ceil(book.segments.slice(book.position).join(' ').split(/\s+/).length / (165 * rate))); }
export function welcomeBook(): Book {
  const chapters = [
    { title: 'Le plaisir de tourner la page', text: "Il y a des livres que l’on emporte partout. Dans un train, au bord d’une fenêtre, dans le silence de la maison. Et puis il y a les jours où les mains sont occupées, mais où l’esprit a envie de voyager.\n\nPK Reader est né pour ces moments-là. Vos livres prennent la parole, à votre rythme, avec la voix que vous choisissez. Commencez doucement. Puis trouvez la vitesse qui vous ressemble.\n\nTouchez une phrase pour commencer la lecture à cet endroit. Le passage en cours reste surligné, comme un fil discret entre la page et la voix. Vous pouvez fermer l’écran de votre téléphone : l’histoire continue." },
    { title: 'Une voix qui vous ressemble', text: "La voix de votre téléphone est prête à lire. Dans l’onglet Voix, vous pouvez aussi télécharger une voix française légère. Une fois installée, elle fonctionne sans connexion et sans abonnement.\n\nVous avez créé une voix dans PK Voice Studio ? Reliez votre Mac dans les réglages. Les passages générés sont conservés sur votre téléphone. Préparez un chapitre avant de partir, puis écoutez-le même sans réseau.\n\nLe minuteur permet de s’endormir avec quelques pages. Les signets gardent les passages que vous souhaitez retrouver. Et la prochaine fois, votre livre vous attend exactement là où vous l’avez laissé." },
    { title: 'Votre prochain livre vous attend', text: "Revenez à votre bibliothèque et touchez le bouton plus. Choisissez un EPUB, un PDF contenant du texte ou un simple fichier texte. Le livre est importé sur votre appareil.\n\nPour lire confortablement, ajustez la taille du texte et choisissez le thème clair, papier ou nuit. Pour écouter plus vite, passez progressivement à une fois et demie, puis deux fois la vitesse normale.\n\nCe court guide est un texte original de démonstration. Il ne vous reste plus qu’à ouvrir un livre qui vous plaît. Bonne lecture." },
  ];
  const segments: string[] = []; const chapterList: Chapter[] = [];
  for (const c of chapters) { const start = segments.length; segments.push(...sentences(c.text)); chapterList.push({ title: c.title, start, end: segments.length }); }
  return { id:'welcome', title:'Un livre.\nUne voix.\nEt vous.', author:'Bienvenue dans PK Reader', format:'GUIDE', language:'fr', color:0, segments, chapters:chapterList, position:0, completed:false, added:Date.now(), opened:0, bookmarks:[], sample:true };
}
