import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { deleteRunRangeInBlock, deleteOverBlockRange } from '../../src/inline/deleteCommands.js';

describe('deleteRunRangeInBlock', () => {
  function makeDoc() {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello world', marks: {} }],
    };
  }

  it('deletes a middle slice of a single run and leaves the caret at the join', () => {
    const store = new EditorStore(makeDoc());
    const result = deleteRunRangeInBlock(store, 'p1', { startRunId: 'r1', startOffset: 5, endRunId: 'r1', endOffset: 6 });

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(1);
    expect(store.getRun(contentIds[0]).value).toBe('helloworld');
    expect(result.offset).toBe(5);
  });

  it('deletes across two runs, keeping the surviving prefix + suffix', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'hello ', marks: {} },
        { id: 'r2', type: 'text', value: 'world', marks: {} },
      ],
    });

    deleteRunRangeInBlock(store, 'p1', { startRunId: 'r1', startOffset: 2, endRunId: 'r2', endOffset: 3 });

    const contentIds = store.getBlock('p1').contentIds;
    const text = contentIds.map((id) => store.getRun(id).value).join('');
    expect(text).toBe('held');
  });

  it('deletes an atomic run entirely when the whole-node range covers it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'chip', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'before ', marks: {} },
        { id: 'chip', type: 'select', value: '', marks: {}, data: {} },
        { id: 'r2', type: 'text', value: ' after', marks: {} },
      ],
    });

    deleteRunRangeInBlock(store, 'p1', { startRunId: 'chip', startOffset: 0, endRunId: 'chip', endOffset: 1 });

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds).toEqual(['r1', 'r2']);
  });

  it('deleting everything in the block falls back to one blank run, not zero', () => {
    const store = new EditorStore(makeDoc());
    const result = deleteRunRangeInBlock(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 11 });

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(1);
    expect(store.getRun(contentIds[0]).value).toBe('');
    expect(result.runId).toBe(contentIds[0]);
  });

  it('is one atomic undo step through History', () => {
    const store = new History(new EditorStore(makeDoc()));
    deleteRunRangeInBlock(store, 'p1', { startRunId: 'r1', startOffset: 5, endRunId: 'r1', endOffset: 6 });
    expect(store.getRun(store.getBlock('p1').contentIds[0]).value).toBe('helloworld');

    store.undo();
    expect(store.getBlock('p1').contentIds).toEqual(['r1']);
    expect(store.getRun('r1').value).toBe('hello world');

    store.redo();
    expect(store.getRun(store.getBlock('p1').contentIds[0]).value).toBe('helloworld');
  });
});

describe('deleteOverBlockRange', () => {
  function makeThreeParagraphDoc() {
    return new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2', 'p3'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
        { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'one line', marks: {} },
        { id: 'r2', type: 'text', value: 'two line', marks: {} },
        { id: 'r3', type: 'text', value: 'three line', marks: {} },
      ],
    });
  }

  it('removes fully-covered middle blocks and merges the trimmed boundary blocks into one', () => {
    const store = makeThreeParagraphDoc();
    const result = deleteOverBlockRange(store, {
      blockIds: ['p1', 'p2', 'p3'],
      startBlockId: 'p1',
      startRunId: 'r1',
      startOffset: 3, // "one|"
      endBlockId: 'p3',
      endRunId: 'r3',
      endOffset: 5, // "three|"
    });

    expect(store.getBlock('p2')).toBeUndefined();
    expect(store.getBlock('p3')).toBeUndefined();
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual(['p1']);
    const mergedText = store
      .getBlock('p1')
      .contentIds.map((id) => store.getRun(id).value)
      .join('');
    expect(mergedText).toBe('one line');
    expect(result.blockId).toBe('p1');
  });

  it('leaves both boundary blocks trimmed (not merged) when their types are not mergeable', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'li1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r2'] } },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'hello world', marks: {} },
        { id: 'r2', type: 'text', value: 'buy milk', marks: {} },
      ],
    });

    deleteOverBlockRange(store, {
      blockIds: ['p1', 'li1'],
      startBlockId: 'p1',
      startRunId: 'r1',
      startOffset: 6, // "hello |world"
      endBlockId: 'li1',
      endRunId: 'r2',
      endOffset: 3, // "buy| milk"
    });

    expect(store.getBlock('p1')).toBeDefined();
    expect(store.getBlock('li1')).toBeDefined();
    expect(store.getRun(store.getBlock('p1').contentIds[0]).value).toBe('hello ');
    expect(store.getRun(store.getBlock('li1').props.titleRunIds[0]).value).toBe(' milk');
  });

  it('deleting the entire document (select-all then delete) leaves one blank paragraph, focused', () => {
    const store = makeThreeParagraphDoc();
    const result = deleteOverBlockRange(store, {
      blockIds: ['p1', 'p2', 'p3'],
      startBlockId: 'p1',
      startRunId: 'r1',
      startOffset: 0,
      endBlockId: 'p3',
      endRunId: 'r3',
      endOffset: 'three line'.length,
    });

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(1);
    const survivor = store.getBlock(rootIds[0]);
    expect(survivor.type).toBe('paragraph');
    expect(store.getRun(survivor.contentIds[0]).value).toBe('');
    expect(result.blockId).toBe(rootIds[0]);
  });

  it('deleting the entire document when it starts with a heading still falls back to a blank paragraph', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r1'], props: { level: 2 } },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'Title', marks: {} },
        { id: 'r2', type: 'text', value: 'body text', marks: {} },
      ],
    });

    deleteOverBlockRange(store, {
      blockIds: ['h1', 'p1'],
      startBlockId: 'h1',
      startRunId: 'r1',
      startOffset: 0,
      endBlockId: 'p1',
      endRunId: 'r2',
      endOffset: 'body text'.length,
    });

    expect(store.getBlock('h1')).toBeUndefined();
    expect(store.getBlock('p1')).toBeUndefined();
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(1);
    const survivor = store.getBlock(rootIds[0]);
    expect(survivor.type).toBe('paragraph');
    expect(store.getRun(survivor.contentIds[0]).value).toBe('');
  });

  it('is one atomic undo step through History, even for the whole-document case', () => {
    const store = new History(makeThreeParagraphDoc());
    deleteOverBlockRange(store, {
      blockIds: ['p1', 'p2', 'p3'],
      startBlockId: 'p1',
      startRunId: 'r1',
      startOffset: 0,
      endBlockId: 'p3',
      endRunId: 'r3',
      endOffset: 'three line'.length,
    });

    expect(store.getBlock('root').contentIds.length).toBe(1);

    store.undo();
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual(['p1', 'p2', 'p3']);
    expect(store.getRun(store.getBlock('p1').contentIds[0]).value).toBe('one line');
    expect(store.getRun(store.getBlock('p2').contentIds[0]).value).toBe('two line');
    expect(store.getRun(store.getBlock('p3').contentIds[0]).value).toBe('three line');

    store.redo();
    const rootIdsAfterRedo = store.getBlock('root').contentIds;
    expect(rootIdsAfterRedo.length).toBe(1);
    expect(store.getBlock(rootIdsAfterRedo[0]).type).toBe('paragraph');
  });

  it('delegates to deleteRunRangeInBlock when the range is actually within a single block', () => {
    const store = makeThreeParagraphDoc();
    const result = deleteOverBlockRange(store, {
      blockIds: ['p1'],
      startBlockId: 'p1',
      startRunId: 'r1',
      startOffset: 0,
      endBlockId: 'p1',
      endRunId: 'r1',
      endOffset: 3,
    });

    expect(store.getRun(result.runId).value).toBe(' line');
  });
});
