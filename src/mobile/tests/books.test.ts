// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importBook, sentences, chapterAt, welcomeBook } from '../books';

function fixture(entries: Record<string,string>, name='book.epub'):File {
  const bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)])));
  return { name, size:bytes.length, arrayBuffer:async()=>bytes.buffer } as File;
}
const container='<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>';
const opf='<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Un vrai livre</dc:title><dc:creator>Une autrice</dc:creator><dc:date>2019-03-05</dc:date></metadata><manifest><item id="two" href="chapters/second.xhtml"/><item id="one" href="chapters/premier%20chapitre.xhtml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>';
describe('EPUB import',()=>{
  it('respects spine order, resolves paths, reads metadata and strips executable markup',async()=>{
    const book=await importBook(fixture({'META-INF/container.xml':container,'OPS/book.opf':opf,'OPS/chapters/premier chapitre.xhtml':'<h1>Début</h1><p>Bonjour le monde.</p><script>window.injected=true</script>','OPS/chapters/second.xhtml':'<h1>La suite</h1><p>Une autre phrase.</p>'}));
    expect(book.title).toBe('Un vrai livre');expect(book.author).toBe('Une autrice');expect(book.year).toBe(2019);expect(book.chapters.map(c=>c.title)).toEqual(['Début','La suite']);expect(book.segments.join(' ')).not.toContain('injected');expect(book.segments.join(' ')).not.toContain('<');
    expect(chapterAt(book,book.chapters[1].start).title).toBe('La suite');
  });
  it('rejects encrypted books with an actionable error',async()=>{
    await expect(importBook(fixture({'META-INF/encryption.xml':'urn:adobe:adept','META-INF/container.xml':container}))).rejects.toThrow('DRM');
  });
  it('rejects unsupported files instead of importing binary text',async()=>{
    await expect(importBook(fixture({},'picture.png'))).rejects.toThrow('EPUB, PDF');
  });
});
describe('speech segmentation',()=>{
  it('préserve les tours de parole et les noms précédés de M. ou Mme.', () => {
    const result = paragraphsOf('— Bonjour, dit M. Dupont.\n— Bonsoir, répondit Mme. Martin.\nIl partit.');
    expect(result.phrases).toEqual(['— Bonjour, dit M. Dupont.', '— Bonsoir, répondit Mme. Martin.', 'Il partit.']);
    expect(result.paragraphes).toEqual([0, 1, 2]);
  });
  it('keeps sentences bounded for native TTS without losing words',()=>{
    const source='Un mot très long. '+Array(150).fill('lecture').join(' ')+'.';
    const result=sentences(source);expect(result.every(s=>s.length<=400)).toBe(true);expect(result.join(' ')).toBe(source);
  });
  it('provides real sample chapters and stable chapter boundaries',()=>{
    const sample=welcomeBook();expect(sample.chapters).toHaveLength(3);expect(sample.chapters[2].end).toBe(sample.segments.length);expect(sample.segments.length).toBeGreaterThan(15);
  });
});

import { paragraphsOf } from '../books';

describe('paragraphes d’origine', () => {
  it('garde le paragraphe de chaque phrase, même sur plusieurs blocs', () => {
    const { phrases, paragraphes } = paragraphsOf('Premier paragraphe. Deuxième phrase.\n\nNouveau bloc. Encore une.');
    expect(phrases).toHaveLength(4);
    expect(paragraphes).toEqual([0, 0, 1, 1]);
  });

  it('numérote chaque bloc une fois, même vide ou très long', () => {
    const long = `${'mot '.repeat(200)}fin.`;
    const { phrases, paragraphes } = paragraphsOf(`Court.\n\n\n\n${long}`);
    expect(paragraphes[0]).toBe(0);
    expect(new Set(paragraphes.slice(1))).toEqual(new Set([1]));
    expect(phrases.length).toBeGreaterThan(2);
  });
});

import { reparerParagraphes } from '../books';
import type { Book } from '../types';

describe('mise en forme et paragraphes reconstitués', () => {
  it('marque les phrases italiques et les citations', () => {
    const { phrases, styles } = paragraphsOf('\uE000Une pensée intime.\uE001 Un récit normal.\n\n\uE002Une citation.\uE003');
    expect(phrases).toEqual(['Une pensée intime.', 'Un récit normal.', 'Une citation.']);
    expect(styles).toEqual(['i', '', 'q']);
  });

  it('reconstitue des blocs plausibles pour un ancien livre', () => {
    const book = {
      id: 'vieux', title: 'Vieux', author: '', format: 'EPUB', language: 'fr', color: 0,
      segments: ['Récit un.', 'Récit deux.', 'Récit trois.', 'Récit quatre.', 'Récit cinq.',
        '— Bonjour.', '— Bonjour à toi.', 'Il repartit.'],
      chapters: [{ title: 'Un', start: 0, end: 8 }],
      position: 0, completed: false, added: 0, opened: 0, bookmarks: [],
    } as Book;
    const nombre = reparerParagraphes(book);
    expect(nombre).toBeGreaterThan(1);
    expect(book.paragraphs).toHaveLength(8);
    expect(book.paragraphs![0]).toBe(book.paragraphs![3]);       // récit groupé
    expect(book.paragraphs![4]).not.toBe(book.paragraphs![3]);   // 5e phrase : nouveau bloc
    expect(book.paragraphs![5]).not.toBe(book.paragraphs![6]);   // chaque réplique son bloc
  });
});

import { couperLongue } from '../books';

describe('coupes des phrases trop longues', () => {
  it('coupe aux virgules et points-virgules plutôt qu’au hasard', () => {
    const phrase = `${'a'.repeat(150)}, ${'b'.repeat(140)}; ${'c'.repeat(150)}.`;
    const parts = couperLongue(phrase, 200);
    expect(parts.every(p => p.length <= 200)).toBe(true);
    expect(parts[0].endsWith(',')).toBe(true);
    expect(parts[1].endsWith(';')).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toContain('c'.repeat(150));
  });

  it('retombe sur les espaces quand aucune ponctuation ne convient', () => {
    const mots = Array.from({ length: 160 }, (_, i) => `mot${i}`).join(' ');
    const parts = couperLongue(mots, 200);
    expect(parts.every(p => p.length <= 200)).toBe(true);
    expect(parts.join(' ')).toBe(mots);
  });

  it('laisse une phrase courte intacte', () => {
    expect(couperLongue('Une phrase normale.', 400)).toEqual(['Une phrase normale.']);
  });
});
