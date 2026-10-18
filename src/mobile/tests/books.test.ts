// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importBook, sentences, chapterAt, welcomeBook } from '../books';

function fixture(entries: Record<string,string>, name='book.epub'):File {
  const bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)])));
  return { name, size:bytes.length, arrayBuffer:async()=>bytes.buffer } as File;
}
const container='<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>';
const opf='<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Un vrai livre</dc:title><dc:creator>Une autrice</dc:creator></metadata><manifest><item id="two" href="chapters/second.xhtml"/><item id="one" href="chapters/premier%20chapitre.xhtml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>';
describe('EPUB import',()=>{
  it('respects spine order, resolves paths, reads metadata and strips executable markup',async()=>{
    const book=await importBook(fixture({'META-INF/container.xml':container,'OPS/book.opf':opf,'OPS/chapters/premier chapitre.xhtml':'<h1>Début</h1><p>Bonjour le monde.</p><script>window.injected=true</script>','OPS/chapters/second.xhtml':'<h1>La suite</h1><p>Une autre phrase.</p>'}));
    expect(book.title).toBe('Un vrai livre');expect(book.author).toBe('Une autrice');expect(book.chapters.map(c=>c.title)).toEqual(['Début','La suite']);expect(book.segments.join(' ')).not.toContain('injected');expect(book.segments.join(' ')).not.toContain('<');
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
  it('keeps sentences bounded for native TTS without losing words',()=>{
    const source='Un mot très long. '+Array(150).fill('lecture').join(' ')+'.';
    const result=sentences(source);expect(result.every(s=>s.length<=400)).toBe(true);expect(result.join(' ')).toBe(source);
  });
  it('provides real sample chapters and stable chapter boundaries',()=>{
    const sample=welcomeBook();expect(sample.chapters).toHaveLength(3);expect(sample.chapters[2].end).toBe(sample.segments.length);expect(sample.segments.length).toBeGreaterThan(15);
  });
});
