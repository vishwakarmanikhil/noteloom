import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import {
  toggleMarkOnRunRange,
  toggleMarkOverSelection,
  toggleMarkOverBlockRange,
  setMarksOverSelection,
  setMarksOverBlockRange,
  getMarksSummaryOverSelection,
  getMarksSummaryOverBlockRange,
} from '../../src/inline/markCommands.js';

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

describe('toggleMarkOnRunRange', () => {
  it('toggles the whole run without splitting when the range covers it entirely', () => {
    const store = new EditorStore(makeDoc());
    const resultId = toggleMarkOnRunRange(store, 'p1', 'r1', 0, 11, 'bold');

    expect(resultId).toBe('r1');
    expect(store.getBlock('p1').contentIds).toEqual(['r1']);
    expect(store.getRun('r1').marks.bold).toBe(true);
  });

  it('toggling twice on the whole run is idempotent (on, then off)', () => {
    const store = new EditorStore(makeDoc());
    toggleMarkOnRunRange(store, 'p1', 'r1', 0, 11, 'bold');
    toggleMarkOnRunRange(store, 'p1', 'r1', 0, 11, 'bold');
    expect(store.getRun('r1').marks.bold).toBeUndefined();
  });

  it('splits into before/middle/after runs for a partial selection', () => {
    const store = new EditorStore(makeDoc());
    const middleId = toggleMarkOnRunRange(store, 'p1', 'r1', 6, 11, 'bold'); // "world"

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(2); // "hello " + bold("world")
    expect(store.getRun(contentIds[0]).value).toBe('hello ');
    expect(store.getRun(contentIds[0]).marks.bold).toBeUndefined();
    expect(store.getRun(contentIds[1]).value).toBe('world');
    expect(store.getRun(contentIds[1]).marks.bold).toBe(true);
    expect(contentIds[1]).toBe(middleId);
  });

  it('splits into three runs when the selection is in the middle', () => {
    const store = new EditorStore(makeDoc());
    toggleMarkOnRunRange(store, 'p1', 'r1', 3, 8, 'italic'); // "lo wo"

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(3);
    expect(store.getRun(contentIds[0]).value).toBe('hel');
    expect(store.getRun(contentIds[1]).value).toBe('lo wo');
    expect(store.getRun(contentIds[1]).marks.italic).toBe(true);
    expect(store.getRun(contentIds[2]).value).toBe('rld');
  });

  it('does nothing for a collapsed (zero-length) range', () => {
    const store = new EditorStore(makeDoc());
    const before = store.getBlock('p1').contentIds;
    toggleMarkOnRunRange(store, 'p1', 'r1', 4, 4, 'bold');
    expect(store.getBlock('p1').contentIds).toEqual(before);
    expect(store.getRun('r1').marks.bold).toBeUndefined();
  });

  it('inverse (via store.applyOperation on the returned op) is not needed directly — undo works through History', () => {
    // covered end-to-end in history.test.js-style usage; this is a smoke check
    // that replaceRunSpan's own inverse round-trips correctly for a split.
    const store = new EditorStore(makeDoc());
    const inverseCapture = [];
    const originalApply = store.applyOperation.bind(store);
    store.applyOperation = (op) => {
      const inverse = originalApply(op);
      inverseCapture.push(inverse);
      return inverse;
    };

    toggleMarkOnRunRange(store, 'p1', 'r1', 6, 11, 'bold');
    const inverse = inverseCapture[inverseCapture.length - 1];
    store.applyOperation(inverse);

    expect(store.getBlock('p1').contentIds).toEqual(['r1']);
    expect(store.getRun('r1').value).toBe('hello world');
  });
});

