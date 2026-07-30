import { describe, expect, it } from 'vitest';
import { diffWords, diffDocumentsHTML } from '../../src/versions/diffVersions.js';

function doc(text) {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: text, marks: {} }],
  };
}

describe('diffWords', () => {
  it('marks unchanged text as equal', () => {
    const segments = diffWords('hello world', 'hello world');
    expect(segments).toEqual([{ type: 'equal', text: 'hello world' }]);
  });

  it('finds a scattered word insertion', () => {
    const segments = diffWords('the cat sat', 'the big cat sat');
    expect(segments.some((s) => s.type === 'added' && s.text.includes('big'))).toBe(true);
    expect(segments.filter((s) => s.type === 'removed')).toHaveLength(0);
  });

  it('finds a word deletion', () => {
    const segments = diffWords('the big cat sat', 'the cat sat');
    expect(segments.some((s) => s.type === 'removed' && s.text.includes('big'))).toBe(true);
  });
});

describe('diffDocumentsHTML', () => {
  it('marks everything as added when there is no previous version', () => {
    const html = diffDocumentsHTML(null, doc('hello world'));
    expect(html).toContain('be-version-diff-added');
    expect(html).not.toContain('be-version-diff-removed');
    expect(html).toContain('hello world');
  });

  it('renders unchanged blocks with no diff spans', () => {
    const html = diffDocumentsHTML(doc('hello world'), doc('hello world'));
    expect(html).not.toContain('be-version-diff-added');
    expect(html).not.toContain('be-version-diff-removed');
  });

  it('highlights word-level changes within a shared block', () => {
    const html = diffDocumentsHTML(doc('hello world'), doc('hello brave world'));
    expect(html).toContain('be-version-diff-added');
    expect(html).toMatch(/be-version-diff-added">brave/);
  });

  it('escapes HTML in diffed text', () => {
    const html = diffDocumentsHTML(doc('a'), doc('<script>alert(1)</script>'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('marks a block removed entirely from a later version as removed', () => {
    const prev = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'keep me', marks: {} },
        { id: 'r2', type: 'text', value: 'delete me', marks: {} },
      ],
    };
    const next = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'keep me', marks: {} }],
    };
    const html = diffDocumentsHTML(prev, next);
    expect(html).toContain('be-version-diff-removed">delete me');
    expect(html).not.toContain('be-version-diff-added');
  });
});
