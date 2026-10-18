import { describe, it, expect } from 'vitest';
import { ensureCasting, characterAt, speechProfile, suggestCasting } from '../casting';
import { defaults, type Book } from '../types';

function fixture(): Book {
  return { id: 'cast', title: 'Deux voix', author: '', format: 'TXT', language: 'fr', color: 0,
    segments: ['La nuit tombe.', 'Pierre : Où allez-vous ?', '« Chez moi », répondit Alice.', 'Alice entra dans la maison.', '— Qui est là ?'],
    chapters: [{ title: 'Un', start: 0, end: 5 }], position: 0, completed: false, added: 0, opened: 0, bookmarks: [] };
}

describe('local multi-character reading', () => {
  it('keeps old books working and resolves narrator and per-sentence profiles', () => {
    const book = fixture();
    expect(characterAt(book, 0)).toBeUndefined();
    expect(speechProfile(book, defaults, 0)).toEqual({ voice: 'system:default', pitch: 1, rate: 1 });
    const cast = ensureCasting(book); cast.enabled = true;
    cast.characters[0].voice = 'neural:siwis';
    cast.characters.push({ id: 'pierre', name: 'Pierre', voice: 'neural:tom', pitch: 0.8, rate: 0.9 });
    cast.assignments['1'] = 'pierre';
    expect(speechProfile(book, { ...defaults, rate: 1.5 }, 1)).toEqual({ voice: 'neural:tom', pitch: 0.8, rate: 1.35 });
    expect(speechProfile(book, defaults, 0).voice).toBe('neural:siwis');
    cast.assignments['2'] = 'deleted-role';
    expect(characterAt(book, 2)?.id).toBe('narrator');
    expect(JSON.parse(JSON.stringify(book)).casting).toEqual(cast);
    cast.enabled = false;
    expect(speechProfile(book, defaults, 1).pitch).toBe(1);
  });

  it('suggests explicit speech only, preserves manual decisions and chapter scope', () => {
    const book = fixture(); const cast = ensureCasting(book);
    cast.characters.push({ id: 'pierre', name: 'Pierre', voice: '', pitch: 1, rate: 1 }, { id: 'alice', name: 'Alice', voice: '', pitch: 1, rate: 1 });
    expect(suggestCasting(book, 0, 2)).toBe(1);
    expect(cast.assignments).toEqual({ '1': 'pierre' });
    cast.assignments['1'] = 'narrator';
    expect(suggestCasting(book, 0, 5)).toBe(1);
    expect(cast.assignments).toEqual({ '1': 'narrator', '2': 'alice' });
    expect(suggestCasting(book, 0, 5)).toBe(0);
  });

  it('never routes local casting to a connected Mac even when the global voice is a clone', () => {
    const book = fixture(); ensureCasting(book).enabled = true;
    expect(speechProfile(book, { ...defaults, voice: 'clone:abcdef' }, 0).voice).toBe('system:default');
  });
});
