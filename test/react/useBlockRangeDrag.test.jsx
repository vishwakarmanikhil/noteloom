import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { useBlockRangeDrag } from '../../src/react/useBlockRangeDrag.js';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

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

// Content rect shared by every row's .be-block-row-content — the "real"
// editable column, e.g. 100..400px. Anything outside that (the gutter/
// packed +/grip buttons at negative x, or the blank page margin beyond
// 400px) is a valid drag-start per useBlockRangeDrag's own doc comment.
const CONTENT_RECT = { left: 100, right: 400, top: 0, bottom: 0, width: 300, height: 40 };
const ROW_Y = { p1: [0, 40], p2: [50, 90], p3: [100, 140] };

function Harness() {
  const containerRef = useRef(null);
  useBlockRangeDrag(containerRef);
  return (
    <div ref={containerRef}>
      <BlockChildren parentId="root" isTopLevel />
    </div>
  );
}

function renderHarness(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const rendered = render(
    <EditorProvider store={store} registry={registry}>
      <Harness />
    </EditorProvider>,
  );

  // Stub layout: every row's own box spans its slice of ROW_Y (full page
  // width, x doesn't matter for the row's own rect); its
  // .be-block-row-content spans CONTENT_RECT's x-range within that y-slice.
  for (const [id, [top, bottom]] of Object.entries(ROW_Y)) {
    const row = rendered.container.querySelector(`[data-block-row-id="${id}"]`);
    row.getBoundingClientRect = () => ({ left: 0, right: 600, top, bottom, width: 600, height: bottom - top });
    const content = row.querySelector('.be-block-row-content');
    content.getBoundingClientRect = () => ({ ...CONTENT_RECT, top, bottom });
  }

  return rendered;
}

function stubElementFromPoint(el) {
  document.elementFromPoint = () => el;
}

afterEach(() => {
  document.elementFromPoint = () => null;
});

describe('useBlockRangeDrag: a plain click selects nothing — only a genuine drag does', () => {
  it('mousedown then mouseup with no movement in between selects nothing', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');

    fireEvent.mouseDown(row2.querySelector('.be-block-gutter'), { clientX: 50, clientY: 60 }); // left of CONTENT_RECT.left (100)
    fireEvent.mouseUp(document, { clientX: 50, clientY: 60 });

    expect(container.querySelectorAll('.be-block-row-range-selected')).toHaveLength(0);
  });

  it('a tiny jitter under the drag threshold still selects nothing', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');

    fireEvent.mouseDown(row2.querySelector('.be-block-gutter'), { clientX: 50, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 51, clientY: 61 }); // well under the 4px threshold
    fireEvent.mouseUp(document, { clientX: 51, clientY: 61 });

    expect(row2.classList.contains('be-block-row-range-selected')).toBe(false);
  });

  it('a genuine drag — movement past the threshold — selects the block it started on, even without leaving its row', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');
    stubElementFromPoint(row2);

    fireEvent.mouseDown(row2.querySelector('.be-block-gutter'), { clientX: 50, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 50, clientY: 75 }); // 15px down, still within p2's own row
    fireEvent.mouseUp(document);

    expect(row2.classList.contains('be-block-row-range-selected')).toBe(true);
    expect(container.querySelector('[data-block-row-id="p1"]').classList.contains('be-block-row-range-selected')).toBe(false);
  });
});

describe('useBlockRangeDrag: starting a drag from a row\'s own margin (packed gutter or empty space right of short content)', () => {
  it('mousedown INSIDE the content rect does not start a drag (normal caret placement/editing is untouched)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');

    fireEvent.mouseDown(row2.querySelector('[data-run-id="r2"]'), { clientX: 200, clientY: 60 }); // inside CONTENT_RECT
    fireEvent.mouseUp(document);

    expect(row2.classList.contains('be-block-row-range-selected')).toBe(false);
  });

  it('clicking the "+" or grip button does not start a drag (their own click behavior is unaffected)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');

    fireEvent.mouseDown(row2.querySelector('[aria-label="Add block below"]'), { clientX: 50, clientY: 60 });
    fireEvent.mouseUp(document);

    expect(row2.classList.contains('be-block-row-range-selected')).toBe(false);
  });
});

