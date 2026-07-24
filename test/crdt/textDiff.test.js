import { describe, it, expect } from 'vitest';
import { diffCodePoints } from '../../src/crdt/textDiff.js';

describe('diffCodePoints', () => {
  it('finds an append at the end', () => {
    const { start, oldEnd, newEnd } = diffCodePoints('hello', 'hello world');
    expect(start).toBe(5);
    expect(oldEnd).toBe(5);
    expect(newEnd).toBe(11);
  });

  it('finds an insert at the very start', () => {
    const { start, oldEnd, newEnd } = diffCodePoints('world', 'hello world');
    expect(start).toBe(0);
    expect(oldEnd).toBe(0);
    expect(newEnd).toBe(6);
  });

  it('finds an edit in the middle, trimming common prefix and suffix', () => {
    const { start, oldEnd, newEnd, oldChars, newChars } = diffCodePoints('hello', 'helXXlo');
    expect(start).toBe(3);
    expect(oldEnd).toBe(3);
    expect(newEnd).toBe(5);
    expect(newChars.slice(start, newEnd).join('')).toBe('XX');
    expect(oldChars.slice(start, oldEnd).join('')).toBe('');
  });

  it('finds a deletion (new is a substring of old)', () => {
    const { start, oldEnd, newEnd } = diffCodePoints('hello world', 'hello');
    expect(start).toBe(5);
    expect(oldEnd).toBe(11);
    expect(newEnd).toBe(5);
  });

  it('identical strings produce an empty changed region', () => {
    const { start, oldEnd, newEnd } = diffCodePoints('same', 'same');
    expect(start).toBe(4);
    expect(oldEnd).toBe(4);
    expect(newEnd).toBe(4);
  });

  it('treats a surrogate-pair emoji as one code point, never splitting it', () => {
    // '😀' is one code point but two UTF-16 units -- Array.from (code-point
    // aware) must see it as a single element, not two.
    const { oldChars, newChars, start, oldEnd, newEnd } = diffCodePoints('a😀b', 'a😀😀b');
    expect(oldChars).toEqual(['a', '😀', 'b']);
    expect(newChars).toEqual(['a', '😀', '😀', 'b']);
    expect(start).toBe(2); // right after "a😀", not mid-emoji
    expect(oldEnd).toBe(2);
    expect(newEnd).toBe(3);
  });

  it('handles empty strings on either side', () => {
    expect(diffCodePoints('', 'abc')).toMatchObject({ start: 0, oldEnd: 0, newEnd: 3 });
    expect(diffCodePoints('abc', '')).toMatchObject({ start: 0, oldEnd: 3, newEnd: 0 });
    expect(diffCodePoints('', '')).toMatchObject({ start: 0, oldEnd: 0, newEnd: 0 });
  });
});
