import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { TEXT_FAMILY_TARGETS, isTurnIntoEligible, turnBlockInto } from '../../src/blocks/shared/turnInto.js';

function makeRegistry() {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return registry;
}

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

describe('isTurnIntoEligible', () => {
  it('is true for every text-family type', () => {
    for (const type of ['paragraph', 'heading', 'listItem', 'toggleHeading', 'blockquote', 'callout', 'code']) {
      expect(isTurnIntoEligible(type)).toBe(true);
    }
  });

  it('is false for every structural type', () => {
    for (const type of ['table', 'tableRow', 'tableCell', 'layout', 'layoutColumn', 'embed', 'divider', 'button']) {
      expect(isTurnIntoEligible(type)).toBe(false);
    }
  });
});

describe('turnBlockInto', () => {
  function makeDoc(marks = {}) {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks }],
    };
  }

  it('converts a plain paragraph to a heading, preserving text', () => {
    const store = new EditorStore(makeDoc());
    const registry = makeRegistry();
    const target = TEXT_FAMILY_TARGETS.find((t) => t.type === 'heading' && t.props.level === 2);
    const { ops, newBlockId } = turnBlockInto(store, registry, 'p1', target);
    applyOps(store, ops);

    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('heading');
    expect(newBlock.props.level).toBe(2);
    expect(store.getRun(newBlock.contentIds[0]).value).toBe('hello');
  });

  it('strips marks only when converting into code, leaving other conversions untouched', () => {
    const store = new EditorStore(makeDoc({ bold: true, italic: true }));
    const registry = makeRegistry();
    const codeTarget = TEXT_FAMILY_TARGETS.find((t) => t.type === 'code');
    const { ops, newBlockId } = turnBlockInto(store, registry, 'p1', codeTarget);
    applyOps(store, ops);

    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('code');
    const run = store.getRun(newBlock.contentIds[0]);
    expect(run.value).toBe('hello');
    expect(run.marks).toEqual({});
  });

  it('does NOT strip marks when converting to a non-code target', () => {
    const store = new EditorStore(makeDoc({ bold: true }));
    const registry = makeRegistry();
    const quoteTarget = TEXT_FAMILY_TARGETS.find((t) => t.type === 'blockquote');
    const { ops, newBlockId } = turnBlockInto(store, registry, 'p1', quoteTarget);
    applyOps(store, ops);

    const run = store.getRun(store.getBlock(newBlockId).contentIds[0]);
    expect(run.marks).toEqual({ bold: true });
  });

  it('using the same TEXT_FAMILY_TARGETS entry twice does not cross-contaminate props between the two resulting blocks', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'one', marks: {} },
        { id: 'r2', type: 'text', value: 'two', marks: {} },
      ],
    };
    const store = new EditorStore(doc);
    const registry = makeRegistry();
    const bulletTarget = TEXT_FAMILY_TARGETS.find((t) => t.type === 'listItem' && t.props.ordered === false && !('checked' in t.props) && !('collapsed' in t.props));

    const first = turnBlockInto(store, registry, 'p1', bulletTarget);
    applyOps(store, first.ops);
    const second = turnBlockInto(store, registry, 'p2', bulletTarget);
    applyOps(store, second.ops);

    const block1 = store.getBlock(first.newBlockId);
    const block2 = store.getBlock(second.newBlockId);
    expect(block1.props).not.toBe(block2.props); // distinct objects, not shared references
    expect(block1.props.titleRunIds).toEqual(['r1']);
    expect(block2.props.titleRunIds).toEqual(['r2']); // not overwritten by the second conversion
  });
});