describe('toggleMarkOverSelection: multi-run ranges within one block', () => {
  function makeSplitDoc() {
    // "hello " (r1) + bold("wor") (r2) + "ld" (r3) — pre-split, simulating a
    // selection that crosses an existing bold boundary
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2', 'r3'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'hello ', marks: {} },
        { id: 'r2', type: 'text', value: 'wor', marks: { bold: true } },
        { id: 'r3', type: 'text', value: 'ld', marks: {} },
      ],
    };
  }

  it('delegates to the single-run path when the selection collapses to one run', () => {
    const store = new EditorStore(makeSplitDoc());
    const resultId = toggleMarkOverSelection(
      store,
      'p1',
      { startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 6 },
      'italic',
    );
    expect(resultId).toBe('r1');
    expect(store.getRun('r1').marks.italic).toBe(true);
  });

  it('toggles a mark ON across a selection spanning three runs, enabling it everywhere since not all runs had it', () => {
    const store = new EditorStore(makeSplitDoc());
    // select "lo wor" -> spans end of r1, all of r2, start of r3... use "o wor" across r1(end)+r2+r3(start)
    toggleMarkOverSelection(
      store,
      'p1',
      { startRunId: 'r1', startOffset: 4, endRunId: 'r3', endOffset: 1 }, // "o " + "wor" + "l"
      'italic',
    );

    const contentIds = store.getBlock('p1').contentIds;
    // "hell" + italic("o ") + italic-bold("wor") + italic("l") + "d"
    const runs = contentIds.map((id) => store.getRun(id));
    expect(runs.map((r) => r.value).join('')).toBe('hello world');
    expect(runs.find((r) => r.value === 'o ').marks.italic).toBe(true);
    expect(runs.find((r) => r.value === 'wor').marks.italic).toBe(true);
    expect(runs.find((r) => r.value === 'wor').marks.bold).toBe(true); // pre-existing mark preserved
    expect(runs.find((r) => r.value === 'l').marks.italic).toBe(true);
  });

  it('toggles a mark OFF across the whole range when every text run already has it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'foo', marks: { bold: true } },
        { id: 'r2', type: 'text', value: 'bar', marks: { bold: true } },
      ],
    });

    toggleMarkOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r2', endOffset: 3 }, 'bold');

    const contentIds = store.getBlock('p1').contentIds;
    const runs = contentIds.map((id) => store.getRun(id));
    expect(runs.every((r) => !r.marks.bold)).toBe(true);
  });

  it('passes an atomic (non-text) run in the range through untouched', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'sel1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'pick ', marks: {} },
        { id: 'sel1', type: 'select', value: '', marks: {}, data: { options: [], selectedValue: '' } },
        { id: 'r2', type: 'text', value: ' now', marks: {} },
      ],
    });

    toggleMarkOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r2', endOffset: 4 }, 'bold');

    const contentIds = store.getBlock('p1').contentIds;
    const selectRun = contentIds.map((id) => store.getRun(id)).find((r) => r.type === 'select');
    expect(selectRun).toBeDefined();
    expect(selectRun.id).toBe('sel1'); // untouched, same id, no marks added
    expect(selectRun.marks).toEqual({});
  });

  it('normalizes a reversed selection (focus before anchor)', () => {
    const store = new EditorStore(makeSplitDoc());
    // "endRun" comes before "startRun" in document order (user selected backward)
    toggleMarkOverSelection(
      store,
      'p1',
      { startRunId: 'r3', startOffset: 1, endRunId: 'r1', endOffset: 4 },
      'italic',
    );

    const contentIds = store.getBlock('p1').contentIds;
    const runs = contentIds.map((id) => store.getRun(id));
    expect(runs.map((r) => r.value).join('')).toBe('hello world');
    expect(runs.find((r) => r.value === 'o ').marks.italic).toBe(true);
  });
});

