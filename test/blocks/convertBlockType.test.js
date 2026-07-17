import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { convertBlockType } from '../../src/blocks/shared/convertBlockType.js';

function makeRegistry() {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return registry;
}

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

describe('convertBlockType: childless case is unchanged (regression lock)', () => {
  function makeDoc() {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    };
  }

  it('paragraph -> heading behaves identically whether or not a registry is passed', () => {
    const storeA = new EditorStore(makeDoc());
    const { ops: opsA, newBlockId: idA } = convertBlockType(storeA, 'p1', 'heading', { level: 2 }, ['r1']);
    applyOps(storeA, opsA);

    const storeB = new EditorStore(makeDoc());
    const registry = makeRegistry();
    const { ops: opsB, newBlockId: idB } = convertBlockType(storeB, 'p1', 'heading', { level: 2 }, ['r1'], registry);
    applyOps(storeB, opsB);

    expect(storeA.getBlock(idA).type).toBe('heading');
    expect(storeB.getBlock(idB).type).toBe('heading');
    expect(storeA.getBlock(idA).props.level).toBe(2);
    expect(storeB.getBlock(idB).props.level).toBe(2);
    expect(storeA.getRun('r1').value).toBe('hello');
    expect(storeB.getRun('r1').value).toBe('hello');
    expect(storeA.getBlock('p1')).toBeUndefined();
    expect(storeB.getBlock('p1')).toBeUndefined();
    expect(storeA.getBlock('root').contentIds).toEqual([idA]);
    expect(storeB.getBlock('root').contentIds).toEqual([idB]);
  });

  it('paragraph -> listItem (leaf to titleRunIds target) works the same with a registry supplied', () => {
    const store = new EditorStore(makeDoc());
    const registry = makeRegistry();
    const { ops, newBlockId } = convertBlockType(
      store,
      'p1',
      'listItem',
      { ordered: false, titleRunIds: [] },
      ['r1'],
      registry,
    );
    applyOps(store, ops);

    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('listItem');
    expect(newBlock.props.titleRunIds).toEqual(['r1']);
    expect(newBlock.contentIds).toEqual([]); // no children to reparent — untouched
  });
});

