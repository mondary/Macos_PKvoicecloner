import { describe, it, expect } from 'vitest';
import { decouperMots, motPourPlage, motPourProgression, rendreMots } from '../karaoke';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

describe('karaoké mot à mot', () => {
  it('découpe les mots avec leurs positions exactes', () => {
    expect(decouperMots('Bonjour, Alice !')).toEqual([
      { mot: 'Bonjour,', debut: 0, fin: 8 },
      { mot: 'Alice', debut: 9, fin: 14 },
      { mot: '!', debut: 15, fin: 16 },
    ]);
    expect(decouperMots('   ')).toEqual([]);
  });

  it('retrouve le mot depuis la plage de caractères du TTS', () => {
    const mots = decouperMots('Il était une fois un livre.');
    expect(motPourPlage(mots, 3, 8)).toBe(1);      // « était »
    expect(motPourPlage(mots, 21, 27)).toBe(5);    // « livre. »
    expect(motPourPlage(mots, 8, 9)).toBe(1);      // une espace : le mot précédent
    expect(motPourPlage([], 0, 2)).toBe(-1);
  });

  it('estime le mot depuis la position du WAV', () => {
    const mots = decouperMots('Les livres nous accompagnent.');
    expect(motPourProgression(mots, 0, 0)).toBe(0);
    expect(motPourProgression(mots, 0, 4000)).toBe(0);
    expect(motPourProgression(mots, 4000, 4000)).toBe(3);
    expect(motPourProgression(mots, 99999, 4000)).toBe(3);   // borné au dernier mot
  });

  it('rend la phrase en mots, le mot actif en surbrillance, sans casser le HTML', () => {
    const html = rendreMots('a < b puis c', 3, esc);
    expect(html).toContain('&lt;');
    expect(html).toContain('<span class="mot mot-lu">a</span>');
    expect(html).toContain('<span class="mot mot-lu">b</span>');
    expect(html).toContain('<span class="mot mot-actif">puis</span>');
  });
});