describe('toggleMarkOverBlockRange: selection spanning multiple sibling blocks', () => {
  function makeThreeParagraphDoc() {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2', 'p3'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
        { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first', marks: {} },
        { id: 'r2', type: 'text', value: 'second', marks: {} },
        { id: 'r3', type: 'text', value: 'third', marks: {} },
      ],
    };
  }

  it('delegates to the single-block path when the range collapses to one block', () => {
    const store = new EditorStore(makeThreeParagraphDoc());
    toggleMarkOverBlockRange(
      store,
      { blockIds: ['p1', 'p2', 'p3'], startBlockId: 'p2', startRunId: 'r2', startOffset: 0, endBlockId: 'p2', endRunId: 'r2', endOffset: 6 },
      'bold',
    );
    expect(store.getRun('r2').marks.bold).toBe(true);
    expect(store.getRun('r1').marks.bold).toBeUndefined();
  });

  it('toggles ON across three blocks: partial first block, full middle block, partial last block', () => {
    const store = new EditorStore(makeThreeParagraphDoc());
    // select "rst" (end of p1) through "thi" (start of p3), fully covering p2
    toggleMarkOverBlockRange(
      store,
      {
        blockIds: ['p1', 'p2', 'p3'],
        startBlockId: 'p1',
        startRunId: 'r1',
        startOffset: 2,
        endBlockId: 'p3',
        endRunId: 'r3',
        endOffset: 3,
      },
      'bold',
    );

    const p1Runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(p1Runs.find((r) => r.value === 'fi').marks.bold).toBeUndefined(); // untouched prefix
    expect(p1Runs.find((r) => r.value === 'rst').marks.bold).toBe(true);

    // p2 is fully inside the range: entirely bolded
    expect(store.getRun('r2').marks.bold).toBe(true);
    expect(store.getRun('r2').value).toBe('second');

    const p3Runs = store.getBlock('p3').contentIds.map((id) => store.getRun(id));
    expect(p3Runs.find((r) => r.value === 'thi').marks.bold).toBe(true);
    expect(p3Runs.find((r) => r.value === 'rd').marks.bold).toBeUndefined(); // untouched suffix
  });

  it('toggles OFF across the whole range when every text run already has the mark', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'foo', marks: { bold: true } },
        { id: 'r2', type: 'text', value: 'bar', marks: { bold: true } },
      ],
    });

    toggleMarkOverBlockRange(
      store,
      { blockIds: ['p1', 'p2'], startBlockId: 'p1', startRunId: 'r1', startOffset: 0, endBlockId: 'p2', endRunId: 'r2', endOffset: 3 },
      'bold',
    );

    expect(store.getRun('r1').marks.bold).toBeUndefined();
    expect(store.getRun('r2').marks.bold).toBeUndefined();
  });

  it('normalizes a reversed cross-block selection (focus block before anchor block)', () => {
    const store = new EditorStore(makeThreeParagraphDoc());
    toggleMarkOverBlockRange(
      store,
      {
        blockIds: ['p1', 'p2', 'p3'],
        startBlockId: 'p3', // selection made backward: started at p3, ended at p1
        startRunId: 'r3',
        startOffset: 3,
        endBlockId: 'p1',
        endRunId: 'r1',
        endOffset: 2,
      },
      'italic',
    );

    const p1Runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(p1Runs.find((r) => r.value === 'rst').marks.italic).toBe(true);
    expect(store.getRun('r2').marks.italic).toBe(true);
    const p3Runs = store.getBlock('p3').contentIds.map((id) => store.getRun(id));
    expect(p3Runs.find((r) => r.value === 'thi').marks.italic).toBe(true);
  });

  it('returns null when the block ids in the selection are not actually in blockIds', () => {
    const store = new EditorStore(makeThreeParagraphDoc());
    const result = toggleMarkOverBlockRange(
      store,
      { blockIds: ['p1', 'p2'], startBlockId: 'p1', startRunId: 'r1', startOffset: 0, endBlockId: 'nonexistent', endRunId: 'x', endOffset: 1 },
      'bold',
    );
    expect(result).toBeNull();
  });
});

