import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import {
  OP,
  insertBlock,
  removeBlock,
  updateBlockProps,
  updateRun,
  setBlockContentIds,
  replaceRunSpan,
  setBlockRuns,
} from '../../src/store/operations.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'hello', marks: {} },
      { id: 'r2', type: 'text', value: 'world', marks: {} },
    ],
  };
}

describe('EditorStore reference stability', () => {
  it('returns the same reference for an untouched block/run across writes', () => {
    const store = new EditorStore(makeDoc());
    const p2Before = store.getBlock('p2');
    const r2Before = store.getRun('r2');

    store.applyOperation(updateRun('r1', { value: 'hello!' }));

    expect(store.getBlock('p2')).toBe(p2Before);
    expect(store.getRun('r2')).toBe(r2Before);
    expect(store.getRun('r1').value).toBe('hello!');
  });

  it('changes only the touched run, not the parent block object', () => {
    const store = new EditorStore(makeDoc());
    const p1Before = store.getBlock('p1');

    store.applyOperation(updateRun('r1', { value: 'changed' }));

    expect(store.getBlock('p1')).toBe(p1Before); // contentIds unchanged -> same block ref
  });

  it('notifies only listeners subscribed to the touched id', () => {
    const store = new EditorStore(makeDoc());
    let r1Fired = 0;
    let r2Fired = 0;
    store.subscribe('r1', () => (r1Fired += 1));
    store.subscribe('r2', () => (r2Fired += 1));

    store.applyOperation(updateRun('r1', { value: 'x' }));

    expect(r1Fired).toBe(1);
    expect(r2Fired).toBe(0);
  });
});

