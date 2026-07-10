import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import {
  deleteBlockRange,
  moveBlockRangeUp,
  moveBlockRangeDown,
  isEntireBlockRangeHidden,
  setBlockRangeHidden,
  reorderBlockRangeFromStore,
} from '../../src/blocks/shared/blockRangeActions.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2', 'p3', 'p4', 'p5'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
      { id: 'p4', type: 'paragraph', parentId: 'root', contentIds: ['r4'], props: {} },
      { id: 'p5', type: 'paragraph', parentId: 'root', contentIds: ['r5'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'one', marks: {} },
      { id: 'r2', type: 'text', value: 'two', marks: {} },
      { id: 'r3', type: 'text', value: 'three', marks: {} },
      { id: 'r4', type: 'text', value: 'four', marks: {} },
      { id: 'r5', type: 'text', value: 'five', marks: {} },
    ],
  };
}

describe('deleteBlockRange', () => {
  it('removes every block in the range and is one undo step', () => {
    const store = new History(new EditorStore(makeDoc()));
    deleteBlockRange(store, ['p2', 'p3', 'p4']);

    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p5']);
    expect(store.getBlock('p2')).toBeUndefined();
    expect(store.getBlock('p3')).toBeUndefined();
    expect(store.getBlock('p4')).toBeUndefined();

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(store.getBlock('p3').type).toBe('paragraph');
  });

  it('does nothing for an empty range', () => {
    const store = new EditorStore(makeDoc());
    deleteBlockRange(store, []);
    expect(store.getBlock('root').contentIds).toHaveLength(5);
  });
});

describe('moveBlockRangeUp / moveBlockRangeDown', () => {
  it('moves a multi-block range up by swapping with the preceding sibling (one op, not one per block)', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockRangeUp(store, ['p3', 'p4']);
    expect(moved).toBe(true);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p3', 'p4', 'p2', 'p5']);
  });

  it('moves a multi-block range down by swapping with the following sibling', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockRangeDown(store, ['p2', 'p3']);
    expect(moved).toBe(true);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
  });

  it('is a no-op (returns false) when the range is already at the top', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockRangeUp(store, ['p1', 'p2']);
    expect(moved).toBe(false);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('is a no-op (returns false) when the range is already at the bottom', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockRangeDown(store, ['p4', 'p5']);
    expect(moved).toBe(false);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('a single-block range moves the same as moveBlockUp/moveBlockDown would', () => {
    const store = new EditorStore(makeDoc());
    moveBlockRangeUp(store, ['p3']);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p3', 'p2', 'p4', 'p5']);
  });
});

describe('isEntireBlockRangeHidden / setBlockRangeHidden', () => {
  it('reports false until every block in the range is hidden, then true', () => {
    const store = new EditorStore(makeDoc());
    expect(isEntireBlockRangeHidden(store, ['p1', 'p2'])).toBe(false);

    setBlockRangeHidden(store, ['p1'], true);
    expect(isEntireBlockRangeHidden(store, ['p1', 'p2'])).toBe(false);

    setBlockRangeHidden(store, ['p2'], true);
    expect(isEntireBlockRangeHidden(store, ['p1', 'p2'])).toBe(true);
  });

  it('setBlockRangeHidden sets props.hidden on every block in the range as one undo step', () => {
    const store = new History(new EditorStore(makeDoc()));
    setBlockRangeHidden(store, ['p2', 'p3'], true);
    expect(store.getBlock('p2').props.hidden).toBe(true);
    expect(store.getBlock('p3').props.hidden).toBe(true);
    expect(store.getBlock('p1').props.hidden).toBeUndefined();

    store.undo();
    expect(store.getBlock('p2').props.hidden).toBeUndefined();
    expect(store.getBlock('p3').props.hidden).toBeUndefined();
  });
});

describe('reorderBlockRangeFromStore', () => {
  it('re-sorts an id set into current document order after a move', () => {
    const store = new EditorStore(makeDoc());
    moveBlockRangeUp(store, ['p3', 'p4']); // -> p1, p3, p4, p2, p5
    const reordered = reorderBlockRangeFromStore(store, ['p4', 'p3']); // deliberately out of order in
    expect(reordered).toEqual(['p3', 'p4']);
  });
});
