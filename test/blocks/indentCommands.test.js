import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { indentListItem, outdentListItem } from '../../src/blocks/listItem/indentCommands.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2'], props: {} },
      { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
      { id: 'li2', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r2'] } },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'one', marks: {} },
      { id: 'r2', type: 'text', value: 'two', marks: {} },
    ],
  };
}

describe('indentListItem', () => {
  it('nests the item under its previous sibling', () => {
    const store = new EditorStore(makeDoc());
    indentListItem(store, 'li2');

    expect(store.getBlock('root').contentIds).toEqual(['li1']);
    expect(store.getBlock('li1').contentIds).toEqual(['li2']);
    expect(store.getBlock('li2').parentId).toBe('li1');
  });

  it('does nothing for the first item (no previous sibling)', () => {
    const store = new EditorStore(makeDoc());
    indentListItem(store, 'li1');
    expect(store.getBlock('root').contentIds).toEqual(['li1', 'li2']);
  });

  it('regression: does NOT nest under a previous sibling that is not a listItem (the whole-list-disappears bug)', () => {
    // A list item whose *previous sibling* is a paragraph (e.g. the list
    // follows a heading/paragraph in the document) used to get reparented
    // under that paragraph on Tab. Since only container block types render
    // <BlockChildren>, the item (and anything nested under it) would still
    // exist in the store but never render anywhere — "the whole list
    // vanished from the DOM".
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'li1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['rp1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
      ],
      runs: [
        { id: 'rp1', type: 'text', value: 'intro', marks: {} },
        { id: 'r1', type: 'text', value: 'one', marks: {} },
      ],
    });

    indentListItem(store, 'li1');

    // li1 must still be a direct child of root, not reparented under p1
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'li1']);
    expect(store.getBlock('li1').parentId).toBe('root');
    expect(store.getBlock('p1').contentIds).toEqual(['rp1']); // untouched
  });
});

describe('outdentListItem', () => {
  it('promotes a nested item to be a sibling of its parent, right after it', () => {
    const store = new EditorStore(makeDoc());
    indentListItem(store, 'li2'); // nest li2 under li1 first
    outdentListItem(store, 'li2'); // then promote it back out

    expect(store.getBlock('li1').contentIds).toEqual([]);
    expect(store.getBlock('root').contentIds).toEqual(['li1', 'li2']);
    expect(store.getBlock('li2').parentId).toBe('root');
  });

  it('does nothing when already at the top level', () => {
    const store = new EditorStore(makeDoc());
    outdentListItem(store, 'li1');
    expect(store.getBlock('root').contentIds).toEqual(['li1', 'li2']);
  });
});