describe('EditorStore structural operations', () => {
  it('insertBlock adds the block and updates only the parent contentIds reference', () => {
    const store = new EditorStore(makeDoc());
    const rootBefore = store.getBlock('root');
    const newBlock = { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: [], props: {} };

    let parentFired = 0;
    store.subscribe('root', () => (parentFired += 1));
    let siblingFired = 0;
    store.subscribe('p1', () => (siblingFired += 1));

    store.applyOperation(insertBlock(newBlock, 'root', 2));

    expect(store.getBlock('root')).not.toBe(rootBefore);
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3']);
    expect(store.getBlock('p3')).toEqual(newBlock);
    expect(parentFired).toBe(1);
    expect(siblingFired).toBe(0); // sibling block itself never touched
  });

  it('removeBlock captures the full subtree for a correct inverse, and insertBlock(inverse) restores it', () => {
    const store = new EditorStore(makeDoc());

    const inverse = store.applyOperation(removeBlock('p1'));

    expect(store.getBlock('p1')).toBeUndefined();
    expect(store.getRun('r1')).toBeUndefined();
    expect(store.getBlock('root').contentIds).toEqual(['p2']);

    // undo: apply the captured inverse
    store.applyOperation(inverse);

    expect(store.getBlock('p1')).toEqual({
      id: 'p1',
      type: 'paragraph',
      parentId: 'root',
      contentIds: ['r1'],
      props: {},
    });
    expect(store.getRun('r1').value).toBe('hello');
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
  });

  it('updateBlockProps inverse restores the previous props', () => {
    const store = new EditorStore(makeDoc());
    const inverse = store.applyOperation(updateBlockProps('p1', { level: 2 }));
    expect(store.getBlock('p1').props.level).toBe(2);

    store.applyOperation(inverse);
    expect(store.getBlock('p1').props.level).toBeUndefined();
  });

  it('setBlockContentIds reassigns contentIds and inverse restores the old array', () => {
    const store = new EditorStore(makeDoc());
    const inverse = store.applyOperation(setBlockContentIds('p1', ['r1', 'r2']));
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);

    store.applyOperation(inverse);
    expect(store.getBlock('p1').contentIds).toEqual(['r1']);
  });

  it('replaceRunSpan splits a run into before/middle/after and inverse restores the original run', () => {
    const store = new EditorStore(makeDoc());
    const newRuns = [
      { id: 'nr-before', type: 'text', value: 'he', marks: {} },
      { id: 'nr-middle', type: 'text', value: 'l', marks: { bold: true } },
      { id: 'nr-after', type: 'text', value: 'lo', marks: {} },
    ];

    const inverse = store.applyOperation(replaceRunSpan('p1', ['r1'], newRuns));

    expect(store.getBlock('p1').contentIds).toEqual(['nr-before', 'nr-middle', 'nr-after']);
    expect(store.getRun('r1')).toBeUndefined();
    expect(store.getRun('nr-middle').marks.bold).toBe(true);

    store.applyOperation(inverse);
    expect(store.getBlock('p1').contentIds).toEqual(['r1']);
    expect(store.getRun('r1').value).toBe('hello');
    expect(store.getRun('nr-before')).toBeUndefined();
  });

  it('replaceRunSpan operates on props.titleRunIds for a listItem without touching contentIds (nested children)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['li2'], // a nested child list item — must be left untouched
          props: { ordered: false, titleRunIds: ['tr1'] },
        },
        { id: 'li2', type: 'listItem', parentId: 'li1', contentIds: [], props: { ordered: false, titleRunIds: [] } },
      ],
      runs: [{ id: 'tr1', type: 'text', value: 'hello', marks: {} }],
    });

    const newRuns = [
      { id: 'ntr-before', type: 'text', value: 'he', marks: {} },
      { id: 'ntr-middle', type: 'text', value: 'llo', marks: { bold: true } },
    ];
    const inverse = store.applyOperation(replaceRunSpan('li1', ['tr1'], newRuns));

    expect(store.getBlock('li1').props.titleRunIds).toEqual(['ntr-before', 'ntr-middle']);
    expect(store.getBlock('li1').contentIds).toEqual(['li2']); // untouched
    expect(store.getRun('ntr-middle').marks.bold).toBe(true);

    store.applyOperation(inverse);
    expect(store.getBlock('li1').props.titleRunIds).toEqual(['tr1']);
    expect(store.getBlock('li1').contentIds).toEqual(['li2']);
  });

  it('setBlockRuns wholesale replaces a leaf block\'s runs (contentIds path) and inverse restores the original list', () => {
    const store = new EditorStore(makeDoc());
    const newRuns = [
      { id: 'nr1', type: 'text', value: 'goodbye', marks: {} },
      { id: 'nr2', type: 'text', value: ' world', marks: { italic: true } },
    ];

    const inverse = store.applyOperation(setBlockRuns('p1', newRuns));

    expect(store.getBlock('p1').contentIds).toEqual(['nr1', 'nr2']);
    expect(store.getRun('r1')).toBeUndefined();
    expect(store.getRun('nr2').marks.italic).toBe(true);

    store.applyOperation(inverse);
    expect(store.getBlock('p1').contentIds).toEqual(['r1']);
    expect(store.getRun('r1').value).toBe('hello');
    expect(store.getRun('nr1')).toBeUndefined();
  });

  it('setBlockRuns operates on props.titleRunIds for a listItem without touching contentIds (nested children)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['li2'],
          props: { ordered: false, titleRunIds: ['tr1'] },
        },
        { id: 'li2', type: 'listItem', parentId: 'li1', contentIds: [], props: { ordered: false, titleRunIds: [] } },
      ],
      runs: [{ id: 'tr1', type: 'text', value: 'hello', marks: {} }],
    });

    const newRuns = [{ id: 'ntr1', type: 'text', value: 'hi', marks: {} }];
    const inverse = store.applyOperation(setBlockRuns('li1', newRuns));

    expect(store.getBlock('li1').props.titleRunIds).toEqual(['ntr1']);
    expect(store.getBlock('li1').contentIds).toEqual(['li2']); // untouched
    expect(store.getRun('tr1')).toBeUndefined();

    store.applyOperation(inverse);
    expect(store.getBlock('li1').props.titleRunIds).toEqual(['tr1']);
    expect(store.getBlock('li1').contentIds).toEqual(['li2']);
  });
});

describe('EditorStore serialization', () => {
  it('round-trips through toJSON/fromJSON', () => {
    const store = new EditorStore(makeDoc());
    const restored = EditorStore.fromJSON(store.toJSON());
    expect(restored.getBlock('p1')).toEqual(store.getBlock('p1'));
    expect(restored.getRun('r1')).toEqual(store.getRun('r1'));
    expect(restored.getRootId()).toBe('root');
  });
});

