import type { Book, Casting, Character, Settings } from './types';

export function ensureCasting(book: Book): Casting {
  return book.casting ??= { enabled: false, characters: [
    { id: 'narrator', name: 'Narrateur', voice: '', pitch: 1, rate: 1 },
  ], assignments: {} };
}

export function characterAt(book: Book, index: number): Character | undefined {
  if (!book.casting?.enabled) return;
  const id = book.casting.assignments[String(index)] ?? 'narrator';
  return book.casting.characters.find(c => c.id === id) ?? book.casting.characters.find(c => c.id === 'narrator');
}

export function speechProfile(book: Book, settings: Settings, index: number) {
  const role = characterAt(book, index);
  const voice = role?.voice || settings.voice;
  return { voice: book.casting?.enabled && voice.startsWith('clone:') ? 'system:default' : voice, pitch: role?.pitch ?? 1,
    rate: Math.min(3, Math.max(0.5, settings.rate * (role?.rate ?? 1))) };
}

/** Conservative local hints, never guessing a speaker from alternating dialogue.
 * Explicit Name: and short dialogue followed by an attribution are recognised.
 * Narrative mentions alone are deliberately left unassigned. Manual choices win. */
export function suggestCasting(book: Book, start: number, end: number): number {
  const casting = ensureCasting(book);
  let added = 0;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let index = start; index < end; index++) {
    if (Object.hasOwn(casting.assignments, String(index))) continue;
    const text = book.segments[index];
    const matches = casting.characters.filter(c => c.id !== 'narrator' && (
      new RegExp(`^\\s*(?:[—–«“\"]\\s*)?${escape(c.name)}\\s*[:：]`, 'iu').test(text) ||
      new RegExp(`[,»”\"]\\s*(?:[—–-]\\s*)?(?:dit|demanda|répondit|ajouta|murmura|cria|souffla|s’écria|s'exclama|said|asked|replied)\\s+${escape(c.name)}[.!?…\\s]*$`, 'iu').test(text)
    ));
    if (matches.length === 1) { casting.assignments[String(index)] = matches[0].id; added++; }
  }
  return added;
}
