import { describe, expect, it } from 'vitest';
import { hasHidden, markHidden } from './text';

describe('hidden characters', () => {
  it('marks bidi and zero-width characters', () => {
    const text = 'a' + String.fromCharCode(0x202e) + 'b' + String.fromCharCode(0x200b) + 'c';
    expect(hasHidden(text)).toBe(true);
    expect(markHidden(text)).toBe('a⟦U+202E⟧b⟦U+200B⟧c');
  });
  it('marks the soft hyphen, which the source names by its code point', () => {
    expect(markHidden('a' + String.fromCharCode(0xad) + 'b')).toBe('a⟦U+00AD⟧b');
  });
  it('leaves plain text, umlauts and emoji alone', () => {
    const text = 'Käse 😀 中文';
    expect(hasHidden(text)).toBe(false);
    expect(markHidden(text)).toBe(text);
  });
});
