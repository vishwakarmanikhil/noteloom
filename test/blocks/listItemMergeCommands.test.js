import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { mergeListItemOrOutdent } from '../../src/blocks/listItem/mergeCommands.js';

function li(id, parentId, titleRunIds, contentIds = []) {
  return { id, type: 'listItem', parentId, contentIds, props: { ordered: false, titleRunIds } };
}

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2'], props: {} },
      li('li1', 'root', ['r1']),
      li('li2', 'root', ['r2']),
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'one', marks: {} },
      { id: 'r2', type: 'text', value: 'two', marks: {} },
    ],
  };
}

describe('mergeListItemOrOutdent', () => {
  it('merges a non-empty item with no children into the previous sibling\'s title', () => {
    const store = new EditorStore(makeDoc());
    const result = mergeListItemOrOutdent(store, 'li2');

    expect(result).toEqual({ focusBlockId: 'li1', needsRefocus: true });
    expect(store.getBlock('li1').props.titleRunIds).toEqual(['r1', 'r2']);
    expect(store.getRun('r2').value).toBe('two'); // moved, not lost
    expect(store.getBlock('li2')).toBeUndefined();
  });

  it('skips merging when the item has nested children (v1 scope)', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation({
      type: 'insertBlock',
      block: li('li2-child', 'li2', ['r3']),
      parentId: 'li2',
      index: 0,
      subtree: {
        blocks: [li('li2-child', 'li2', ['r3'])],
        runs: [{ id: 'r3', type: 'text', value: '', marks: {} }],
      },
    });

    const result = mergeListItemOrOutdent(store, 'li2');

    expect(result).toBeNull();
    expect(store.getBlock('li2')).toBeDefined(); // untouched
    expect(store.getBlock('li1').props.titleRunIds).toEqual(['r1']); // untouched
  });

  it('deletes an empty item instead of merging when it has a previous sibling', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation({ type: 'updateRun', id: 'r2', patch: { value: '' } });

    const result = mergeListItemOrOutdent(store, 'li2');

    expect(result).toEqual({ focusBlockId: 'li1', needsRefocus: true });
    expect(store.getBlock('li2')).toBeUndefined();
    expect(store.getBlock('li1').props.titleRunIds).toEqual(['r1']); // untouched, nothing merged
  });

  it('outdents instead of merging when there is no previous sibling but the parent is a listItem', () => {
    const store = new EditorStore(makeDoc());
    // nest li2 under li1 first
    store.applyOperation({ type: 'moveBlock', id: 'li2', toParentId: 'li1', toIndex: 0 });
    expect(store.getBlock('li1').contentIds).toEqual(['li2']);

    const result = mergeListItemOrOutdent(store, 'li2');

    expect(result).toEqual({ focusBlockId: 'li2', needsRefocus: true }); // reparented -> remounted -> needs refocus
    expect(store.getBlock('li1').contentIds).toEqual([]);
    expect(store.getBlock('root').contentIds).toEqual(['li1', 'li2']);
  });

  it('deletes a preceding contentless sibling (e.g. divider) first and stays put without needing refocus', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'divider1', 'li2'], props: {} },
        li('li1', 'root', ['r1']),
        { id: 'divider1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
        li('li2', 'root', ['r2']),
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'one', marks: {} },
        { id: 'r2', type: 'text', value: 'two', marks: {} },
      ],
    });

    const result = mergeListItemOrOutdent(store, 'li2');

    expect(result).toEqual({ focusBlockId: 'li2', needsRefocus: false }); // same position, no remount
    expect(store.getBlock('divider1')).toBeUndefined();
    expect(store.getBlock('li2')).toBeDefined();
    expect(store.getBlock('li2').props.titleRunIds).toEqual(['r2']); // untouched
    expect(store.getBlock('root').contentIds).toEqual(['li1', 'li2']);
  });

  it('is a no-op for the first top-level item (nothing to merge into)', () => {
    const store = new EditorStore(makeDoc());
    const result = mergeListItemOrOutdent(store, 'li1');
    expect(result).toBeNull();
    expect(store.getBlock('li1')).toBeDefined();
  });

  it('regression: an entirely empty toggle (title + seeded blank body) is removable even with a previous sibling', () => {
    // createListItemBlock always seeds a toggle with one blank paragraph
    // child, so contentIds.length === 0 is never true for a toggle — this
    // used to make an empty toggle permanently undeletable via Backspace.
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'toggle1'], props: {} },
        li('li1', 'root', ['r1']),
        { id: 'toggle1', type: 'listItem', parentId: 'root', contentIds: ['p1'], props: { ordered: false, collapsed: false, titleRunIds: ['r2'] } },
        { id: 'p1', type: 'paragraph', parentId: 'toggle1', contentIds: [], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'one', marks: {} },
        { id: 'r2', type: 'text', value: '', marks: {} },
      ],
    });

    const result = mergeListItemOrOutdent(store, 'toggle1');

    expect(result).toEqual({ focusBlockId: 'li1', needsRefocus: true });
    expect(store.getBlock('toggle1')).toBeUndefined();
    expect(store.getBlock('p1')).toBeUndefined(); // its seeded child goes with it
  });

  it('regression: a toggle with real nested content is NOT deleted just because its own title is blank', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'toggle1'], props: {} },
        li('li1', 'root', ['r1']),
        { id: 'toggle1', type: 'listItem', parentId: 'root', contentIds: ['p1'], props: { ordered: false, collapsed: false, titleRunIds: ['r2'] } },
        { id: 'p1', type: 'paragraph', parentId: 'toggle1', contentIds: ['r3'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'one', marks: {} },
        { id: 'r2', type: 'text', value: '', marks: {} },
        { id: 'r3', type: 'text', value: 'nested content', marks: {} },
      ],
    });

    const result = mergeListItemOrOutdent(store, 'toggle1');

    expect(result).toBeNull(); // has nested children or previous sibling isn't a listItem: no merge
    expect(store.getBlock('toggle1')).toBeDefined();
  });

  it('regression: an entirely empty toggle that is the only top-level item is replaced with a blank paragraph', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['toggle1'], props: {} },
        { id: 'toggle1', type: 'listItem', parentId: 'root', contentIds: ['p1'], props: { ordered: false, collapsed: false, titleRunIds: ['r1'] } },
        { id: 'p1', type: 'paragraph', parentId: 'toggle1', contentIds: [], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });

    const result = mergeListItemOrOutdent(store, 'toggle1');

    expect(store.getBlock('toggle1')).toBeUndefined();
    expect(store.getBlock('root').contentIds).toHaveLength(1);
    const fallbackId = store.getBlock('root').contentIds[0];
    expect(store.getBlock(fallbackId).type).toBe('paragraph');
    expect(result).toEqual({ focusBlockId: fallbackId, needsRefocus: true });
  });

  it('is one atomic undo step through History', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    mergeListItemOrOutdent(history, 'li2');
    expect(history.getBlock('li1').props.titleRunIds).toEqual(['r1', 'r2']);

    history.undo();
    expect(history.getBlock('li1').props.titleRunIds).toEqual(['r1']);
    expect(history.getBlock('li2')).toBeDefined();
  });
});
