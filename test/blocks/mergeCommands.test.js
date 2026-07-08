import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { mergeWithPreviousOrDelete } from '../../src/blocks/shared/mergeCommands.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'hello ', marks: {} },
      { id: 'r2', type: 'text', value: 'world', marks: {} },
    ],
  };
}

describe('mergeWithPreviousOrDelete', () => {
  it('merges a non-empty block into the previous sibling and removes the shell', () => {
    const store = new EditorStore(makeDoc());
    const prevId = mergeWithPreviousOrDelete(store, 'p2');

    expect(prevId).toBe('p1');
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
    expect(store.getRun('r2').value).toBe('world'); // moved, not lost
    expect(store.getBlock('p2')).toBeUndefined();
    expect(store.getBlock('root').contentIds).toEqual(['p1']);
  });

  it('deletes an empty block instead of merging', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation({ type: 'updateRun', id: 'r2', patch: { value: '' } });

    const prevId = mergeWithPreviousOrDelete(store, 'p2');

    expect(prevId).toBe('p1');
    expect(store.getBlock('p1').contentIds).toEqual(['r1']); // untouched, nothing merged
    expect(store.getBlock('p2')).toBeUndefined();
    expect(store.getRun('r2')).toBeUndefined(); // its blank run is gone too
  });

  it('does nothing for the first block in its container when it has real content (no previous sibling)', () => {
    const store = new EditorStore(makeDoc());
    const result = mergeWithPreviousOrDelete(store, 'p1');
    expect(result).toBeNull();
    expect(store.getBlock('p1')).toBeDefined();
    expect(store.getBlock('p2')).toBeDefined();
  });

  it('deletes a preceding divider first instead of attempting a merge across it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'divider1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'divider1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'hello ', marks: {} },
        { id: 'r2', type: 'text', value: 'world', marks: {} },
      ],
    });

    const focusId = mergeWithPreviousOrDelete(store, 'p2');

    expect(focusId).toBe('p2'); // stayed put; the divider was the thing removed
    expect(store.getBlock('divider1')).toBeUndefined();
    expect(store.getBlock('p2')).toBeDefined();
    expect(store.getBlock('p2').contentIds).toEqual(['r2']); // untouched
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);

    // a second backspace now merges normally since p1 is directly before p2
    const secondFocusId = mergeWithPreviousOrDelete(store, 'p2');
    expect(secondFocusId).toBe('p1');
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
  });

  it('is one atomic undo step through History', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    mergeWithPreviousOrDelete(history, 'p2');
    expect(history.getBlock('p1').contentIds).toEqual(['r1', 'r2']);

    history.undo();
    expect(history.getBlock('p1').contentIds).toEqual(['r1']);
    expect(history.getBlock('p2')).toBeDefined();
    expect(history.getBlock('p2').contentIds).toEqual(['r2']);
  });
});

describe('mergeWithPreviousOrDelete: cross-type paragraph<->heading merge (regression)', () => {
  it('merges a paragraph up into a preceding heading, keeping it a heading', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['rh1'], props: { level: 2 } },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['rp1'], props: {} },
      ],
      runs: [
        { id: 'rh1', type: 'text', value: 'Title', marks: {} },
        { id: 'rp1', type: 'text', value: ' continued', marks: {} },
      ],
    });

    const focusId = mergeWithPreviousOrDelete(store, 'p1');

    expect(focusId).toBe('h1');
    expect(store.getBlock('h1').type).toBe('heading');
    expect(store.getBlock('h1').props.level).toBe(2); // heading-ness preserved
    expect(store.getBlock('h1').contentIds).toEqual(['rh1', 'rp1']);
    expect(store.getBlock('p1')).toBeUndefined();
  });

  it('merges a heading up into a preceding paragraph, keeping it a paragraph', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'h1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['rp1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['rh1'], props: { level: 3 } },
      ],
      runs: [
        { id: 'rp1', type: 'text', value: 'Intro: ', marks: {} },
        { id: 'rh1', type: 'text', value: 'Section', marks: {} },
      ],
    });

    const focusId = mergeWithPreviousOrDelete(store, 'h1');

    expect(focusId).toBe('p1');
    expect(store.getBlock('p1').type).toBe('paragraph');
    expect(store.getBlock('p1').contentIds).toEqual(['rp1', 'rh1']);
    expect(store.getBlock('h1')).toBeUndefined();
  });

  it('still refuses to merge into an unrelated type (e.g. a listItem)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'p1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['rli1'] },
        },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['rp1'], props: {} },
      ],
      runs: [
        { id: 'rli1', type: 'text', value: 'item', marks: {} },
        { id: 'rp1', type: 'text', value: 'text', marks: {} },
      ],
    });

    const result = mergeWithPreviousOrDelete(store, 'p1');
    expect(result).toBeNull();
    expect(store.getBlock('p1')).toBeDefined();
    expect(store.getBlock('li1').props.titleRunIds).toEqual(['rli1']); // untouched
  });
});

describe('mergeWithPreviousOrDelete: empty leading block, no previous sibling (regression)', () => {
  // Previously, a block with nothing before it (index <= 0) always
  // returned null unconditionally — meaning an *empty* heading/paragraph
  // that happened to be first could never be removed via Backspace, even
  // though it has nothing worth keeping. This is exactly what happens
  // after deleting everything else in a document down to one heading: it
  // permanently gets stuck.
  it('replaces the sole empty heading in the document with a blank paragraph and focuses it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['h1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['rh1'], props: { level: 2 } },
      ],
      runs: [{ id: 'rh1', type: 'text', value: '', marks: {} }],
    });

    const focusId = mergeWithPreviousOrDelete(store, 'h1');

    expect(store.getBlock('h1')).toBeUndefined();
    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds.length).toBe(1);
    expect(store.getBlock(rootContentIds[0]).type).toBe('paragraph');
    expect(focusId).toBe(rootContentIds[0]);
  });

  it('removes an empty leading heading outright when a sibling follows it (no paragraph fallback needed)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['rh1'], props: { level: 2 } },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['rp1'], props: {} },
      ],
      runs: [
        { id: 'rh1', type: 'text', value: '', marks: {} },
        { id: 'rp1', type: 'text', value: 'hello', marks: {} },
      ],
    });

    const focusId = mergeWithPreviousOrDelete(store, 'h1');

    expect(store.getBlock('h1')).toBeUndefined();
    expect(store.getBlock('root').contentIds).toEqual(['p1']);
    expect(focusId).toBe('p1');
  });

  it('does nothing when the sole leading block is already an empty paragraph (already the fallback shape)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });

    const result = mergeWithPreviousOrDelete(store, 'p1');

    expect(result).toBeNull();
    expect(store.getBlock('p1')).toBeDefined();
  });
});
