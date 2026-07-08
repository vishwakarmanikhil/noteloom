import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import {
  resolveAdjacentFocusTarget,
  resolveBlockFirstRun,
  resolveBlockLastRun,
} from '../../src/blocks/shared/navigationCommands.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      {
        id: 'root',
        type: 'page',
        parentId: null,
        contentIds: ['p1', 'p2', 'table1', 'divider1', 'p3'],
        props: {},
      },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      { id: 'table1', type: 'table', parentId: 'root', contentIds: [], props: {} },
      { id: 'divider1', type: 'divider', parentId: 'root', contentIds: [], props: {} },
      { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'first', marks: {} },
      { id: 'r2', type: 'text', value: 'second', marks: {} },
      { id: 'r3', type: 'text', value: 'third', marks: {} },
    ],
  };
}

describe('resolveAdjacentFocusTarget', () => {
  it('resolves the previous sibling\'s last run when moving up', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveAdjacentFocusTarget(store, 'p2', 'up')).toBe('r1');
  });

  it('resolves the next sibling\'s first run when moving down', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveAdjacentFocusTarget(store, 'p1', 'down')).toBe('r2');
  });

  it('returns null when there is no adjacent sibling', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveAdjacentFocusTarget(store, 'p1', 'up')).toBeNull();
  });

  it('skips over a contentless divider to land on the next real leaf', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveAdjacentFocusTarget(store, 'table1', 'down')).toBe('r3'); // table1 -> divider1 -> p3
  });

  it('skips over a pure container (table) with no focusable run of its own', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveAdjacentFocusTarget(store, 'p2', 'down')).toBe('r3'); // p2 -> table1 -> divider1 -> p3
  });

  it('returns null when skipping runs out of siblings entirely', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveAdjacentFocusTarget(store, 'p3', 'down')).toBeNull();
  });
});

describe('resolveAdjacentFocusTarget: entering populated containers (regression)', () => {
  function makeDocWithPopulatedTable() {
    return {
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'table1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'table1', type: 'table', parentId: 'root', contentIds: ['row1'], props: {} },
        { id: 'row1', type: 'tableRow', parentId: 'table1', contentIds: ['cellA', 'cellB'], props: {} },
        { id: 'cellA', type: 'tableCell', parentId: 'row1', contentIds: ['rA'], props: {} },
        { id: 'cellB', type: 'tableCell', parentId: 'row1', contentIds: ['rB'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'before', marks: {} },
        { id: 'rA', type: 'text', value: 'A', marks: {} },
        { id: 'rB', type: 'text', value: 'B', marks: {} },
        { id: 'r2', type: 'text', value: 'after', marks: {} },
      ],
    };
  }

  it('ArrowDown from a paragraph enters a populated table\'s first cell, instead of skipping past it', () => {
    const store = new EditorStore(makeDocWithPopulatedTable());
    expect(resolveAdjacentFocusTarget(store, 'p1', 'down')).toBe('rA');
  });

  it('ArrowUp from a paragraph enters a populated table\'s last cell, instead of skipping past it', () => {
    const store = new EditorStore(makeDocWithPopulatedTable());
    expect(resolveAdjacentFocusTarget(store, 'p2', 'up')).toBe('rB');
  });

  it('still skips a genuinely empty table (0 rows) — only populated containers are entered', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'table1', 'p2'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
        { id: 'table1', type: 'table', parentId: 'root', contentIds: [], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'before', marks: {} },
        { id: 'r2', type: 'text', value: 'after', marks: {} },
      ],
    });
    expect(resolveAdjacentFocusTarget(store, 'p1', 'down')).toBe('r2');
  });
});

describe('resolveBlockFirstRun', () => {
  it('resolves a leaf block\'s own first run directly', () => {
    const store = new EditorStore(makeDoc());
    expect(resolveBlockFirstRun(store, 'p1')).toBe('r1');
  });

  it('descends into a listItem\'s titleRunIds', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { titleRunIds: ['tr1'] } },
      ],
      runs: [{ id: 'tr1', type: 'text', value: 'item', marks: {} }],
    });
    expect(resolveBlockFirstRun(store, 'li1')).toBe('tr1');
  });

  it('descends through a table into its first row, then first cell, to a real run', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['table1'], props: {} },
        { id: 'table1', type: 'table', parentId: 'root', contentIds: ['row1'], props: {} },
        { id: 'row1', type: 'tableRow', parentId: 'table1', contentIds: ['cellA', 'cellB'], props: {} },
        { id: 'cellA', type: 'tableCell', parentId: 'row1', contentIds: ['rA'], props: {} },
        { id: 'cellB', type: 'tableCell', parentId: 'row1', contentIds: ['rB'], props: {} },
      ],
      runs: [
        { id: 'rA', type: 'text', value: 'A', marks: {} },
        { id: 'rB', type: 'text', value: 'B', marks: {} },
      ],
    });
    expect(resolveBlockFirstRun(store, 'table1')).toBe('rA');
  });

  it('descends through a layout into its first column, then its first child block', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['layout1'], props: {} },
        { id: 'layout1', type: 'layout', parentId: 'root', contentIds: ['col1', 'col2'], props: {} },
        { id: 'col1', type: 'layoutColumn', parentId: 'layout1', contentIds: ['p1'], props: {} },
        { id: 'col2', type: 'layoutColumn', parentId: 'layout1', contentIds: [], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'col1', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hi', marks: {} }],
    });
    expect(resolveBlockFirstRun(store, 'layout1')).toBe('r1');
  });

  it('returns null for an empty container with nothing to focus', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['table1'], props: {} },
        { id: 'table1', type: 'table', parentId: 'root', contentIds: [], props: {} },
      ],
      runs: [],
    });
    expect(resolveBlockFirstRun(store, 'table1')).toBeNull();
  });
});

describe('resolveBlockLastRun', () => {
  it('descends through a table into its LAST row, then last cell, to a real run', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['table1'], props: {} },
        { id: 'table1', type: 'table', parentId: 'root', contentIds: ['row1', 'row2'], props: {} },
        { id: 'row1', type: 'tableRow', parentId: 'table1', contentIds: ['cellA'], props: {} },
        { id: 'cellA', type: 'tableCell', parentId: 'row1', contentIds: ['rA'], props: {} },
        { id: 'row2', type: 'tableRow', parentId: 'table1', contentIds: ['cellB'], props: {} },
        { id: 'cellB', type: 'tableCell', parentId: 'row2', contentIds: ['rB'], props: {} },
      ],
      runs: [
        { id: 'rA', type: 'text', value: 'A', marks: {} },
        { id: 'rB', type: 'text', value: 'B', marks: {} },
      ],
    });
    expect(resolveBlockLastRun(store, 'table1')).toBe('rB');
  });

  it('returns null for an empty container', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['table1'], props: {} },
        { id: 'table1', type: 'table', parentId: 'root', contentIds: [], props: {} },
      ],
      runs: [],
    });
    expect(resolveBlockLastRun(store, 'table1')).toBeNull();
  });
});