describe('convertBlockType: children preservation (the bug this fixes)', () => {
  function makeToggleHeadingDoc() {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['tg1'], props: {} },
        {
          id: 'tg1',
          type: 'toggleHeading',
          parentId: 'root',
          contentIds: ['child1', 'child2'],
          props: { level: 2, collapsed: false, titleRunIds: ['rTitle'] },
        },
        { id: 'child1', type: 'paragraph', parentId: 'tg1', contentIds: ['r1'], props: {} },
        { id: 'child2', type: 'paragraph', parentId: 'tg1', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'rTitle', type: 'text', value: 'A section', marks: {} },
        { id: 'r1', type: 'text', value: 'First child', marks: {} },
        { id: 'r2', type: 'text', value: 'Second child', marks: {} },
      ],
    };
  }

  it('WITHOUT a registry (old behavior, still reachable if a caller omits it): children are lost — documents the exact bug being fixed', () => {
    const store = new EditorStore(makeToggleHeadingDoc());
    const { ops, newBlockId } = convertBlockType(store, 'tg1', 'heading', { level: 2 }, ['rTitle']);
    applyOps(store, ops);

    expect(store.getBlock(newBlockId).type).toBe('heading');
    // The old bug: children are gone, not just unreachable from the UI —
    // actually deleted, since removeBlock cascades.
    expect(store.getBlock('child1')).toBeUndefined();
    expect(store.getBlock('child2')).toBeUndefined();
  });

  it('container -> container (toggleHeading -> listItem-with-toggle-shape is not real; use listItem -> toggleHeading) reparents children onto the new block', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['child1', 'child2'],
          props: { ordered: false, titleRunIds: ['rTitle'] },
        },
        { id: 'child1', type: 'listItem', parentId: 'li1', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
        { id: 'child2', type: 'listItem', parentId: 'li1', contentIds: [], props: { ordered: false, titleRunIds: ['r2'] } },
      ],
      runs: [
        { id: 'rTitle', type: 'text', value: 'Parent item', marks: {} },
        { id: 'r1', type: 'text', value: 'First nested', marks: {} },
        { id: 'r2', type: 'text', value: 'Second nested', marks: {} },
      ],
    };
    const store = new EditorStore(doc);
    const registry = makeRegistry();
    const { ops, newBlockId } = convertBlockType(
      store,
      'li1',
      'toggleHeading',
      { level: 2, collapsed: false, titleRunIds: [] },
      ['rTitle'],
      registry,
    );
    applyOps(store, ops);

    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('toggleHeading');
    expect(store.getRun(newBlock.props.titleRunIds[0]).value).toBe('Parent item');
    // children reparented onto the new block, in order, not deleted:
    expect(newBlock.contentIds).toEqual(['child1', 'child2']);
    expect(store.getBlock('child1').parentId).toBe(newBlockId);
    expect(store.getBlock('child2').parentId).toBe(newBlockId);
    expect(store.getRun('r1').value).toBe('First nested');
    expect(store.getRun('r2').value).toBe('Second nested');
  });

  it('container -> leaf (toggleHeading -> heading, target cannot hold children) promotes children to siblings right after the new block, in order', () => {
    const store = new EditorStore(makeToggleHeadingDoc());
    const registry = makeRegistry();
    const { ops, newBlockId } = convertBlockType(store, 'tg1', 'heading', { level: 2 }, ['rTitle'], registry);
    applyOps(store, ops);

    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('heading');
    expect(store.getRun(newBlock.contentIds[0]).value).toBe('A section');

    // children survive as siblings right after the converted block, not lost:
    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds).toEqual([newBlockId, 'child1', 'child2']);
    expect(store.getBlock('child1').parentId).toBe('root');
    expect(store.getBlock('child2').parentId).toBe('root');
    expect(store.getRun('r1').value).toBe('First child');
    expect(store.getRun('r2').value).toBe('Second child');
  });

  it('a source with no children at all behaves identically whether or not it has children-capable type (no spurious sibling/reparent ops)', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['tg1'], props: {} },
        { id: 'tg1', type: 'toggleHeading', parentId: 'root', contentIds: [], props: { level: 2, collapsed: false, titleRunIds: ['rTitle'] } },
      ],
      runs: [{ id: 'rTitle', type: 'text', value: 'Empty section', marks: {} }],
    };
    const store = new EditorStore(doc);
    const registry = makeRegistry();
    const { ops, newBlockId } = convertBlockType(store, 'tg1', 'heading', { level: 3 }, ['rTitle'], registry);
    applyOps(store, ops);

    expect(store.getBlock('root').contentIds).toEqual([newBlockId]);
    expect(store.getRun(store.getBlock(newBlockId).contentIds[0]).value).toBe('Empty section');
  });
});

describe('convertBlockType: undo/redo still works for a children-preserving conversion', () => {
  it('undo restores the original toggleHeading with its children intact', async () => {
    const { History } = await import('../../src/store/history.js');
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['tg1'], props: {} },
        {
          id: 'tg1',
          type: 'toggleHeading',
          parentId: 'root',
          contentIds: ['child1'],
          props: { level: 2, collapsed: false, titleRunIds: ['rTitle'] },
        },
        { id: 'child1', type: 'paragraph', parentId: 'tg1', contentIds: ['r1'], props: {} },
      ],
      runs: [
        { id: 'rTitle', type: 'text', value: 'A section', marks: {} },
        { id: 'r1', type: 'text', value: 'Child text', marks: {} },
      ],
    };
    const store = new History(new EditorStore(doc));
    const registry = makeRegistry();
    const { ops } = convertBlockType(store, 'tg1', 'heading', { level: 2 }, ['rTitle'], registry);
    store.performBatch(ops);

    expect(store.getBlock('root').contentIds.length).toBe(2); // heading + promoted child

    store.undo();

    expect(store.getBlock('root').contentIds).toEqual(['tg1']);
    expect(store.getBlock('tg1').type).toBe('toggleHeading');
    expect(store.getBlock('tg1').contentIds).toEqual(['child1']);
    expect(store.getBlock('child1').parentId).toBe('tg1');
    expect(store.getRun('r1').value).toBe('Child text');
  });
});