describe('setMarksOverSelection: value-based marks and multi-mark patches (regression: color/highlight/sub-super)', () => {
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

  it('sets an arbitrary color value (not just a boolean true) over the selection', () => {
    const store = new EditorStore(makeDoc());
    setMarksOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { color: '#e03131' });

    const contentIds = store.getBlock('p1').contentIds;
    const runs = contentIds.map((id) => store.getRun(id));
    expect(runs.find((r) => r.value === 'hello').marks.color).toBe('#e03131');
    expect(runs.find((r) => r.value === ' world').marks.color).toBeUndefined();
  });

  it('clears a value mark by passing null', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: { highlight: '#fff3bf' } }],
    });

    setMarksOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 }, { highlight: null });
    expect(store.getRun('r1').marks.highlight).toBeUndefined();
  });

  it('applies two marks in one atomic patch — enabling superscript while clearing subscript in the same pass', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: { subscript: true } }],
    });

    setMarksOverSelection(
      store,
      'p1',
      { startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 5 },
      { superscript: true, subscript: null },
    );

    const marks = store.getRun('r1').marks;
    expect(marks.superscript).toBe(true);
    expect(marks.subscript).toBeUndefined();
  });
});

describe('setMarksOverBlockRange: value-based patch across sibling blocks', () => {
  it('applies a color patch across three sibling blocks in one call', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2', 'p3'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
        { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'first', marks: {} },
        { id: 'r2', type: 'text', value: 'second', marks: {} },
        { id: 'r3', type: 'text', value: 'third', marks: {} },
      ],
    });

    setMarksOverBlockRange(
      store,
      { blockIds: ['p1', 'p2', 'p3'], startBlockId: 'p1', startRunId: 'r1', startOffset: 2, endBlockId: 'p3', endRunId: 'r3', endOffset: 3 },
      { color: '#1971c2' },
    );

    const p1Runs = store.getBlock('p1').contentIds.map((id) => store.getRun(id));
    expect(p1Runs.find((r) => r.value === 'rst').marks.color).toBe('#1971c2');
    expect(store.getRun('r2').marks.color).toBe('#1971c2');
    const p3Runs = store.getBlock('p3').contentIds.map((id) => store.getRun(id));
    expect(p3Runs.find((r) => r.value === 'thi').marks.color).toBe('#1971c2');
  });
});

describe('getMarksSummaryOverSelection: toolbar "is this button active" indicator', () => {
  it('reports a boolean mark as true only when every run in range has it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'foo', marks: { bold: true } },
        { id: 'r2', type: 'text', value: 'bar', marks: {} },
      ],
    });

    const mixed = getMarksSummaryOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r2', endOffset: 3 });
    expect(mixed.bold).toBe(false);

    const uniform = getMarksSummaryOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r1', endOffset: 3 });
    expect(uniform.bold).toBe(true);
  });

  it('reports a value mark only when it is the same value across the whole range, else null', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'foo', marks: { color: '#e03131' } },
        { id: 'r2', type: 'text', value: 'bar', marks: { color: '#e03131' } },
      ],
    });

    const uniform = getMarksSummaryOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r2', endOffset: 3 });
    expect(uniform.color).toBe('#e03131');

    store.applyOperation({ type: 'updateRun', id: 'r2', patch: { marks: { color: '#2f9e44' } } });
    const mixed = getMarksSummaryOverSelection(store, 'p1', { startRunId: 'r1', startOffset: 0, endRunId: 'r2', endOffset: 3 });
    expect(mixed.color).toBeNull();
  });
});

describe('getMarksSummaryOverBlockRange: cross-block toolbar indicator', () => {
  it('reports true only when every text run across every touched block has the mark', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'foo', marks: { italic: true } },
        { id: 'r2', type: 'text', value: 'bar', marks: { italic: true } },
      ],
    });

    const summary = getMarksSummaryOverBlockRange(store, {
      blockIds: ['p1', 'p2'],
      startBlockId: 'p1',
      startRunId: 'r1',
      startOffset: 0,
      endBlockId: 'p2',
      endRunId: 'r2',
      endOffset: 3,
    });
    expect(summary.italic).toBe(true);
  });
});