describe('useBlockRangeDrag: starting a drag from the blank page margin outside every row\'s own box', () => {
  it('dragging from a container-level element (not inside any row) selects the row under the Y-coordinate', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');
    stubElementFromPoint(row2);

    fireEvent.mouseDown(container, { clientX: 700, clientY: 60 }); // far right margin, y lands in p2's [50,90] slice
    fireEvent.mouseMove(document, { clientX: 700, clientY: 75 });
    fireEvent.mouseUp(document);

    expect(row2.classList.contains('be-block-row-range-selected')).toBe(true);
  });

  it('a plain click (no movement) in the blank margin selects nothing', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    fireEvent.mouseDown(container, { clientX: 700, clientY: 60 });
    fireEvent.mouseUp(document, { clientX: 700, clientY: 60 });

    expect(container.querySelectorAll('.be-block-row-range-selected')).toHaveLength(0);
  });

  it('does nothing if no row\'s Y-range contains the click', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);

    fireEvent.mouseDown(container, { clientX: 700, clientY: 999 });
    fireEvent.mouseMove(document, { clientX: 700, clientY: 1010 });
    fireEvent.mouseUp(document);

    expect(container.querySelectorAll('.be-block-row-range-selected')).toHaveLength(0);
  });
});

describe('useBlockRangeDrag: dragging extends the range', () => {
  it('dragging from one block to another selects every block in between, in document order', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row1 = container.querySelector('[data-block-row-id="p1"]');
    const row3 = container.querySelector('[data-block-row-id="p3"]');

    fireEvent.mouseDown(row1.querySelector('.be-block-gutter'), { clientX: 50, clientY: 10 });
    stubElementFromPoint(row3);
    fireEvent.mouseMove(document, { clientX: 50, clientY: 110 });
    fireEvent.mouseUp(document);

    expect(row1.classList.contains('be-block-row-range-selected')).toBe(true);
    expect(container.querySelector('[data-block-row-id="p2"]').classList.contains('be-block-row-range-selected')).toBe(true);
    expect(row3.classList.contains('be-block-row-range-selected')).toBe(true);
  });

  it('dragging upward from a later block to an earlier one still selects the whole contiguous range', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row1 = container.querySelector('[data-block-row-id="p1"]');
    const row3 = container.querySelector('[data-block-row-id="p3"]');

    fireEvent.mouseDown(row3.querySelector('.be-block-gutter'), { clientX: 50, clientY: 110 });
    stubElementFromPoint(row1);
    fireEvent.mouseMove(document, { clientX: 50, clientY: 10 });
    fireEvent.mouseUp(document);

    expect(row1.classList.contains('be-block-row-range-selected')).toBe(true);
    expect(container.querySelector('[data-block-row-id="p2"]').classList.contains('be-block-row-range-selected')).toBe(true);
    expect(row3.classList.contains('be-block-row-range-selected')).toBe(true);
  });

  it('mousemove before any mousedown does nothing (no drag in progress)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');

    stubElementFromPoint(row2);
    fireEvent.mouseMove(document, { clientX: 50, clientY: 60 });

    expect(row2.classList.contains('be-block-row-range-selected')).toBe(false);
  });
});

describe('useBlockRangeDrag: suppresses native text selection while dragging', () => {
  it('adds be-block-range-dragging to the document root once armed, and removes it on mouseup', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');
    stubElementFromPoint(row2);

    fireEvent.mouseDown(row2.querySelector('.be-block-gutter'), { clientX: 50, clientY: 60 });
    expect(document.documentElement.classList.contains('be-block-range-dragging')).toBe(false); // not yet armed

    fireEvent.mouseMove(document, { clientX: 50, clientY: 75 });
    expect(document.documentElement.classList.contains('be-block-range-dragging')).toBe(true);

    fireEvent.mouseUp(document);
    expect(document.documentElement.classList.contains('be-block-range-dragging')).toBe(false);
  });

  it('clears any existing window selection once the drag arms, and keeps clearing it on further moves', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const row2 = container.querySelector('[data-block-row-id="p2"]');
    stubElementFromPoint(row2);

    const range = document.createRange();
    range.selectNodeContents(row2);
    window.getSelection().addRange(range);
    expect(window.getSelection().rangeCount).toBeGreaterThan(0);

    fireEvent.mouseDown(row2.querySelector('.be-block-gutter'), { clientX: 50, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 50, clientY: 75 });

    expect(window.getSelection().rangeCount).toBe(0);
  });
});

describe('useBlockRangeDrag: disabled on coarse (touch) pointers', () => {
  it('does not start a drag when the primary pointer is coarse', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === '(pointer: coarse)', media: query });

    try {
      const store = new EditorStore(makeDoc());
      const { container } = renderHarness(store);
      const row2 = container.querySelector('[data-block-row-id="p2"]');

      fireEvent.mouseDown(row2.querySelector('.be-block-gutter'), { clientX: 50, clientY: 60 });
      fireEvent.mouseMove(document, { clientX: 50, clientY: 90 }); // well past the drag threshold
      fireEvent.mouseUp(document);

      expect(row2.classList.contains('be-block-row-range-selected')).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
