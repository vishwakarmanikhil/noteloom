import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import {
  addCommentMarkOverRange,
  removeCommentMarkEverywhere,
} from '../../src/comments/commentMarks.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'Hello world', marks: {} }],
  };
}

describe('addCommentMarkOverRange', () => {
  it('appends commentIds to the whole run when the range covers it exactly', () => {
    const store = new EditorStore(makeDoc());
    const op = addCommentMarkOverRange(
      store,
      { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 11 },
      'c1',
    );
    store.applyOperation(op);
    expect(store.getRun('r1').marks.commentIds).toEqual(['c1']);
  });

  it('splits a run for a partial-range comment, leaving the rest unmarked', () => {
    const store = new EditorStore(makeDoc());
    const op = addCommentMarkOverRange(
      store,
      { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 },
      'c1',
    );
    store.applyOperation(op);

    const runIds = store.getBlock('p1').contentIds;
    expect(runIds.length).toBe(2);
    const [firstId, secondId] = runIds;
    expect(store.getRun(firstId).value).toBe('Hello');
    expect(store.getRun(firstId).marks.commentIds).toEqual(['c1']);
    expect(store.getRun(secondId).value).toBe(' world');
    expect(store.getRun(secondId).marks.commentIds).toBeUndefined();
  });

  it('two overlapping comments both survive in commentIds', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(
      addCommentMarkOverRange(
        store,
        { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 11 },
        'c1',
      ),
    );

    const runId = store.getBlock('p1').contentIds[0];
    store.applyOperation(
      addCommentMarkOverRange(
        store,
        { blockId: 'p1', startRunId: runId, startOffset: 0, endRunId: runId, endOffset: 5 },
        'c2',
      ),
    );

    const [firstId] = store.getBlock('p1').contentIds;
    expect(store.getRun(firstId).marks.commentIds).toEqual(['c1', 'c2']);
  });

  it('coexists with a pre-existing bold mark on the same run without clobbering it', () => {
    const doc = makeDoc();
    doc.runs[0].marks = { bold: true };
    const store = new EditorStore(doc);
    store.applyOperation(
      addCommentMarkOverRange(
        store,
        { blockId: 'p1', startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 },
        'c1',
      ),
    );

    const firstId = store.getBlock('p1').contentIds[0];
    const run = store.getRun(firstId);
    expect(run.marks.bold).toBe(true);
    expect(run.marks.commentIds).toEqual(['c1']);
  });

  it('returns null for a collapsed range', () => {
    const store = new EditorStore(makeDoc());
    const op = addCommentMarkOverRange(
      store,
      { blockId: 'p1', startRunId: 'r1', startOffset: 3, endRunId: 'r1', endOffset: 3 },
      'c1',
    );
    expect(op).toBeNull();
  });
});

describe('removeCommentMarkEverywhere', () => {
  it('strips the comment id from every run that carries it, across the whole document', () => {
    const doc = {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'Hello', marks: { commentIds: ['c1'] } },
        { id: 'r2', type: 'text', value: 'World', marks: { commentIds: ['c1', 'c2'] } },
      ],
    };
    const store = new EditorStore(doc);
    const ops = removeCommentMarkEverywhere(store, 'c1');
    expect(ops.length).toBe(2);
    for (const op of ops) store.applyOperation(op);

    expect(store.getRun('r1').marks.commentIds).toBeUndefined();
    expect(store.getRun('r2').marks.commentIds).toEqual(['c2']);
  });

  it('returns no ops when the comment id is not present anywhere', () => {
    const store = new EditorStore(makeDoc());
    expect(removeCommentMarkEverywhere(store, 'never-added')).toEqual([]);
  });
});
