import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { findMatches, replaceMatch, replaceAllMatches } from '../../src/search/findInDocument.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1', 'li1'], props: {} },
      { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r-h1'], props: { level: 2 } },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
      {
        id: 'li1',
        type: 'listItem',
        parentId: 'root',
        contentIds: ['li1a'],
        props: { ordered: false, titleRunIds: ['r-li1'] },
      },
      {
        id: 'li1a',
        type: 'listItem',
        parentId: 'li1',
        contentIds: [],
        props: { ordered: false, titleRunIds: ['r-li1a'] },
      },
    ],
    runs: [
      { id: 'r-h1', type: 'text', value: 'The Cat Sat', marks: {} },
      { id: 'r-p1', type: 'text', value: 'the cat and the hat', marks: {} },
      { id: 'r-li1', type: 'text', value: 'catalog entry', marks: {} },
      { id: 'r-li1a', type: 'text', value: 'nested cat item', marks: {} },
    ],
  };
}

describe('findMatches', () => {
  it('finds every occurrence, case-insensitive by default, in reading order', () => {
    const store = new EditorStore(makeDoc());
    const matches = findMatches(store, 'cat');

    expect(matches).toEqual([
      { blockId: 'h1', runId: 'r-h1', offset: 4, length: 3 }, // "Cat" in the heading
      { blockId: 'p1', runId: 'r-p1', offset: 4, length: 3 }, // "cat" in the paragraph
      { blockId: 'li1', runId: 'r-li1', offset: 0, length: 3 }, // "cat" inside "catalog" (substring match)
      { blockId: 'li1a', runId: 'r-li1a', offset: 7, length: 3 }, // title comes before nested children in reading order
    ]);
  });

  it('returns [] for an empty query', () => {
    const store = new EditorStore(makeDoc());
    expect(findMatches(store, '')).toEqual([]);
  });

  it('caseSensitive: true only matches the exact case', () => {
    const store = new EditorStore(makeDoc());
    const matches = findMatches(store, 'Cat', { caseSensitive: true });
    expect(matches).toEqual([{ blockId: 'h1', runId: 'r-h1', offset: 4, length: 3 }]);
  });

  it('wholeWord: true excludes a substring match like "cat" inside "catalog"', () => {
    const store = new EditorStore(makeDoc());
    const matches = findMatches(store, 'cat', { wholeWord: true });
    expect(matches.map((m) => m.blockId)).toEqual(['h1', 'p1', 'li1a']); // "catalog" (li1) excluded
  });

  it('finds multiple non-overlapping occurrences within the same run', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'aaaa', marks: {} }],
    });
    // "aa" in "aaaa": non-overlapping means 2 matches (0-2, 2-4), not 3.
    const matches = findMatches(store, 'aa');
    expect(matches).toEqual([
      { blockId: 'p1', runId: 'r1', offset: 0, length: 2 },
      { blockId: 'p1', runId: 'r1', offset: 2, length: 2 },
    ]);
  });

  it('never matches inside a non-text run (an inline chip)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'select', value: 'cat', data: { value: 'cat' } }],
    });
    expect(findMatches(store, 'cat')).toEqual([]);
  });
});

describe('replaceMatch', () => {
  it('replaces just that match, one atomic write', () => {
    const store = new EditorStore(makeDoc());
    const [match] = findMatches(store, 'Cat', { caseSensitive: true }); // just the heading's "Cat"
    replaceMatch(store, match, 'Dog');
    expect(store.getRun('r-h1').value).toBe('The Dog Sat');
  });
});

describe('replaceAllMatches', () => {
  it('replaces every match, right-to-left per run so earlier offsets in the same run stay valid', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'the cat and the hat', marks: {} }],
    });
    const matches = findMatches(store, 'the');
    replaceAllMatches(store, matches, 'THE');
    expect(store.getRun('r1').value).toBe('THE cat and THE hat');
  });

  it('replaces matches spread across multiple runs/blocks with one write per affected run', () => {
    const store = new EditorStore(makeDoc());
    const matches = findMatches(store, 'cat');
    replaceAllMatches(store, matches, 'dog');

    expect(store.getRun('r-h1').value).toBe('The dog Sat');
    expect(store.getRun('r-p1').value).toBe('the dog and the hat');
    expect(store.getRun('r-li1').value).toBe('dogalog entry');
    expect(store.getRun('r-li1a').value).toBe('nested dog item');
  });

  it('is a no-op for an empty match list', () => {
    const store = new EditorStore(makeDoc());
    replaceAllMatches(store, [], 'x'); // must not throw
    expect(store.getRun('r-p1').value).toBe('the cat and the hat');
  });
});
