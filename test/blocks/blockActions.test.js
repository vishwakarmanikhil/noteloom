import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { duplicateBlock, moveBlockUp, moveBlockDown, deleteBlockAndFocusSibling } from '../../src/blocks/shared/blockActions.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2', 'p3'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'one', marks: {} },
      { id: 'r2', type: 'text', value: 'two', marks: {} },
      { id: 'r3', type: 'text', value: 'three', marks: {} },
    ],
  };
}

describe('duplicateBlock', () => {
  it('inserts a clone right after the original, with fresh ids but the same content', () => {
    const store = new EditorStore(makeDoc());
    const newId = duplicateBlock(store, 'p2');

    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', newId, 'p3']);
    const clone = store.getBlock(newId);
    expect(clone.type).toBe('paragraph');
    expect(clone.id).not.toBe('p2');
    const cloneRunId = clone.contentIds[0];
    expect(cloneRunId).not.toBe('r2'); // fresh run id too
    expect(store.getRun(cloneRunId).value).toBe('two');
    expect(store.getRun('r2').value).toBe('two'); // original untouched
  });

  it('duplicates a whole subtree (container + nested children), not just the root block', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['callout1'], props: {} },
        { id: 'callout1', type: 'callout', parentId: 'root', contentIds: ['inner1'], props: { icon: '💡' } },
        { id: 'inner1', type: 'paragraph', parentId: 'callout1', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'inside', marks: {} }],
    });

    const newId = duplicateBlock(store, 'callout1');
    const clone = store.getBlock(newId);
    expect(clone.type).toBe('callout');
    expect(clone.props.icon).toBe('💡');
    const innerCloneId = clone.contentIds[0];
    expect(innerCloneId).not.toBe('inner1');
    expect(store.getBlock(innerCloneId).parentId).toBe(newId); // reparented to the clone, not the original
    const runCloneId = store.getBlock(innerCloneId).contentIds[0];
    expect(store.getRun(runCloneId).value).toBe('inside');
  });

  it('is one atomic undo step through History', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    const newId = duplicateBlock(history, 'p2');
    expect(history.getBlock('root').contentIds).toEqual(['p1', 'p2', newId, 'p3']);

    history.undo();
    expect(history.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3']);
    expect(history.getBlock(newId)).toBeUndefined();
  });
});

describe('moveBlockUp / moveBlockDown', () => {
  it('moveBlockUp swaps with the previous sibling', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockUp(store, 'p2');
    expect(moved).toBe(true);
    expect(store.getBlock('root').contentIds).toEqual(['p2', 'p1', 'p3']);
  });

  it('moveBlockUp on the first block is a no-op', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockUp(store, 'p1');
    expect(moved).toBe(false);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('moveBlockDown swaps with the next sibling', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockDown(store, 'p2');
    expect(moved).toBe(true);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p3', 'p2']);
  });

  it('moveBlockDown on the last block is a no-op', () => {
    const store = new EditorStore(makeDoc());
    const moved = moveBlockDown(store, 'p3');
    expect(moved).toBe(false);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('moving repeatedly walks the block all the way to the other end', () => {
    const store = new EditorStore(makeDoc());
    moveBlockDown(store, 'p1');
    moveBlockDown(store, 'p1');
    expect(store.getBlock('root').contentIds).toEqual(['p2', 'p3', 'p1']);
  });
});

describe('deleteBlockAndFocusSibling', () => {
  it('removes the block and returns the previous sibling as the focus target', () => {
    const store = new EditorStore(makeDoc());
    const target = deleteBlockAndFocusSibling(store, 'p2');
    expect(target).toBe('p1');
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p3']);
    expect(store.getBlock('p2')).toBeUndefined();
  });

  it('falls back to the next sibling when deleting the first block', () => {
    const store = new EditorStore(makeDoc());
    const target = deleteBlockAndFocusSibling(store, 'p1');
    expect(target).toBe('p2');
    expect(store.getBlock('root').contentIds).toEqual(['p2', 'p3']);
  });

  it('backfills a blank paragraph when deleting the only block left', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'only', marks: {} }],
    });
    const target = deleteBlockAndFocusSibling(store, 'p1');
    expect(store.getBlock('root').contentIds).toHaveLength(1);
    expect(store.getBlock(target).type).toBe('paragraph');
    expect(target).not.toBe('p1');
  });
});