describe('EditorStore.subscribeAll', () => {
  it('fires once per applyOperation call, regardless of which id(s) were touched', () => {
    const store = new EditorStore(makeDoc());
    let calls = 0;
    store.subscribeAll(() => {
      calls += 1;
    });

    store.applyOperation(updateRun('r1', { value: 'changed' }));
    expect(calls).toBe(1);

    store.applyOperation(updateBlockProps('p1', { foo: 'bar' }));
    expect(calls).toBe(2);
  });

  it('fires for remote operations too, not just local ones', () => {
    const store = new EditorStore(makeDoc());
    const remoteStore = new EditorStore(makeDoc());
    let calls = 0;
    store.subscribeAll(() => {
      calls += 1;
    });

    remoteStore.applyOperation(updateRun('r1', { value: 'from remote' }));
    store.applyRemoteOperation(remoteStore.getLastEnvelope());
    expect(calls).toBe(1);
  });

  it('the returned unsubscribe function stops further notifications', () => {
    const store = new EditorStore(makeDoc());
    let calls = 0;
    const unsubscribe = store.subscribeAll(() => {
      calls += 1;
    });

    store.applyOperation(updateRun('r1', { value: 'one' }));
    unsubscribe();
    store.applyOperation(updateRun('r1', { value: 'two' }));
    expect(calls).toBe(1);
  });
});

describe('EditorStore tombstone garbage collection', () => {
  it('getTombstoneCount reflects deleted blocks, pruneTombstones removes old ones', () => {
    const store = new EditorStore(makeDoc());
    expect(store.getTombstoneCount()).toBe(0);

    const deleteTime = Date.now();
    store.applyOperation(removeBlock('p1')); // deleteClock's wallTime lands at ~deleteTime
    expect(store.getTombstoneCount()).toBe(1);

    // too recent to prune with the default 24h window -- "now" is basically the same moment as the delete
    expect(store.pruneTombstones({ now: deleteTime })).toBe(0);
    expect(store.getTombstoneCount()).toBe(1);

    // simulate 24h (+ a generous margin for real clock ticks during the test) passing
    const removed = store.pruneTombstones({ now: deleteTime + 24 * 60 * 60 * 1000 + 1000 });
    expect(removed).toBe(1);
    expect(store.getTombstoneCount()).toBe(0);
  });

  it('pruning does not change the visible document at all', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(removeBlock('p1'));
    const before = store.getBlock('root').contentIds;

    store.pruneTombstones({ now: Date.now() + 30 * 24 * 60 * 60 * 1000 });

    expect(store.getBlock('root').contentIds).toEqual(before);
    expect(store.getBlock('root').contentIds).toEqual(['p2']);
  });

  it('a block inserted after pruning still lands in the correct position (no orphaning across the whole store, not just one ListCrdtState)', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(removeBlock('p1')); // root: [p1(deleted), p2] -- p2 anchored to p1
    store.pruneTombstones({ now: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    expect(store.getBlock('root').contentIds).toEqual(['p2']);

    const p3 = { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} };
    store.applyOperation(insertBlock(p3, 'root', 0, { blocks: [p3], runs: [{ id: 'r3', type: 'text', value: 'new', marks: {} }] }));
    expect(store.getBlock('root').contentIds).toEqual(['p3', 'p2']);
  });

  it('History delegates getTombstoneCount/pruneTombstones to the underlying store, without touching the undo stack', async () => {
    const { History } = await import('../../src/store/history.js');
    const history = new History(new EditorStore(makeDoc()));
    history.perform(removeBlock('p1'));
    expect(history.getTombstoneCount()).toBe(1);

    const undoStackSizeBefore = history.undoStack.length;
    history.pruneTombstones({ now: Date.now() + 30 * 24 * 60 * 60 * 1000 });

    expect(history.getTombstoneCount()).toBe(0);
    expect(history.undoStack.length).toBe(undoStackSizeBefore); // pruning is not an undo step
    expect(history.canUndo()).toBe(true); // the original delete is still undoable
  });
});
