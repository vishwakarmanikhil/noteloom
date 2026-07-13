import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { insertBlock, updateRun, removeBlock, setBlockContentIds } from '../../src/store/operations.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('History coalescing', () => {
  it('coalesces rapid same-run edits into one undo step', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'h' }), { timestamp: 1000 });
    history.perform(updateRun('r1', { value: 'he' }), { timestamp: 1100 });
    history.perform(updateRun('r1', { value: 'hel' }), { timestamp: 1200 });

    expect(store.getRun('r1').value).toBe('hel');
    expect(history.undoStack.length).toBe(0); // still batching, not committed yet
    expect(history.canUndo()).toBe(true); // but a batch is in progress

    history.undo();
    expect(store.getRun('r1').value).toBe(''); // one undo unwinds the whole typing burst
  });

  it('does not coalesce across an idle gap beyond the threshold', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store, { idleMs: 500 });

    history.perform(updateRun('r1', { value: 'h' }), { timestamp: 1000 });
    history.perform(updateRun('r1', { value: 'he' }), { timestamp: 1100 });
    // big gap
    history.perform(updateRun('r1', { value: 'hel' }), { timestamp: 5000 });

    history.undo(); // unwinds only the second batch ("hel" <- "he")
    expect(store.getRun('r1').value).toBe('he');
    history.undo(); // unwinds the first batch ("he" <- "" via "h")
    expect(store.getRun('r1').value).toBe('');
  });

  it('never coalesces a structural op with surrounding run edits', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'h' }), { timestamp: 1000 });
    history.perform(
      insertBlock({ id: 'p2', type: 'paragraph', parentId: 'root', contentIds: [], props: {} }, 'root', 1),
      { timestamp: 1050 },
    );
    history.perform(updateRun('r1', { value: 'he' }), { timestamp: 1100 });

    // three independent steps: run edit, insert, run edit
    history.undo();
    expect(store.getRun('r1').value).toBe('h');
    history.undo();
    expect(store.getBlock('p2')).toBeUndefined();
    history.undo();
    expect(store.getRun('r1').value).toBe('');
  });

  it('breaks the batch at a word boundary (trailing whitespace)', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hello ' }), { timestamp: 1000 }); // ends in whitespace -> boundary
    history.perform(updateRun('r1', { value: 'hello world' }), { timestamp: 1100 });

    history.undo();
    expect(store.getRun('r1').value).toBe('hello '); // second word's batch undone first
    history.undo();
    expect(store.getRun('r1').value).toBe('');
  });
});

describe('History undo/redo correctness', () => {
  it('redo re-applies the forward operation after an undo', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hello' }), { timestamp: 1000 });
    history.undo();
    expect(store.getRun('r1').value).toBe('');

    history.redo();
    expect(store.getRun('r1').value).toBe('hello');
  });

  it('a new edit after undo clears the redo stack', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hello' }), { timestamp: 1000 });
    history.undo();
    expect(history.canRedo()).toBe(true);

    history.perform(updateRun('r1', { value: 'bye' }), { timestamp: 2000 });
    expect(history.canRedo()).toBe(false);
  });
});

describe('History.getChangeLog (opt-in "what changed, from what to what" log)', () => {
  it('is empty by default — off unless trackChanges is explicitly requested', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hello' }), { actorId: 'user-1', timestamp: 1000 });
    expect(history.getChangeLog()).toEqual([]);
  });

  it('records before/after values for a text edit when trackChanges is on', () => {
    const store = new EditorStore(makeDoc()); // r1 starts as ''
    const history = new History(store, { trackChanges: true });

    history.perform(updateRun('r1', { value: 'hello' }), { actorId: 'user-1', timestamp: 1000 });

    const log = history.getChangeLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      opType: 'updateRun',
      id: 'r1',
      before: { value: '' },
      after: { value: 'hello' },
      actorId: 'user-1',
      timestamp: 1000,
    });
  });

  it('logs a structural op as the bare fact — no before/after snapshot', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store, { trackChanges: true });

    history.performBatch(
      [insertBlock({ id: 'p2', type: 'paragraph', parentId: 'root', contentIds: [], props: {} }, 'root', 1)],
      { actorId: 'user-1', timestamp: 1000 },
    );

    const log = history.getChangeLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ opType: 'insertBlock', id: 'p2', actorId: 'user-1', timestamp: 1000 });
    expect(log[0].before).toBeUndefined();
    expect(log[0].after).toBeUndefined();
  });

  it('caps the log at maxChangeLogSize, dropping the oldest entries first', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store, { trackChanges: true, maxChangeLogSize: 2 });

    history.perform(updateRun('r1', { value: 'h' }), { timestamp: 1000 });
    history.perform(updateRun('r1', { value: 'he' }), { timestamp: 1100 });
    history.perform(updateRun('r1', { value: 'hel' }), { timestamp: 1200 });

    const log = history.getChangeLog();
    expect(log).toHaveLength(2);
    expect(log.map((e) => e.timestamp)).toEqual([1100, 1200]); // oldest (1000) dropped
  });

  it('is independent of undo/redo — undoing an edit does not remove or rewrite its log entry', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store, { trackChanges: true });

    history.perform(updateRun('r1', { value: 'hello' }), { timestamp: 1000 });
    history.undo();

    expect(history.getChangeLog()).toHaveLength(1); // the original edit is still on record
    expect(store.getRun('r1').value).toBe('');
  });
});

