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