describe('History.getPendingSelection (caret restore after undo/redo)', () => {
  it('undo of a single append-at-end edit points back at the end of the old value', () => {
    const store = new EditorStore(makeDoc()); // r1 starts as ''
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hello' }), { timestamp: 1000 });
    history.undo();
    expect(store.getRun('r1').value).toBe('');
    expect(history.getPendingSelection()).toEqual({ runId: 'r1', offset: 0 });
  });

  it('redo of the same edit points at the end of the new value', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hello' }), { timestamp: 1000 });
    history.undo();
    history.redo();
    expect(history.getPendingSelection()).toEqual({ runId: 'r1', offset: 5 });
  });

  it('a coalesced typing burst resolves to one clean before/after diff across the whole batch', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'h' }), { timestamp: 1000 });
    history.perform(updateRun('r1', { value: 'he' }), { timestamp: 1100 });
    history.perform(updateRun('r1', { value: 'hel' }), { timestamp: 1200 });

    history.undo(); // unwinds the whole burst as one step
    expect(store.getRun('r1').value).toBe('');
    expect(history.getPendingSelection()).toEqual({ runId: 'r1', offset: 0 });

    history.redo();
    expect(history.getPendingSelection()).toEqual({ runId: 'r1', offset: 3 }); // end of "hel"
  });

  it('an edit in the middle of existing text resolves to the actual edit point, not the end of the run', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    });
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'helXlo' }), { timestamp: 1000 }); // inserted "X" at offset 3
    history.undo();
    expect(store.getRun('r1').value).toBe('hello');
    expect(history.getPendingSelection()).toEqual({ runId: 'r1', offset: 3 });

    history.redo();
    expect(history.getPendingSelection()).toEqual({ runId: 'r1', offset: 4 }); // right after the inserted "X"
  });

  it('is null for a structural (non-text-run) undo/redo step', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.performBatch(
      [insertBlock({ id: 'p2', type: 'paragraph', parentId: 'root', contentIds: [], props: {} }, 'root', 1)],
      { timestamp: 1000 },
    );
    history.undo();
    expect(history.getPendingSelection()).toBeNull();

    history.redo();
    expect(history.getPendingSelection()).toBeNull();
  });
});

describe('History audit log', () => {
  it('records actorId and timestamp for every operation, independent of undo/redo', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hi' }), { actorId: 'user-1', timestamp: 1000 });
    history.undo();

    const log = history.getHistoryLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ opType: 'updateRun', id: 'r1', actorId: 'user-1', timestamp: 1000 });
  });
});

describe('History getUndoRedoSnapshot reference stability', () => {
  it('returns the same reference when canUndo/canRedo have not changed', () => {
    const store = new EditorStore(makeDoc());
    const history = new History(store);

    const snap1 = history.getUndoRedoSnapshot();
    const snap2 = history.getUndoRedoSnapshot();
    expect(snap1).toBe(snap2);

    history.perform(updateRun('r1', { value: 'x' }), { timestamp: 1000 });
    history.flush();
    const snap3 = history.getUndoRedoSnapshot();
    expect(snap3).not.toBe(snap1);
    expect(snap3.canUndo).toBe(true);
  });
});

describe('History.performBatch', () => {
  function makeTwoParagraphDoc() {
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

  it('applies multiple ops as one undo step (merge-like scenario)', () => {
    const store = new EditorStore(makeTwoParagraphDoc());
    const history = new History(store);

    // simulate merging p2 into p1: move r2 onto p1, empty out p2, delete p2
    history.performBatch(
      [setBlockContentIds('p1', ['r1', 'r2']), setBlockContentIds('p2', []), removeBlock('p2')],
      { timestamp: 1000 },
    );

    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
    expect(store.getBlock('p2')).toBeUndefined();
    expect(store.getRun('r2').value).toBe('world'); // moved, not deleted

    history.undo();

    expect(store.getBlock('p1').contentIds).toEqual(['r1']);
    expect(store.getBlock('p2')).toBeDefined();
    expect(store.getBlock('p2').contentIds).toEqual(['r2']);
    expect(store.getRun('r2').value).toBe('world');
  });

  it('flushes any in-progress coalescing batch before recording the atomic batch', () => {
    const store = new EditorStore(makeTwoParagraphDoc());
    const history = new History(store);

    history.perform(updateRun('r1', { value: 'hi' }), { timestamp: 1000 }); // in-progress batch
    history.performBatch([removeBlock('p2')], { timestamp: 1100 });

    // two independent undo steps: the atomic batch, then the typing batch
    history.undo();
    expect(store.getBlock('p2')).toBeDefined();
    history.undo();
    expect(store.getRun('r1').value).toBe('hello');
  });
});
