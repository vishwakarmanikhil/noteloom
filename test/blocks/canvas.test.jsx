import { describe, it, expect, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { insertBlock, updateBlockProps } from '../../src/store/operations.js';
import { createCanvasBlock, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT } from '../../src/blocks/canvas/createCanvasBlock.js';
import { canvasBlockType } from '../../src/blocks/canvas/index.js';

function emptyDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function insertAtRoot(store, factory, index = 0) {
  const { block, runs = [] } = factory('root');
  store.applyOperation(insertBlock(block, 'root', index, { blocks: [block], runs }));
  return block.id;
}

function renderDoc(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

describe('canvas block: registration', () => {
  it('is registered as a leaf (contentless) block type', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    expect(registry.isLeaf('canvas')).toBe(true);
    expect(registry.get('canvas')).toBe(canvasBlockType);
  });

  it('offers a "Canvas" slash command', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const commands = registry.listSlashCommands();
    expect(commands.some((c) => c.label === 'Canvas')).toBe(true);
  });
});

describe('canvas block: static rendering (Phase 1 — no drawing interaction yet)', () => {
  it('renders an empty canvas as a contentless widget (contentEditable=false, tabIndex=-1, no strokes)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);

    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute('contenteditable')).toBe('false');
    expect(wrapper.getAttribute('tabindex')).toBe('-1');
    expect(wrapper.querySelectorAll('.be-canvas-surface path')).toHaveLength(0);
  });

  it('renders the SVG surface sized from props.width/props.height, with a fixed 1000x1000 viewBox regardless of rendered size', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock({ width: 640, height: 400 }));
    const { container } = renderDoc(store);

    const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
    expect(svg.getAttribute('width')).toBe('640');
    expect(svg.getAttribute('height')).toBe('400');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 1000');
  });

  it('renders one <path> per committed stroke in props.strokes, each with a non-empty outline and its own color', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    store.applyOperation(
      updateBlockProps(id, {
        strokes: [
          { id: 's1', points: [[0, 0, 0.5], [500, 500, 0.5], [1000, 0, 0.5]], color: '#ff0000', size: 8 },
          { id: 's2', points: [[100, 900, 0.5]], color: '#00ff00', size: 6 },
        ],
      }),
    );
    const { container } = renderDoc(store);

    const paths = container.querySelectorAll(`[data-block-id="${id}"] svg.be-canvas-surface path`);
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute('fill')).toBe('#ff0000');
    expect(paths[0].getAttribute('d')).toMatch(/^M/);
    expect(paths[1].getAttribute('fill')).toBe('#00ff00');
    expect(paths[1].getAttribute('d')).toMatch(/^M/);
  });

  it('re-renders correctly after an external store change (undo/redo-style), reflecting whatever props.strokes currently holds', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);

    act(() => {
      store.applyOperation(
        updateBlockProps(id, { strokes: [{ id: 's1', points: [[0, 0, 0.5], [1000, 1000, 0.5]], color: '#000', size: 8 }] }),
      );
    });
    expect(container.querySelectorAll(`[data-block-id="${id}"] .be-canvas-surface path`)).toHaveLength(1);

    // simulate "undo" by writing back to empty
    act(() => {
      store.applyOperation(updateBlockProps(id, { strokes: [] }));
    });
    expect(container.querySelectorAll(`[data-block-id="${id}"] .be-canvas-surface path`)).toHaveLength(0);
  });
});

describe('canvas block: static shape rendering (shapes phase — no drawing interaction yet)', () => {
  it('renders a rectangle shape as an unfilled <rect>', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(
        updateBlockProps(id, {
          shapes: [{ id: 'r1', type: 'rectangle', x: 100, y: 150, width: 200, height: 100, color: '#e03131', strokeWidth: 4 }],
        }),
      );
    });
    const { container } = renderDoc(store);

    // excludes the snap-to-grid visual overlay's own <rect> (on by
    // default — see the "canvas block: snapping (grid)" describe block),
    // which is not the shape this test cares about
    const rect = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface rect:not(.be-canvas-grid-background)`);
    expect(rect).not.toBeNull();
    expect(rect.getAttribute('x')).toBe('100');
    expect(rect.getAttribute('y')).toBe('150');
    expect(rect.getAttribute('width')).toBe('200');
    expect(rect.getAttribute('height')).toBe('100');
    expect(rect.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('stroke')).toBe('#e03131');
    expect(rect.getAttribute('stroke-width')).toBe('4');
  });

  it('renders an ellipse shape inscribed in its bounding box', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(
        updateBlockProps(id, {
          shapes: [{ id: 'e1', type: 'ellipse', x: 100, y: 100, width: 200, height: 100, color: '#1971c2', strokeWidth: 4 }],
        }),
      );
    });
    const { container } = renderDoc(store);

    const ellipse = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface ellipse`);
    expect(ellipse).not.toBeNull();
    expect(ellipse.getAttribute('cx')).toBe('200');
    expect(ellipse.getAttribute('cy')).toBe('150');
    expect(ellipse.getAttribute('rx')).toBe('100');
    expect(ellipse.getAttribute('ry')).toBe('50');
    expect(ellipse.getAttribute('fill')).toBe('none');
  });

  it('renders an arrow shape as a line plus an arrowhead polygon', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(
        updateBlockProps(id, {
          shapes: [{ id: 'a1', type: 'arrow', x1: 100, y1: 100, x2: 400, y2: 100, color: '#2f9e44', strokeWidth: 4 }],
        }),
      );
    });
    const { container } = renderDoc(store);

    const line = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface line`);
    expect(line).not.toBeNull();
    expect(line.getAttribute('x1')).toBe('100');
    expect(line.getAttribute('x2')).toBe('400');
    const polygon = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface polygon`);
    expect(polygon).not.toBeNull();
    expect(polygon.getAttribute('points')).toContain('400,100'); // the tip sits exactly at the end point
  });

  it('strokes and shapes coexist in the same canvas without interfering with each other', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(
        updateBlockProps(id, {
          strokes: [{ id: 's1', points: [[0, 0, 0.5], [100, 100, 0.5]], color: '#000', size: 8 }],
          shapes: [{ id: 'r1', type: 'rectangle', x: 500, y: 500, width: 100, height: 100, color: '#000', strokeWidth: 4 }],
        }),
      );
    });
    const { container } = renderDoc(store);

    const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    // excludes the snap-to-grid visual overlay's own <rect>, on by default
    expect(svg.querySelectorAll('rect:not(.be-canvas-grid-background)')).toHaveLength(1);
  });
});

describe('canvas block: drawing shape tools (rectangle/ellipse/arrow)', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  const SHAPE_TOOL_LABELS = new Set(['Rectangle', 'Ellipse', 'Arrow', 'Diamond', 'Triangle', 'Star']);

  function setup(store, toolLabel) {
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    if (SHAPE_TOOL_LABELS.has(toolLabel)) {
      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click(); // open the shape popover first
      });
    }
    act(() => {
      wrapper.querySelector(`[aria-label="${toolLabel}"]`).click();
    });
    return { wrapper, svg };
  }

  it('drawing a rectangle commits exactly one op per gesture, with a normalized (non-negative) box', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { svg } = setup(store, 'Rectangle');

      // local (0..1000) -> client (400x400 square rect): local = client*2.5
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 160, clientY: 160 }); // local (400,400)
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0);

      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 80, clientY: 80 }); // local (200,200) — dragged up-left
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0); // still no store write mid-drag

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 80 });
      });
      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(1);
      expect(shapes[0].type).toBe('rectangle');
      expect(shapes[0].x).toBeCloseTo(200);
      expect(shapes[0].y).toBeCloseTo(200);
      expect(shapes[0].width).toBeCloseTo(200);
      expect(shapes[0].height).toBeCloseTo(200);
    });
  });

  it('drawing an ellipse commits exactly one op per gesture', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { svg } = setup(store, 'Ellipse');

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointermove', { clientX: 120, clientY: 120 });
        firePointerEvent(svg, 'pointerup', { clientX: 120, clientY: 120 });
      });

      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(1);
      expect(shapes[0].type).toBe('ellipse');
      expect(shapes[0].width).toBeGreaterThan(0);
      expect(shapes[0].height).toBeGreaterThan(0);
    });
  });

  it('drawing an arrow commits exactly one op per gesture, with the correct endpoints', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { svg } = setup(store, 'Arrow');

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 }); // local (100,100)
        firePointerEvent(svg, 'pointermove', { clientX: 160, clientY: 40 }); // local (400,100)
        firePointerEvent(svg, 'pointerup', { clientX: 160, clientY: 40 });
      });

      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(1);
      expect(shapes[0].type).toBe('arrow');
      expect(shapes[0].x1).toBeCloseTo(100);
      expect(shapes[0].y1).toBeCloseTo(100);
      expect(shapes[0].x2).toBeCloseTo(400);
      expect(shapes[0].y2).toBeCloseTo(100);
    });
  });

  it('a click without dragging draws no shape at all (unlike the pen tool\'s tap-draws-a-dot behavior)', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { svg } = setup(store, 'Rectangle');

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 100, clientY: 100 });
        firePointerEvent(svg, 'pointerup', { clientX: 100, clientY: 100 });
      });

      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('pointercancel discards the in-progress shape draft instead of committing it', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { svg } = setup(store, 'Rectangle');

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointermove', { clientX: 120, clientY: 120 });
        firePointerEvent(svg, 'pointercancel', { clientX: 120, clientY: 120 });
      });

      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('the drawn shape uses the currently selected color and stroke size', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { wrapper, svg } = setup(store, 'Rectangle');

      act(() => {
        wrapper.querySelector('[aria-label^="Color:"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Color #e03131"]').click();
      });

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointermove', { clientX: 120, clientY: 120 });
        firePointerEvent(svg, 'pointerup', { clientX: 120, clientY: 120 });
      });

      expect(store.getBlock(id).props.shapes[0].color).toBe('#e03131');
    });
  });
});

describe('canvas block: more shapes — diamond, triangle, star', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  const SHAPE_TOOL_LABELS = new Set(['Rectangle', 'Ellipse', 'Arrow', 'Diamond', 'Triangle', 'Star']);

  function setup(store, toolLabel) {
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    if (SHAPE_TOOL_LABELS.has(toolLabel)) {
      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click(); // open the shape popover first
      });
    }
    act(() => {
      wrapper.querySelector(`[aria-label="${toolLabel}"]`).click();
    });
    return { wrapper, svg };
  }

  it.each([
    ['Diamond', 'diamond'],
    ['Triangle', 'triangle'],
    ['Star', 'star'],
  ])('drawing a %s commits exactly one op per gesture, with the correct bounding box', (toolLabel, type) => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { svg } = setup(store, toolLabel);

      // local (0..1000) -> client (400x400 square rect): local = client*2.5
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 }); // local (100,100)
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0);

      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 120, clientY: 120 }); // local (300,300)
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0); // still no store write mid-drag

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 120, clientY: 120 });
      });
      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(1);
      expect(shapes[0].type).toBe(type);
      expect(shapes[0].x).toBeCloseTo(100);
      expect(shapes[0].y).toBeCloseTo(100);
      expect(shapes[0].width).toBeCloseTo(200);
      expect(shapes[0].height).toBeCloseTo(200);
    });
  });

  it('the select tool distinguishes "inside the diamond" from "inside its bounding box but outside the diamond" — the whole point of the precise hit-test', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'd1', type: 'diamond', x: 100, y: 100, width: 200, height: 200, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { wrapper, svg } = (() => {
        const { container } = renderDoc(store);
        const w = container.querySelector('[data-tool]');
        return { wrapper: w, svg: w.querySelector('svg.be-canvas-surface') };
      })();
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
      });

      // local (110,110): well inside the bbox, but in the diamond's top-left
      // "corner" dead zone (the diamond's nearest edge there runs from
      // (200,100) to (100,200)) — must NOT select it.
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 44, clientY: 44 });
        firePointerEvent(svg, 'pointerup', { clientX: 44, clientY: 44 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).toBeNull();

      // local (200,200): the diamond's own center — must select it.
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 80 });
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 80 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull();
    });
  });

  it('move, resize, and delete all work for a diamond via the same shared code path as rectangle/ellipse', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'd1', type: 'diamond', x: 100, y: 100, width: 200, height: 200, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector('[data-tool]');
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
      });

      // select via the diamond's own center (200,200) -> client (80,80), then move it
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 80 });
        firePointerEvent(svg, 'pointermove', { clientX: 100, clientY: 100 }); // +50,+50 local
        firePointerEvent(svg, 'pointerup', { clientX: 100, clientY: 100 });
      });
      let shape = store.getBlock(id).props.shapes[0];
      expect(shape.x).toBeCloseTo(150);
      expect(shape.y).toBeCloseTo(150);

      // resize via the (now-moved) se corner handle at local (350+... wait use current box: x150,y150,w200,h200 -> se at (350,350) -> client (140,140)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 140, clientY: 140 });
        firePointerEvent(svg, 'pointermove', { clientX: 160, clientY: 160 }); // local (400,400): +50,+50
        firePointerEvent(svg, 'pointerup', { clientX: 160, clientY: 160 });
      });
      shape = store.getBlock(id).props.shapes[0];
      expect(shape.width).toBeCloseTo(250);
      expect(shape.height).toBeCloseTo(250);

      // delete via keyboard (still selected)
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Delete' });
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('toHTML bakes a <polygon> for each new shape type', () => {
    const block = {
      props: {
        strokes: [],
        shapes: [
          { id: 'd1', type: 'diamond', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 4 },
          { id: 't1', type: 'triangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 4 },
          { id: 's1', type: 'star', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 4 },
        ],
        width: 480,
        height: 320,
      },
    };
    const html = canvasBlockType.toHTML(block);
    expect(html.match(/<polygon/g)).toHaveLength(3);
    expect(html).toContain('fill="none"');
  });

  it('every new toolbar tool button is reachable and reflects the active tool', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    for (const label of ['Diamond', 'Triangle', 'Star']) {
      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click(); // open the shape popover
      });
      act(() => {
        wrapper.querySelector(`[aria-label="${label}"]`).click();
      });
      expect(wrapper.getAttribute('data-tool')).toBe(label.toLowerCase());
    }
  });

  it('the shape popover only appears once opened, and picking a shape closes it', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    expect(wrapper.querySelector('.be-canvas-shape-picker')).toBeNull();
    for (const label of ['Rectangle', 'Ellipse', 'Arrow', 'Diamond', 'Triangle', 'Star']) {
      expect(wrapper.querySelector(`[aria-label="${label}"]`)).toBeNull();
    }

    act(() => {
      wrapper.querySelector('[aria-label="Shape"]').click();
    });
    expect(wrapper.querySelector('.be-canvas-shape-picker')).not.toBeNull();
    for (const label of ['Rectangle', 'Ellipse', 'Arrow', 'Diamond', 'Triangle', 'Star']) {
      expect(wrapper.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }

    act(() => {
      wrapper.querySelector('[aria-label="Ellipse"]').click();
    });
    expect(wrapper.querySelector('.be-canvas-shape-picker')).toBeNull();
    expect(wrapper.getAttribute('data-tool')).toBe('ellipse');
    expect(wrapper.querySelector('[aria-label="Shape"]').getAttribute('aria-label')).toBe('Shape'); // trigger still present
  });

  it('Pen, Eraser, and Select remain individual always-visible buttons, not folded into the shape popover', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    expect(wrapper.querySelector('[aria-label="Pen"]')).not.toBeNull();
    expect(wrapper.querySelector('[aria-label="Eraser"]')).not.toBeNull();
    expect(wrapper.querySelector('[aria-label="Select"]')).not.toBeNull();
  });
});

describe('canvas block: select tool — hit-testing, selection overlay, move', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  function setupWithShapes(shapes) {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(updateBlockProps(id, { shapes }));
    });
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    act(() => {
      wrapper.querySelector('[aria-label="Select"]').click();
    });
    return { store, id, wrapper, svg };
  }

  it('clicking inside a shape selects it (shows the dashed selection overlay); clicking empty space deselects', () => {
    withMockedRect(() => {
      const { wrapper, svg } = setupWithShapes([
        { id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4 },
      ]);

      // local (150,150) -> client (60,60) at scale 0.4
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull();

      // local (900,900) -> client (360,360), far outside the rectangle
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 360, clientY: 360 });
        firePointerEvent(svg, 'pointerup', { clientX: 360, clientY: 360 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).toBeNull();
    });
  });

  it('picks the topmost (last-drawn) shape when two overlap', () => {
    withMockedRect(() => {
      const { id, svg } = setupWithShapes([
        { id: 'bottom', type: 'rectangle', x: 100, y: 100, width: 200, height: 200, color: '#000', strokeWidth: 4 },
        { id: 'top', type: 'rectangle', x: 150, y: 150, width: 100, height: 100, color: '#000', strokeWidth: 4 },
      ]);

      // local (200,200) -> client (80,80): inside both, but "top" was drawn last
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 80 });
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 80 });
      });

      // no store mutation from selecting — just confirm which one is selected via the overlay's box
      const box = document.querySelector(`[data-block-id="${id}"] .be-canvas-selection-box`);
      expect(box.getAttribute('x')).toBe(String(150 - 6));
    });
  });

  it('dragging a selected shape\'s body moves it, committing exactly once on release with zero writes mid-drag', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapes([
        { id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4 },
      ]);

      // local (150,150) -> client (60,60)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
      });
      expect(store.getBlock(id).props.shapes[0].x).toBe(100); // no write yet — this pointerdown only selected + started the drag

      // drag to local (200,180) -> client (80,72): dx=50, dy=30
      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 80, clientY: 72 });
      });
      expect(store.getBlock(id).props.shapes[0].x).toBe(100); // still no write mid-drag

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 72 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.x).toBeCloseTo(150);
      expect(shape.y).toBeCloseTo(130);
      expect(shape.width).toBe(200); // size is untouched by a move
      expect(shape.height).toBe(100);
    });
  });

  it('moving an arrow translates both endpoints by the same offset', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapes([
        { id: 'a1', type: 'arrow', x1: 100, y1: 100, x2: 300, y2: 100, color: '#000', strokeWidth: 4 },
      ]);

      // local (200,100) -> client (80,40): on the segment
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 40 });
        firePointerEvent(svg, 'pointermove', { clientX: 80, clientY: 60 }); // local dy = +50
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 60 });
      });

      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.y1).toBeCloseTo(150);
      expect(shape.y2).toBeCloseTo(150);
      expect(shape.x1).toBeCloseTo(100); // x unaffected — the drag was purely vertical
      expect(shape.x2).toBeCloseTo(300);
    });
  });

  it('a click-without-drag on an already-selected shape re-selects it but writes nothing to the store', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapes([
        { id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4 },
      ]);

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });

      expect(store.getBlock(id).props.shapes[0].x).toBe(100);
      expect(store.getBlock(id).props.shapes[0].y).toBe(100);
    });
  });
});

describe('canvas block: multi-select (marquee, shift-click, group move/delete)', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  function setupWithShapesAndStrokes(shapes, strokes) {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(updateBlockProps(id, { shapes, strokes }));
    });
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    act(() => {
      wrapper.querySelector('[aria-label="Select"]').click();
    });
    return { store, id, wrapper, svg };
  }

  // Scale is 0.4 (mockRect is 400x400 for a 1000x1000 local space) throughout.
  const SHAPE_A = { id: 'r1', type: 'rectangle', x: 100, y: 100, width: 100, height: 100, color: '#000', strokeWidth: 4 };
  const SHAPE_B = { id: 'r2', type: 'rectangle', x: 300, y: 100, width: 100, height: 100, color: '#000', strokeWidth: 4 };
  const STROKE_A = { id: 's1', points: [[700, 700, 0.5]], color: '#000', size: 8 };

  function marqueeSelectBoth(svg) {
    // local (50,50) -> (450,250): empty space to a rect covering both SHAPE_A and SHAPE_B
    firePointerEvent(svg, 'pointerdown', { clientX: 20, clientY: 20 });
    firePointerEvent(svg, 'pointermove', { clientX: 180, clientY: 100 });
    firePointerEvent(svg, 'pointerup', { clientX: 180, clientY: 100 });
  }

  it('marquee-drag over two shapes selects both, with no resize handles for a multi-selection', () => {
    withMockedRect(() => {
      const { wrapper, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], []);
      act(() => marqueeSelectBoth(svg));
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(2);
      expect(wrapper.querySelector('.be-canvas-selection-handle')).toBeNull();
    });
  });

  it('Shift+click toggles a third item in/out of the selection without starting a move or writing to the store', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], [STROKE_A]);
      act(() => marqueeSelectBoth(svg));
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(2);

      // local (700,700) -> client (280,280): the stroke
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 280, clientY: 280, shiftKey: true });
        firePointerEvent(svg, 'pointerup', { clientX: 280, clientY: 280, shiftKey: true });
      });
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(3);
      expect(store.getBlock(id).props.shapes[0].x).toBe(100);
      expect(store.getBlock(id).props.strokes[0].points[0][0]).toBe(700);

      // shift+click again removes it
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 280, clientY: 280, shiftKey: true });
        firePointerEvent(svg, 'pointerup', { clientX: 280, clientY: 280, shiftKey: true });
      });
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(2);
    });
  });

  it('dragging a multi-selection moves every selected item (strokes and shapes alike) by the same delta, committing exactly once with zero writes mid-drag', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], [STROKE_A]);
      act(() => marqueeSelectBoth(svg));
      // shift+click the stroke too, so the selection spans both kinds — local (700,700) -> client (280,280)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 280, clientY: 280, shiftKey: true });
        firePointerEvent(svg, 'pointerup', { clientX: 280, clientY: 280, shiftKey: true });
      });

      const applySpy = vi.spyOn(store, 'applyOperation');

      // click-drag starting on SHAPE_A's body (already selected) moves the whole selection
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 }); // local (150,150): inside SHAPE_A
      });
      expect(applySpy).not.toHaveBeenCalled();

      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 80, clientY: 80 }); // local (200,200): dx=50, dy=50
      });
      expect(applySpy).not.toHaveBeenCalled();
      expect(store.getBlock(id).props.shapes[0].x).toBe(100); // still no write mid-drag

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 80 });
      });
      expect(applySpy).toHaveBeenCalledTimes(1);

      const block = store.getBlock(id);
      expect(block.props.shapes.find((s) => s.id === 'r1').x).toBeCloseTo(150);
      expect(block.props.shapes.find((s) => s.id === 'r2').x).toBeCloseTo(350);
      expect(block.props.strokes[0].points[0][0]).toBeCloseTo(750); // the stroke moved by the same delta too
    });
  });

  it('Delete with a mixed stroke+shape selection removes all of them in one op', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], [STROKE_A]);
      // marquee-select everything: local (50,50) -> (900,900)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 20, clientY: 20 });
        firePointerEvent(svg, 'pointermove', { clientX: 360, clientY: 360 });
        firePointerEvent(svg, 'pointerup', { clientX: 360, clientY: 360 });
      });
      expect(store.getBlock(id).props.shapes.length + store.getBlock(id).props.strokes.length).toBe(3);

      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Delete' });
      });

      const after = store.getBlock(id);
      expect(after.props.shapes).toHaveLength(0);
      expect(after.props.strokes).toHaveLength(0);
    });
  });

  it('Ctrl+C then Ctrl+V pastes an offset copy of the mixed selection in one op, and selects the new copies', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], [STROKE_A]);
      act(() => marqueeSelectBoth(svg));
      // shift+click the stroke in too, so the copy spans both kinds
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 280, clientY: 280, shiftKey: true });
        firePointerEvent(svg, 'pointerup', { clientX: 280, clientY: 280, shiftKey: true });
      });

      const applySpy = vi.spyOn(store, 'applyOperation');
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'c', ctrlKey: true });
      });
      expect(applySpy).not.toHaveBeenCalled(); // copy never touches the store
      expect(store.getBlock(id).props.shapes).toHaveLength(2);
      expect(store.getBlock(id).props.strokes).toHaveLength(1);

      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'v', ctrlKey: true });
      });
      expect(applySpy).toHaveBeenCalledTimes(1); // one op for the whole paste, both arrays together

      const after = store.getBlock(id);
      expect(after.props.shapes).toHaveLength(4);
      expect(after.props.strokes).toHaveLength(2);
      // the 2 originals are untouched
      expect(after.props.shapes.find((s) => s.id === 'r1').x).toBe(100);
      expect(after.props.shapes.find((s) => s.id === 'r2').x).toBe(300);
      expect(after.props.strokes.find((s) => s.id === 's1').points[0][0]).toBe(700);
      // the 3 new copies are offset from their sources and selected
      const newShapes = after.props.shapes.filter((s) => s.id !== 'r1' && s.id !== 'r2');
      const newStroke = after.props.strokes.find((s) => s.id !== 's1');
      expect(newShapes).toHaveLength(2);
      expect(newShapes.some((s) => s.x === 100 + 24)).toBe(true);
      expect(newShapes.some((s) => s.x === 300 + 24)).toBe(true);
      expect(newStroke.points[0][0]).toBe(700 + 24);
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(3); // pasted copies, not the originals
    });
  });

  it('pasting twice offsets each paste from the ORIGINAL, not cumulatively from the previous paste', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A], []);
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 }); // local (150,150): inside SHAPE_A
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'c', ctrlKey: true });
      });
      // each paste is its own act() so the component re-renders (and its
      // `block` prop refreshes from the store) between them, matching how
      // two separate real keydown events would actually be processed
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'v', ctrlKey: true });
      });
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'v', ctrlKey: true });
      });
      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(3); // original + 2 pastes
      const xs = shapes.map((s) => s.x).sort((a, b) => a - b);
      expect(xs).toEqual([100, 124, 124]); // both pastes land at the same +24 offset from the original
    });
  });

  it('Ctrl+V with nothing copied does nothing', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A], []);
      const applySpy = vi.spyOn(store, 'applyOperation');
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'v', ctrlKey: true });
      });
      expect(applySpy).not.toHaveBeenCalled();
      expect(store.getBlock(id).props.shapes).toHaveLength(1);
    });
  });

  it('Ctrl+D duplicates the selection directly, in one op, without needing a prior copy', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setupWithShapesAndStrokes([SHAPE_A], []);
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });

      const applySpy = vi.spyOn(store, 'applyOperation');
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'd', ctrlKey: true });
      });
      expect(applySpy).toHaveBeenCalledTimes(1);

      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(2);
      expect(shapes.find((s) => s.id === 'r1').x).toBe(100); // original untouched
      const duplicate = shapes.find((s) => s.id !== 'r1');
      expect(duplicate.x).toBe(124);
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(1); // the duplicate is now selected, not the original
    });
  });

  it('Bring to front / Send to back reorder the selection within its own array, disabled when nothing is selected', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], []);

      expect(wrapper.querySelector('[aria-label="Bring to front"]').disabled).toBe(true);
      expect(wrapper.querySelector('[aria-label="Send to back"]').disabled).toBe(true);

      // select SHAPE_A (currently first/back-most in the array) and bring it to front
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 }); // local (150,150): inside SHAPE_A
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      expect(wrapper.querySelector('[aria-label="Bring to front"]').disabled).toBe(false);

      act(() => {
        wrapper.querySelector('[aria-label="Bring to front"]').click();
      });
      expect(store.getBlock(id).props.shapes.map((s) => s.id)).toEqual(['r2', 'r1']);

      act(() => {
        wrapper.querySelector('[aria-label="Send to back"]').click();
      });
      expect(store.getBlock(id).props.shapes.map((s) => s.id)).toEqual(['r1', 'r2']); // back to the original order
    });
  });

  it('Ctrl+Shift+] / Ctrl+Shift+[ are keyboard equivalents of Bring to front / Send to back', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], []);
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });

      act(() => {
        firePointerEvent(svg, 'keydown', { key: ']', ctrlKey: true, shiftKey: true });
      });
      expect(store.getBlock(id).props.shapes.map((s) => s.id)).toEqual(['r2', 'r1']);

      act(() => {
        firePointerEvent(svg, 'keydown', { key: '[', ctrlKey: true, shiftKey: true });
      });
      expect(store.getBlock(id).props.shapes.map((s) => s.id)).toEqual(['r1', 'r2']);
    });
  });

  it('reordering a mixed stroke+shape selection touches both arrays in one op, preserving order among untouched items', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], [STROKE_A]);
      // select only SHAPE_A and the stroke (SHAPE_B stays unselected)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 }); // SHAPE_A
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 280, clientY: 280, shiftKey: true }); // + the stroke
        firePointerEvent(svg, 'pointerup', { clientX: 280, clientY: 280, shiftKey: true });
      });

      const applySpy = vi.spyOn(store, 'applyOperation');
      const wrapper = svg.closest('[data-block-id]');
      act(() => {
        wrapper.querySelector('[aria-label="Bring to front"]').click();
      });
      expect(applySpy).toHaveBeenCalledTimes(1); // one op spanning both arrays

      const after = store.getBlock(id);
      expect(after.props.shapes.map((s) => s.id)).toEqual(['r2', 'r1']); // r1 moved after the untouched r2
      expect(after.props.strokes.map((s) => s.id)).toEqual(['s1']); // the only stroke — trivially "moved to front" of its own array
    });
  });

  it('arrow keys nudge the selection by 1 unit, and Shift+arrow by 10 units, in both strokes and shapes', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], [STROKE_A]);
      act(() => marqueeSelectBoth(svg));
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 280, clientY: 280, shiftKey: true }); // + the stroke
        firePointerEvent(svg, 'pointerup', { clientX: 280, clientY: 280, shiftKey: true });
      });

      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'ArrowRight' });
      });
      let block = store.getBlock(id);
      expect(block.props.shapes.find((s) => s.id === 'r1').x).toBe(101);
      expect(block.props.shapes.find((s) => s.id === 'r2').x).toBe(301);
      expect(block.props.strokes[0].points[0][0]).toBe(701);

      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'ArrowDown', shiftKey: true });
      });
      block = store.getBlock(id);
      expect(block.props.shapes.find((s) => s.id === 'r1').y).toBe(110);
      expect(block.props.strokes[0].points[0][1]).toBe(710);
    });
  });

  it('arrow keys do nothing (no store write) when nothing is selected', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupWithShapesAndStrokes([SHAPE_A], []);
      const applySpy = vi.spyOn(store, 'applyOperation');
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'ArrowRight' });
      });
      expect(applySpy).not.toHaveBeenCalled();
      expect(store.getBlock(id).props.shapes[0].x).toBe(100);
    });
  });

  it('resize handles are absent for a 2+ selection and reappear once the selection narrows to exactly 1 shape', () => {
    withMockedRect(() => {
      const { wrapper, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], []);
      act(() => marqueeSelectBoth(svg));
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(2);
      expect(wrapper.querySelector('.be-canvas-selection-handle')).toBeNull();

      // clear the selection first (empty space) — a plain click on an
      // ALREADY-selected item would instead start a group move of the whole
      // selection, not collapse it (see the multi-select data-model doc
      // comment), so this test needs a not-yet-selected click to exercise
      // "click a lone item collapses selection to just it."
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 380, clientY: 20 });
        firePointerEvent(svg, 'pointerup', { clientX: 380, clientY: 20 });
      });
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(0);

      // plain click (no shift) on SHAPE_A alone selects just it
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 }); // local (150,150): inside SHAPE_A
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(1);
      expect(wrapper.querySelectorAll('.be-canvas-selection-handle').length).toBeGreaterThan(0);
    });
  });

  it('a marquee that ends up empty (near-zero drag on empty space) clears the selection', () => {
    withMockedRect(() => {
      const { wrapper, svg } = setupWithShapesAndStrokes([SHAPE_A, SHAPE_B], []);
      act(() => marqueeSelectBoth(svg));
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(2);

      // a plain click on empty space, far from both shapes
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 380, clientY: 20 });
        firePointerEvent(svg, 'pointerup', { clientX: 380, clientY: 20 });
      });
      expect(wrapper.querySelectorAll('.be-canvas-selection-box').length).toBe(0);
    });
  });
});

describe('canvas block: shape resize (rect/ellipse corner) + arrow endpoint-drag', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  function setupSelected(shape) {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(updateBlockProps(id, { shapes: [shape] }));
    });
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    act(() => {
      wrapper.querySelector('[aria-label="Select"]').click();
    });
    // select it: click the shape's body once first
    const bodyLocal = shape.type === 'arrow' ? [(shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2] : [shape.x + 5, shape.y + 5];
    act(() => {
      firePointerEvent(svg, 'pointerdown', { clientX: bodyLocal[0] * 0.4, clientY: bodyLocal[1] * 0.4 });
      firePointerEvent(svg, 'pointerup', { clientX: bodyLocal[0] * 0.4, clientY: bodyLocal[1] * 0.4 });
    });
    return { store, id, wrapper, svg };
  }

  it('dragging the bottom-right corner handle resizes a rectangle, committing exactly once on release', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        color: '#000',
        strokeWidth: 4,
      });

      // se corner is at local (300,200) -> client (120,80)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 120, clientY: 80 });
      });
      expect(store.getBlock(id).props.shapes[0].width).toBe(200); // no write yet

      // drag to local (400,300) -> client (160,120)
      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 160, clientY: 120 });
      });
      expect(store.getBlock(id).props.shapes[0].width).toBe(200); // still no write mid-drag

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 160, clientY: 120 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.x).toBeCloseTo(100); // fixed (opposite/top-left) corner unchanged
      expect(shape.y).toBeCloseTo(100);
      expect(shape.width).toBeCloseTo(300);
      expect(shape.height).toBeCloseTo(200);
    });
  });

  it('dragging a corner past the opposite corner still produces a valid normalized (non-negative) box', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        color: '#000',
        strokeWidth: 4,
      });

      // se corner (300,200) -> client (120,80), dragged past the fixed nw corner (100,100) -> client (40,40) to (0,0) local
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 120, clientY: 80 });
        firePointerEvent(svg, 'pointermove', { clientX: 0, clientY: 0 });
        firePointerEvent(svg, 'pointerup', { clientX: 0, clientY: 0 });
      });

      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.width).toBeGreaterThanOrEqual(0);
      expect(shape.height).toBeGreaterThanOrEqual(0);
      expect(shape.x).toBeCloseTo(0);
      expect(shape.y).toBeCloseTo(0);
    });
  });

  it('dragging an arrow\'s end-point handle moves only that endpoint, committing exactly once on release', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupSelected({
        id: 'a1',
        type: 'arrow',
        x1: 100,
        y1: 100,
        x2: 300,
        y2: 100,
        color: '#000',
        strokeWidth: 4,
      });

      // end handle at local (300,100) -> client (120,40)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 120, clientY: 40 });
      });
      expect(store.getBlock(id).props.shapes[0].x2).toBe(300); // no write yet

      // drag to local (300,300) -> client (120,120)
      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 120, clientY: 120 });
      });
      expect(store.getBlock(id).props.shapes[0].x2).toBe(300); // still no write mid-drag

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 120, clientY: 120 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.x1).toBeCloseTo(100); // start point untouched
      expect(shape.y1).toBeCloseTo(100);
      expect(shape.x2).toBeCloseTo(300);
      expect(shape.y2).toBeCloseTo(300);
    });
  });

  it('grabbing a handle takes priority over re-selecting/moving the shape body', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        color: '#000',
        strokeWidth: 4,
      });

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 120, clientY: 80 }); // se corner handle
        firePointerEvent(svg, 'pointermove', { clientX: 160, clientY: 120 });
        firePointerEvent(svg, 'pointerup', { clientX: 160, clientY: 120 });
      });

      const shape = store.getBlock(id).props.shapes[0];
      // if this had been treated as a body-drag (move) instead of a resize,
      // x/y would ALSO have shifted — confirming it stayed a resize, not a move
      expect(shape.x).toBeCloseTo(100);
      expect(shape.y).toBeCloseTo(100);
      expect(shape.width).toBeCloseTo(300);
    });
  });
});

describe('canvas block: rotation (rect/ellipse/diamond/triangle/star, single-selection)', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  function setupSelected(shape) {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(updateBlockProps(id, { shapes: [shape] }));
    });
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    act(() => {
      wrapper.querySelector('[aria-label="Select"]').click();
    });
    const bodyLocal = shape.type === 'arrow' ? [(shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2] : [shape.x + 5, shape.y + 5];
    act(() => {
      firePointerEvent(svg, 'pointerdown', { clientX: bodyLocal[0] * 0.4, clientY: bodyLocal[1] * 0.4 });
      firePointerEvent(svg, 'pointerup', { clientX: bodyLocal[0] * 0.4, clientY: bodyLocal[1] * 0.4 });
    });
    return { store, id, wrapper, svg };
  }

  it('dragging the rotate handle sets the shape rotation, committing exactly once on release with zero writes mid-drag', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 400,
        y: 400,
        width: 200,
        height: 200,
        color: '#000',
        strokeWidth: 4,
      });

      // rotate handle: unrotated local (500, 368) -> client (200, 147.2)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 200, clientY: 147.2 });
      });
      expect(store.getBlock(id).props.shapes[0].rotation ?? 0).toBe(0); // no write yet

      // drag to due-east of the shape's center (500,500) -> local (600,500) -> client (240,200)
      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 240, clientY: 200 });
      });
      expect(store.getBlock(id).props.shapes[0].rotation ?? 0).toBe(0); // still no write mid-drag

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 240, clientY: 200 });
      });
      expect(store.getBlock(id).props.shapes[0].rotation).toBeCloseTo(90);
    });
  });

  it('starting a new rotate drag on an already-rotated shape continues from its current rotation rather than snapping', () => {
    withMockedRect(() => {
      const { store, id, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 400,
        y: 400,
        width: 200,
        height: 200,
        color: '#000',
        strokeWidth: 4,
        rotation: 90,
      });

      // rotate handle is now at the ROTATED position: rotatePoint(500,368,500,500,90) -> (632,500) -> client (252.8,200)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 252.8, clientY: 200 });
        // drag to due-south of center (500,500) -> local (500,600) -> client (200,240): another 90° clockwise turn
        firePointerEvent(svg, 'pointermove', { clientX: 200, clientY: 240 });
        firePointerEvent(svg, 'pointerup', { clientX: 200, clientY: 240 });
      });
      expect(store.getBlock(id).props.shapes[0].rotation).toBeCloseTo(180);
    });
  });

  it('corner resize handles are hidden once a shape has any rotation; the rotate handle remains', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 400,
        y: 400,
        width: 200,
        height: 200,
        color: '#000',
        strokeWidth: 4,
      });
      expect(wrapper.querySelectorAll('.be-canvas-selection-handle').length).toBe(4);
      expect(wrapper.querySelector('.be-canvas-rotate-handle')).not.toBeNull();

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 200, clientY: 147.2 });
        firePointerEvent(svg, 'pointermove', { clientX: 240, clientY: 200 });
        firePointerEvent(svg, 'pointerup', { clientX: 240, clientY: 200 });
      });
      expect(store.getBlock(id).props.shapes[0].rotation).toBeCloseTo(90);
      expect(wrapper.querySelectorAll('.be-canvas-selection-handle').length).toBe(0);
      expect(wrapper.querySelector('.be-canvas-rotate-handle')).not.toBeNull();
    });
  });

  it('arrows have no rotate handle — rotation is not supported for arrows', () => {
    withMockedRect(() => {
      const { wrapper } = setupSelected({
        id: 'a1',
        type: 'arrow',
        x1: 100,
        y1: 100,
        x2: 300,
        y2: 100,
        color: '#000',
        strokeWidth: 4,
      });
      expect(wrapper.querySelector('.be-canvas-rotate-handle')).toBeNull();
    });
  });

  it('after rotating a shape 90°, click-select and the selection box follow the ROTATED shape, not its stored unrotated box', () => {
    withMockedRect(() => {
      const { wrapper, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        color: '#000',
        strokeWidth: 4,
      });

      // local (200,220) -> client (80,88): below the unrotated rect (whose y only goes up to 200)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 88 });
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 88 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).toBeNull();

      // reselect the shape's body — local (150,150) -> client (60,60)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull();

      // rotate handle at local (200,68) -> client (80,27.2); drag to due-east
      // of the shape's center (200,150) — local (300,150) -> client (120,60) — a 90° turn
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 27.2 });
        firePointerEvent(svg, 'pointermove', { clientX: 120, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 120, clientY: 60 });
      });

      // local (200,220) now falls inside the ROTATED shape's on-screen footprint
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 88 });
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 88 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull();
    });
  });

  it("rotation doesn't affect the shape's own move/nudge/copy-paste behavior — rotation just passes through unchanged", () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setupSelected({
        id: 'r1',
        type: 'rectangle',
        x: 400,
        y: 400,
        width: 200,
        height: 200,
        color: '#000',
        strokeWidth: 4,
        rotation: 30,
      });
      // setupSelected's own corner-based initial click can miss a rotated
      // shape (the corner it aims at has visually moved) — reselect
      // explicitly via the shape's own center, which any rotation leaves in
      // place. local (500,500) -> client (200,200).
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 200, clientY: 200 });
        firePointerEvent(svg, 'pointerup', { clientX: 200, clientY: 200 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull();

      // move by dragging the body from its center — local (500,500) -> (600,600): dx=100,dy=100
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 200, clientY: 200 });
        firePointerEvent(svg, 'pointermove', { clientX: 240, clientY: 240 });
        firePointerEvent(svg, 'pointerup', { clientX: 240, clientY: 240 });
      });
      const moved = store.getBlock(id).props.shapes[0];
      expect(moved.x).toBeCloseTo(500);
      expect(moved.rotation).toBe(30); // untouched by the move
    });
  });
});

describe('canvas block: text tool', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  function setup() {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    act(() => {
      wrapper.querySelector('[aria-label="Text"]').click();
    });
    return { store, id, wrapper, svg };
  }

  it('clicking with the Text tool opens an editable textarea at the click point, with the default box size', () => {
    withMockedRect(() => {
      const { wrapper, svg } = setup();
      // local (100,100) -> client (40,40)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      expect(textarea).not.toBeNull();
      const foreignObject = textarea.closest('foreignObject');
      expect(foreignObject.getAttribute('x')).toBe('100');
      expect(foreignObject.getAttribute('y')).toBe('100');
      expect(foreignObject.getAttribute('width')).toBe('220');
      expect(foreignObject.getAttribute('height')).toBe('60');
    });
  });

  it('typing then blurring commits a new text shape, selects it, and returns to the select tool', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      act(() => {
        fireEvent.change(textarea, { target: { value: 'Hello canvas' } });
      });
      act(() => {
        fireEvent.blur(textarea);
      });

      expect(wrapper.querySelector('.be-canvas-text-editor')).toBeNull(); // editor closed
      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(1);
      expect(shapes[0].type).toBe('text');
      expect(shapes[0].text).toBe('Hello canvas');
      expect(shapes[0].x).toBe(100);
      expect(wrapper.getAttribute('data-tool')).toBe('select');
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull(); // the new shape is selected
    });
  });

  it('blurring with empty text discards the draft — no shape is created', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      act(() => {
        fireEvent.blur(wrapper.querySelector('.be-canvas-text-editor'));
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('Escape cancels the draft without committing, discarding whatever was typed', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      act(() => {
        fireEvent.change(textarea, { target: { value: 'discard me' } });
      });
      act(() => {
        fireEvent.keyDown(textarea, { key: 'Escape' });
      });
      expect(wrapper.querySelector('.be-canvas-text-editor')).toBeNull();
      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('Enter on a selected text shape re-opens the editor pre-filled with its current text', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 't1', type: 'text', x: 100, y: 100, width: 220, height: 60, text: 'existing', color: '#000', fontSize: 28 }],
          }),
        );
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      // local (150,120) -> client (60,48): inside the text box
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 48 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 48 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull();

      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Enter' });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      expect(textarea).not.toBeNull();
      expect(textarea.value).toBe('existing');
    });
  });

  it('double-clicking a text shape re-opens the editor pre-filled with its current text, without needing Select-then-Enter', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 't1', type: 'text', x: 100, y: 100, width: 220, height: 60, text: 'existing', color: '#000', fontSize: 28 }],
          }),
        );
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      // local (150,120) -> client (60,48): inside the text box, no prior selection needed
      act(() => {
        fireEvent.doubleClick(svg, { clientX: 60, clientY: 48 });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      expect(textarea).not.toBeNull();
      expect(textarea.value).toBe('existing');
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull(); // also selects it
    });
  });

  it('double-clicking empty space (or a non-text shape) does nothing', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'r1', type: 'rectangle', x: 100, y: 100, width: 100, height: 100, color: '#000', strokeWidth: 4 }],
          }),
        );
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      act(() => {
        fireEvent.doubleClick(svg, { clientX: 60, clientY: 60 }); // local (150,150): inside the rectangle, not text
      });
      expect(wrapper.querySelector('.be-canvas-text-editor')).toBeNull();
      expect(store.getBlock(id).props.shapes).toHaveLength(1);
    });
  });

  it('Enter works IMMEDIATELY after finishing a text edit — commitTextEdit restores real focus to the canvas', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      act(() => {
        fireEvent.change(wrapper.querySelector('.be-canvas-text-editor'), { target: { value: 'hello' } });
        fireEvent.blur(wrapper.querySelector('.be-canvas-text-editor'));
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(1); // committed, selected, tool back to 'select'

      // Enter, right away, with no intervening click to refocus anything —
      // only works if commitTextEdit itself restored focus to the <svg>.
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Enter' });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      expect(textarea).not.toBeNull();
      expect(textarea.value).toBe('hello');
    });
  });

  it('editing existing text and blurring updates it in place (same id, same box)', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 't1', type: 'text', x: 100, y: 100, width: 220, height: 60, text: 'existing', color: '#000', fontSize: 28 }],
          }),
        );
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      // select and Enter are separate act() calls so the component
      // re-renders (refreshing handleKeyDown's own `selectedIds` closure)
      // between them, matching how two real, separate events are processed
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 48 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 48 });
      });
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Enter' });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      act(() => {
        fireEvent.change(textarea, { target: { value: 'updated text' } });
      });
      act(() => {
        fireEvent.blur(textarea);
      });

      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(1); // updated in place, not duplicated
      expect(shapes[0].id).toBe('t1');
      expect(shapes[0].text).toBe('updated text');
      expect(shapes[0].x).toBe(100); // box unchanged
      expect(shapes[0].width).toBe(220);
    });
  });

  it('clearing existing text and blurring deletes the shape rather than leaving an empty husk', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 't1', type: 'text', x: 100, y: 100, width: 220, height: 60, text: 'existing', color: '#000', fontSize: 28 }],
          }),
        );
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      // select and Enter are separate act() calls so the component
      // re-renders (refreshing handleKeyDown's own `selectedIds` closure)
      // between them, matching how two real, separate events are processed
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 48 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 48 });
      });
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Enter' });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      act(() => {
        fireEvent.change(textarea, { target: { value: '   ' } }); // whitespace only
      });
      act(() => {
        fireEvent.blur(textarea);
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('a committed text shape participates in the generic select/move/delete machinery like any other shape', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 't1', type: 'text', x: 100, y: 100, width: 220, height: 60, text: 'hi', color: '#000', fontSize: 28 }],
          }),
        );
        wrapper.querySelector('[aria-label="Select"]').click();
      });

      // select + drag-move: local (150,120) -> (250,220), dx=100,dy=100 -> client (60,48) -> (100,88)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 48 });
        firePointerEvent(svg, 'pointermove', { clientX: 100, clientY: 88 });
        firePointerEvent(svg, 'pointerup', { clientX: 100, clientY: 88 });
      });
      const moved = store.getBlock(id).props.shapes[0];
      expect(moved.x).toBeCloseTo(200);
      expect(moved.y).toBeCloseTo(200);
      expect(moved.text).toBe('hi'); // untouched by the move

      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Delete' });
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('clicking elsewhere while still typing commits the FIRST box (not discarding it), and — still in the text tool — opens a new box at the new location', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      // local (100,100) -> client (40,40)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      act(() => {
        fireEvent.change(wrapper.querySelector('.be-canvas-text-editor'), { target: { value: 'first box' } });
      });

      // click elsewhere on the canvas — local (300,300) -> client (120,120) — WITHOUT ever blurring the textarea directly
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 120, clientY: 120 });
        firePointerEvent(svg, 'pointerup', { clientX: 120, clientY: 120 });
      });

      // the first box's typed text must have been committed, not discarded
      const shapesAfterFirstClick = store.getBlock(id).props.shapes;
      expect(shapesAfterFirstClick).toHaveLength(1);
      expect(shapesAfterFirstClick[0].text).toBe('first box');
      expect(shapesAfterFirstClick[0].x).toBe(100); // stayed at its OWN original position

      // still in the text tool — a new (empty) editor should now be open at the new click location
      expect(wrapper.getAttribute('data-tool')).toBe('text');
      const secondEditor = wrapper.querySelector('.be-canvas-text-editor');
      expect(secondEditor).not.toBeNull();
      expect(secondEditor.value).toBe('');
      const secondForeignObject = secondEditor.closest('foreignObject');
      expect(secondForeignObject.getAttribute('x')).toBe('300');
      expect(secondForeignObject.getAttribute('y')).toBe('300');

      act(() => {
        fireEvent.change(secondEditor, { target: { value: 'second box' } });
        fireEvent.blur(secondEditor);
      });
      const finalShapes = store.getBlock(id).props.shapes;
      expect(finalShapes).toHaveLength(2);
      expect(finalShapes.find((s) => s.text === 'first box').x).toBe(100);
      expect(finalShapes.find((s) => s.text === 'second box').x).toBe(300);
    });
  });

  it('clicking on the textarea itself (repositioning the cursor mid-type) does not commit or discard the draft', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      const textarea = wrapper.querySelector('.be-canvas-text-editor');
      act(() => {
        fireEvent.change(textarea, { target: { value: 'still typing' } });
      });

      // a pointerdown that bubbles from the textarea itself (not the plain svg background)
      act(() => {
        firePointerEvent(textarea, 'pointerdown', { clientX: 45, clientY: 42 });
      });

      expect(wrapper.querySelector('.be-canvas-text-editor')).not.toBeNull(); // still open, not committed away
      expect(store.getBlock(id).props.shapes).toHaveLength(0); // nothing written to the store yet
    });
  });

  it('the font-size picker defaults to 28px and applies to newly placed text boxes', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      expect(wrapper.querySelector('[aria-label^="Font size:"]').getAttribute('aria-label')).toBe('Font size: 28');

      act(() => {
        wrapper.querySelector('[aria-label^="Font size:"]').click();
      });
      const slider = wrapper.querySelector('.be-canvas-size-picker .be-canvas-size-slider');
      fireEvent.change(slider, { target: { value: '48' } });
      expect(wrapper.querySelector('.be-canvas-size-value').textContent).toBe('48px');

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      act(() => {
        fireEvent.change(wrapper.querySelector('.be-canvas-text-editor'), { target: { value: 'big text' } });
        fireEvent.blur(wrapper.querySelector('.be-canvas-text-editor'));
      });
      expect(store.getBlock(id).props.shapes[0].fontSize).toBe(48);
    });
  });

  it('changing the font-size slider WHILE actively typing live-updates that box, not just future ones', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      act(() => {
        fireEvent.change(wrapper.querySelector('.be-canvas-text-editor'), { target: { value: 'resize me' } });
      });

      act(() => {
        wrapper.querySelector('[aria-label^="Font size:"]').click();
      });
      const slider = wrapper.querySelector('.be-canvas-size-picker .be-canvas-size-slider');
      fireEvent.change(slider, { target: { value: '64' } });
      expect(wrapper.querySelector('.be-canvas-text-editor').style.fontSize).toBe('64px');

      act(() => {
        fireEvent.blur(wrapper.querySelector('.be-canvas-text-editor'));
      });
      expect(store.getBlock(id).props.shapes[0].fontSize).toBe(64);
      // the new default persists for the NEXT box too
      expect(wrapper.querySelector('[aria-label^="Font size:"]').getAttribute('aria-label')).toBe('Font size: 64');
    });
  });
});

describe('canvas block: snapping (grid)', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  function setup() {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-tool]');
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    return { store, id, wrapper, svg };
  }

  it('snap to grid is on by default, and toggling the toolbar button flips it', () => {
    const { wrapper } = setup();
    const button = wrapper.querySelector('[aria-label="Snap to grid"]');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      button.click();
    });
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows a visible dot-grid overlay while snapping is on, and hides it when toggled off', () => {
    const { wrapper } = setup();
    expect(wrapper.querySelector('.be-canvas-grid-background')).not.toBeNull();

    act(() => {
      wrapper.querySelector('[aria-label="Snap to grid"]').click();
    });
    expect(wrapper.querySelector('.be-canvas-grid-background')).toBeNull();
  });

  it('drawing a shape with an off-grid drag snaps both corners to the nearest 10 local units', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Rectangle"]').click();
      });
      // local (103,107) -> client (41.2,42.8); drag to local (247,193) -> client (98.8,77.2)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 41.2, clientY: 42.8 });
        firePointerEvent(svg, 'pointermove', { clientX: 98.8, clientY: 77.2 });
        firePointerEvent(svg, 'pointerup', { clientX: 98.8, clientY: 77.2 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.x).toBe(100); // 103 -> 100
      expect(shape.y).toBe(110); // 107 -> 110
      expect(shape.width).toBe(150); // 250 - 100
      expect(shape.height).toBe(80); // 190 - 110
    });
  });

  it('with snapping toggled off, the same off-grid drag draws an unsnapped shape', () => {
    withMockedRect(() => {
      const { store, id, wrapper, svg } = setup();
      act(() => {
        wrapper.querySelector('[aria-label="Snap to grid"]').click(); // turn off
      });
      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Rectangle"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 41.2, clientY: 42.8 });
        firePointerEvent(svg, 'pointermove', { clientX: 98.8, clientY: 77.2 });
        firePointerEvent(svg, 'pointerup', { clientX: 98.8, clientY: 77.2 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.x).toBeCloseTo(103);
      expect(shape.y).toBeCloseTo(107);
      expect(shape.width).toBeCloseTo(144);
      expect(shape.height).toBeCloseTo(86);
    });
  });

  it('moving a shape with an off-grid drag snaps the movement delta to the nearest 10', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'r1', type: 'rectangle', x: 100, y: 100, width: 100, height: 100, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector('[data-tool]');
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
      });

      // select + drag from local (150,150) by a raw (23,18) -> snapped (20,20)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointermove', { clientX: 69.2, clientY: 67.2 }); // local (173,168)
        firePointerEvent(svg, 'pointerup', { clientX: 69.2, clientY: 67.2 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.x).toBe(120);
      expect(shape.y).toBe(120);
    });
  });

  it('resizing via a corner drag snaps the dragged corner to the nearest 10', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector('[data-tool]');
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 42, clientY: 42 }); // select via body — local (105,105)
        firePointerEvent(svg, 'pointerup', { clientX: 42, clientY: 42 });
      });

      // se corner at local (300,200) -> client (120,80); drag to off-grid local (347,193) -> client (138.8,77.2)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 120, clientY: 80 });
        firePointerEvent(svg, 'pointermove', { clientX: 138.8, clientY: 77.2 });
        firePointerEvent(svg, 'pointerup', { clientX: 138.8, clientY: 77.2 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.width).toBe(250); // 350 (snapped) - 100
      expect(shape.height).toBe(90); // 190 (snapped) - 100
    });
  });

  it('rotating snaps the angle to the nearest 15 degrees', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'r1', type: 'rectangle', x: 400, y: 400, width: 200, height: 200, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector('[data-tool]');
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 162, clientY: 162 }); // select via body — local (405,405)
        firePointerEvent(svg, 'pointerup', { clientX: 162, clientY: 162 });
      });

      // rotate handle at local (500,368) -> client (200,147.2); drag to local (598,530) — near but not
      // exactly 40° from center (500,500) — dx=98,dy=30 -> raw angle ~= atan2(30,98)=~17.03deg east-of-flat;
      // combined with the handle's own -90deg start, this raw drag lands close to but not exactly a
      // multiple of 15, so the assertion below confirms the RESULT is still exactly on one.
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 200, clientY: 147.2 });
        firePointerEvent(svg, 'pointermove', { clientX: 239.2, clientY: 212 });
        firePointerEvent(svg, 'pointerup', { clientX: 239.2, clientY: 212 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      const remainder = ((shape.rotation % 15) + 15) % 15; // normalize away from a possible negative remainder
      expect(remainder).toBeCloseTo(0);
    });
  });
});

describe('canvas block: Delete/Backspace removes the selected shape', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  it('removes exactly the selected shape, in one op, and clears the selection overlay', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [
              { id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4 },
              { id: 'r2', type: 'rectangle', x: 500, y: 500, width: 100, height: 100, color: '#000', strokeWidth: 4 },
            ],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector('[data-tool]');
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
      });

      // select r1: local (150,150) -> client (60,60)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      expect(wrapper.querySelector('.be-canvas-selection-box')).not.toBeNull();

      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Delete' });
      });

      const shapes = store.getBlock(id).props.shapes;
      expect(shapes).toHaveLength(1);
      expect(shapes[0].id).toBe('r2');
      expect(wrapper.querySelector('.be-canvas-selection-box')).toBeNull();
    });
  });

  it('does nothing when no shape is selected', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector('[data-tool]');
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
        firePointerEvent(svg, 'keydown', { key: 'Delete' });
      });

      expect(store.getBlock(id).props.shapes).toHaveLength(1);
    });
  });

  it('Backspace works the same as Delete', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector('[data-tool]');
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Select"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      act(() => {
        firePointerEvent(svg, 'keydown', { key: 'Backspace' });
      });

      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });
});

describe('canvas block: toHTML / toPlainText / fromHTML (v1 scope)', () => {
  it('toHTML returns a placeholder for an empty canvas', () => {
    const block = { props: { strokes: [], width: 480, height: 320 } };
    expect(canvasBlockType.toHTML(block)).toBe('<p></p>');
  });

  it('toHTML bakes an inline <svg> with one <path> per stroke when there is content', () => {
    const block = {
      props: {
        strokes: [{ id: 's1', points: [[0, 0, 0.5], [1000, 1000, 0.5]], color: '#000', size: 8 }],
        width: 480,
        height: 320,
      },
    };
    const html = canvasBlockType.toHTML(block);
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
  });

  it('toHTML bakes an inline <svg> with the right shape markup for a rectangle, ellipse, and arrow', () => {
    const block = {
      props: {
        strokes: [],
        shapes: [
          { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#e03131', strokeWidth: 4 },
          { id: 'e1', type: 'ellipse', x: 10, y: 20, width: 100, height: 50, color: '#1971c2', strokeWidth: 4 },
          { id: 'a1', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#2f9e44', strokeWidth: 4 },
        ],
        width: 480,
        height: 320,
      },
    };
    const html = canvasBlockType.toHTML(block);
    expect(html).toContain('<rect');
    expect(html).toContain('fill="none"');
    expect(html).toContain('<ellipse');
    expect(html).toContain('<line');
    expect(html).toContain('<polygon');
  });

  it('toHTML bakes a shape\'s fillColor into its own fill attribute, defaulting to "none" when unset (arrows are unaffected)', () => {
    const block = {
      props: {
        strokes: [],
        shapes: [
          { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 4, fillColor: '#1971c2' },
          { id: 'r2', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 4 },
          { id: 'a1', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#2f9e44', strokeWidth: 4 },
        ],
        width: 480,
        height: 320,
      },
    };
    const html = canvasBlockType.toHTML(block);
    expect(html).toContain('fill="#1971c2"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('fill="#2f9e44"'); // the arrow's own arrowhead polygon, untouched by fillColor
  });

  it('toHTML bakes a text shape as an escaped <foreignObject><div>, matching the live ShapeElement', () => {
    const block = {
      props: {
        strokes: [],
        shapes: [{ id: 't1', type: 'text', x: 10, y: 20, width: 200, height: 60, text: '<b>hi</b> & bye', color: '#000', fontSize: 24 }],
        width: 480,
        height: 320,
      },
    };
    const html = canvasBlockType.toHTML(block);
    expect(html).toContain('<foreignObject x="10" y="20" width="200" height="60">');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt; &amp; bye'); // escaped, not interpreted as markup
    expect(html).not.toContain('<b>hi</b>');
  });

  it('toHTML wraps a rotated shape in a <g rotate()> around its bounding-box center, matching the live ShapeElement', () => {
    const block = {
      props: {
        strokes: [],
        shapes: [{ id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4, rotation: 45 }],
        width: 480,
        height: 320,
      },
    };
    const html = canvasBlockType.toHTML(block);
    expect(html).toContain('<g transform="rotate(45 200 150)">');
  });

  it('toHTML omits the <g> wrapper for an unrotated (or arrow) shape', () => {
    const block = {
      props: {
        strokes: [],
        shapes: [
          { id: 'r1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', strokeWidth: 4, rotation: 0 },
          { id: 'a1', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#000', strokeWidth: 4 },
        ],
        width: 480,
        height: 320,
      },
    };
    expect(canvasBlockType.toHTML(block)).not.toContain('<g transform="rotate');
  });

  it('toHTML treats an empty canvas (no strokes AND no shapes) as the placeholder case', () => {
    const block = { props: { strokes: [], shapes: [], width: 480, height: 320 } };
    expect(canvasBlockType.toHTML(block)).toBe('<p></p>');
  });

  it('toPlainText always returns an empty string', () => {
    expect(canvasBlockType.toPlainText({ props: { strokes: [] } })).toBe('');
    expect(
      canvasBlockType.toPlainText({ props: { strokes: [{ id: 's1', points: [[0, 0, 0.5]], color: '#000', size: 8 }] } }),
    ).toBe('');
  });

  it('fromHTML always returns null (no paste round-trip in v1)', () => {
    expect(canvasBlockType.fromHTML({ tagName: 'SVG' })).toBeNull();
    expect(canvasBlockType.fromHTML(null)).toBeNull();
  });
});

describe('canvas block: pen-tool pointer-drawing (Phase 2)', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 480, height: 320, right: 480, bottom: 320 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  // jsdom has no PointerEvent constructor — a plain Event with the extra
  // pointer-specific fields assigned directly dispatches identically for
  // our purposes (the component only ever reads these as plain properties).
  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  it('commits exactly one store op per drawing gesture — pointermove never writes to the store', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 10, clientY: 10 });
      });
      expect(store.getBlock(id).props.strokes).toHaveLength(0);

      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 50, clientY: 60 });
        firePointerEvent(svg, 'pointermove', { clientX: 100, clientY: 120 });
        firePointerEvent(svg, 'pointermove', { clientX: 150, clientY: 180 });
      });
      // still zero: pointermove only touches local refs/preview state, never the store
      expect(store.getBlock(id).props.strokes).toHaveLength(0);

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 150, clientY: 180 });
      });
      const strokes = store.getBlock(id).props.strokes;
      expect(strokes).toHaveLength(1);
      expect(strokes[0].points.length).toBeGreaterThanOrEqual(4); // down + 3 moves
      expect(strokes[0].color).toBeTruthy();
      expect(strokes[0].size).toBeGreaterThan(0);
    });
  });

  it('a tap without dragging still commits a single-point stroke', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 200, clientY: 100 });
        firePointerEvent(svg, 'pointerup', { clientX: 200, clientY: 100 });
      });

      const strokes = store.getBlock(id).props.strokes;
      expect(strokes).toHaveLength(1);
      expect(strokes[0].points).toHaveLength(1);
    });
  });

  it('pointercancel discards the in-progress stroke instead of committing it', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 10, clientY: 10 });
        firePointerEvent(svg, 'pointermove', { clientX: 50, clientY: 50 });
        firePointerEvent(svg, 'pointercancel', { clientX: 50, clientY: 50 });
      });

      expect(store.getBlock(id).props.strokes).toHaveLength(0);
    });
  });
});

describe('canvas block: eraser tool (Phase 3)', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  // Square, unlike the pen-tool describe block's 480x320 mock — this test
  // cares about exact spatial correspondence between client coordinates and
  // local-space points, and a square rect keeps that mapping simple (no
  // letterbox offset to account for by hand; see canvasGeometry.js's
  // computeViewTransform for why a non-square rect would otherwise need one).
  const mockRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  it('erasing a stroke commits exactly one op per gesture, removing only the touched stroke(s)', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            strokes: [
              { id: 's1', points: [[100, 100, 0.5], [200, 200, 0.5]], color: '#000', size: 8 }, // near top-left
              { id: 's2', points: [[800, 800, 0.5], [900, 900, 0.5]], color: '#000', size: 8 }, // near bottom-right, untouched
            ],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click(); // opens the eraser-mode popover
      });
      act(() => {
        wrapper.querySelector('[aria-label="Object Eraser"]').click();
      });
      expect(wrapper.getAttribute('data-tool')).toBe('eraser');

      // local (0..1000) x=100..200,y=100..200 maps to client (400x400 square rect) x=40..80,y=40..80
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
      });
      expect(store.getBlock(id).props.strokes).toHaveLength(2); // no store write yet — still mid-gesture

      act(() => {
        firePointerEvent(svg, 'pointermove', { clientX: 80, clientY: 80 });
      });
      expect(store.getBlock(id).props.strokes).toHaveLength(2); // pointermove never writes to the store either

      act(() => {
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 80 });
      });
      const strokes = store.getBlock(id).props.strokes;
      expect(strokes).toHaveLength(1);
      expect(strokes[0].id).toBe('s2'); // the untouched stroke survives
    });
  });

  it('an erase gesture that touches nothing makes no store write at all', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, { strokes: [{ id: 's1', points: [[500, 500, 0.5]], color: '#000', size: 8 }] }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click(); // opens the eraser-mode popover
      });
      act(() => {
        wrapper.querySelector('[aria-label="Object Eraser"]').click();
      });
      act(() => {
        // far corner, nowhere near the single stroke at local (500,500)
        firePointerEvent(svg, 'pointerdown', { clientX: 5, clientY: 5 });
        firePointerEvent(svg, 'pointerup', { clientX: 5, clientY: 5 });
      });

      expect(store.getBlock(id).props.strokes).toHaveLength(1);
      expect(store.getBlock(id).props.strokes[0].id).toBe('s1');
    });
  });

  it("is precise to the stroke's actual path, not just its bounding box — an L-shaped stroke's empty corner is untouched even though it lies inside the bounding box", () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            strokes: [{ id: 'L', points: [[100, 100, 0.5], [100, 300, 0.5], [300, 300, 0.5]], color: '#000', size: 8 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click(); // opens the eraser-mode popover
      });
      act(() => {
        wrapper.querySelector('[aria-label="Object Eraser"]').click();
      });

      // local (280,120): inside the L's own bounding box (100-300 on both
      // axes) but nowhere near either of its two actual segments
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 112, clientY: 48 });
        firePointerEvent(svg, 'pointerup', { clientX: 112, clientY: 48 });
      });
      expect(store.getBlock(id).props.strokes).toHaveLength(1); // untouched

      // local (100,200): squarely on the vertical segment
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 80 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 80 });
      });
      expect(store.getBlock(id).props.strokes).toHaveLength(0); // erased
    });
  });

  it('the Eraser popover offers Object and Precise modes; Object Eraser removes shapes it touches too, not just strokes', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            shapes: [{ id: 'sh1', type: 'rectangle', x: 100, y: 100, width: 100, height: 100, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Object Eraser"]').click();
      });
      // local (150,150) -> client (60,60): inside the shape
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 60, clientY: 60 });
        firePointerEvent(svg, 'pointerup', { clientX: 60, clientY: 60 });
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0);
    });
  });

  it('Precise Eraser has a smaller reach than Object Eraser, for whole-object shape erasing', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const shape = { id: 'sh1', type: 'rectangle', x: 120, y: 90, width: 20, height: 20, color: '#000', strokeWidth: 4 };
      act(() => {
        store.applyOperation(updateBlockProps(id, { shapes: [shape] }));
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Precise Eraser"]').click();
      });
      // local (100,100) -> client (40,40): 20 units from the shape's near
      // edge — within Object Eraser's radius (24) but outside Precise
      // Eraser's (6)
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(1); // untouched by Precise

      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Object Eraser"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });
      expect(store.getBlock(id).props.shapes).toHaveLength(0); // touched by Object
    });
  });

  it('Precise Eraser removes only the touched PORTION of a stroke, splitting the remainder into two separate strokes', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const points = Array.from({ length: 11 }, (_, i) => [100 + i * 20, 100, 0.5]); // x: 100,120,...,300
      act(() => {
        store.applyOperation(updateBlockProps(id, { strokes: [{ id: 's1', points, color: '#000', size: 8 }] }));
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Precise Eraser"]').click();
      });

      // local (200,100) -> client (80,40): dead on the middle point (index
      // 5); its neighbors are 20 units away, well outside the 6-unit
      // Precise radius, so only that ONE point is erased
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 80, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 40 });
      });

      const strokes = store.getBlock(id).props.strokes;
      expect(strokes).toHaveLength(2);
      const first = strokes.find((s) => s.id === 's1'); // the first run keeps the original id
      expect(first).toBeDefined();
      expect(first.points).toHaveLength(5); // indices 0-4
      expect(first.points[first.points.length - 1][0]).toBe(180);
      const second = strokes.find((s) => s.id !== 's1'); // the second run gets a fresh id
      expect(second).toBeDefined();
      expect(second.points).toHaveLength(5); // indices 6-10
      expect(second.points[0][0]).toBe(220);
    });
  });

  it('Precise Eraser trimming from one end keeps the original id (no split needed)', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const points = Array.from({ length: 11 }, (_, i) => [100 + i * 20, 100, 0.5]);
      act(() => {
        store.applyOperation(updateBlockProps(id, { strokes: [{ id: 's1', points, color: '#000', size: 8 }] }));
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Precise Eraser"]').click();
      });

      // local (100,100) -> client (40,40): the very first point only
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40, clientY: 40 });
      });

      const strokes = store.getBlock(id).props.strokes;
      expect(strokes).toHaveLength(1); // no split — trimmed from one end
      expect(strokes[0].id).toBe('s1');
      expect(strokes[0].points).toHaveLength(10);
      expect(strokes[0].points[0][0]).toBe(120);
    });
  });

  it('Precise Eraser erasing every point removes the stroke entirely', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            strokes: [
              {
                id: 's1',
                points: [[100, 100, 0.5], [103, 100, 0.5]], // both within a 6-unit radius of one point
                color: '#000',
                size: 8,
              },
            ],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Precise Eraser"]').click();
      });

      // local (101,100) -> client (40.4,40): within 6 units of BOTH points
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 40.4, clientY: 40 });
        firePointerEvent(svg, 'pointerup', { clientX: 40.4, clientY: 40 });
      });
      expect(store.getBlock(id).props.strokes).toHaveLength(0);
    });
  });

  it('Object Eraser still removes the WHOLE stroke on any touch, even after Precise Eraser has been used elsewhere in the same session', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const points = Array.from({ length: 5 }, (_, i) => [100 + i * 20, 100, 0.5]);
      act(() => {
        store.applyOperation(updateBlockProps(id, { strokes: [{ id: 's1', points, color: '#000', size: 8 }] }));
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Object Eraser"]').click();
      });
      // touching just the middle point removes the WHOLE stroke in Object mode
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 72, clientY: 40 }); // local (180,100): index 4
        firePointerEvent(svg, 'pointerup', { clientX: 72, clientY: 40 });
      });
      expect(store.getBlock(id).props.strokes).toHaveLength(0);
    });
  });

  it('erasing a mix of strokes and shapes in one gesture commits exactly once', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      act(() => {
        store.applyOperation(
          updateBlockProps(id, {
            strokes: [{ id: 's1', points: [[100, 100, 0.5], [150, 150, 0.5]], color: '#000', size: 8 }],
            shapes: [{ id: 'sh1', type: 'rectangle', x: 100, y: 100, width: 100, height: 100, color: '#000', strokeWidth: 4 }],
          }),
        );
      });
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');
      act(() => {
        wrapper.querySelector('[aria-label="Eraser"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Object Eraser"]').click();
      });

      const applySpy = vi.spyOn(store, 'applyOperation');
      // local (120,120) -> client (48,48): hits both the stroke and the shape
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 48, clientY: 48 });
        firePointerEvent(svg, 'pointerup', { clientX: 48, clientY: 48 });
      });
      expect(applySpy).toHaveBeenCalledTimes(1);
      const block = store.getBlock(id);
      expect(block.props.strokes).toHaveLength(0);
      expect(block.props.shapes).toHaveLength(0);
    });
  });
});

describe('canvas block: resize handle (Phase 4)', () => {
  it('exposes a slider handle with the current width, and dragging it live-updates the SVG size, committing exactly once on mouseup', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);

    const handle = container.querySelector(`[data-block-id="${id}"] .be-canvas-resize-handle`);
    const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
    expect(handle.getAttribute('role')).toBe('slider');
    expect(handle.getAttribute('aria-valuenow')).toBe(String(DEFAULT_CANVAS_WIDTH));
    expect(svg.getAttribute('width')).toBe(String(DEFAULT_CANVAS_WIDTH));
    expect(svg.getAttribute('height')).toBe(String(DEFAULT_CANVAS_HEIGHT));

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
    expect(store.getBlock(id).props.width).toBe(DEFAULT_CANVAS_WIDTH); // no store write yet

    fireEvent.mouseMove(document, { clientX: 160, clientY: 140 }); // +60 wide, +40 tall
    expect(svg.getAttribute('width')).toBe(String(DEFAULT_CANVAS_WIDTH + 60)); // live preview
    expect(svg.getAttribute('height')).toBe(String(DEFAULT_CANVAS_HEIGHT + 40));
    expect(store.getBlock(id).props.width).toBe(DEFAULT_CANVAS_WIDTH); // still no store write

    fireEvent.mouseUp(document, { clientX: 160, clientY: 140 });
    expect(store.getBlock(id).props.width).toBe(DEFAULT_CANVAS_WIDTH + 60);
    expect(store.getBlock(id).props.height).toBe(DEFAULT_CANVAS_HEIGHT + 40);
  });

  it('clamps to a sane minimum size instead of shrinking to nothing', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const handle = container.querySelector(`[data-block-id="${id}"] .be-canvas-resize-handle`);

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: -1000, clientY: -1000 }); // drag way past zero
    fireEvent.mouseUp(document, { clientX: -1000, clientY: -1000 });

    expect(store.getBlock(id).props.width).toBeGreaterThan(0);
    expect(store.getBlock(id).props.height).toBeGreaterThan(0);
  });

  it('existing strokes render correctly at any rendered size — resizing never touches stroke data (fixed normalized coordinate space)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(
        updateBlockProps(id, { strokes: [{ id: 's1', points: [[0, 0, 0.5], [1000, 1000, 0.5]], color: '#000', size: 8 }] }),
      );
    });
    const { container } = renderDoc(store);
    const pathBefore = container.querySelector(`[data-block-id="${id}"] path`).getAttribute('d');

    act(() => {
      store.applyOperation(updateBlockProps(id, { width: 900, height: 700 }));
    });

    const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
    const pathAfter = container.querySelector(`[data-block-id="${id}"] path`).getAttribute('d');
    expect(svg.getAttribute('width')).toBe('900');
    expect(svg.getAttribute('height')).toBe('700');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 1000'); // unchanged — resize never rescales stroke coordinates
    expect(pathAfter).toBe(pathBefore); // stroke geometry is completely untouched by resizing
  });
});

describe('canvas block: pan/zoom (Phase 5) — local view state, never touches the store', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 480, height: 320, right: 480, bottom: 320 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  it('Ctrl+wheel zooms the view (changes the viewBox) without ever writing to the store', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
      const applySpy = vi.spyOn(store, 'applyOperation');
      const before = svg.getAttribute('viewBox');

      act(() => {
        fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true, clientX: 240, clientY: 160 });
      });

      expect(svg.getAttribute('viewBox')).not.toBe(before);
      expect(applySpy).not.toHaveBeenCalled();
    });
  });

  it('Ctrl+wheel actually calls preventDefault (regression: React\'s synthetic onWheel is passive by default and silently ignores preventDefault, letting the browser also zoom the whole page)', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);

      const event = new Event('wheel', { bubbles: true, cancelable: true });
      Object.assign(event, { deltaY: -100, ctrlKey: true, clientX: 240, clientY: 160 });
      act(() => {
        svg.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
    });
  });

  it('a plain wheel (no Ctrl/Cmd) pans the view — a trackpad two-finger scroll, not the surrounding page', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
      const before = svg.getAttribute('viewBox');

      const event = new Event('wheel', { bubbles: true, cancelable: true });
      Object.assign(event, { deltaX: 0, deltaY: -100, clientX: 240, clientY: 160 });
      act(() => {
        svg.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(svg.getAttribute('viewBox')).not.toBe(before);
    });
  });

  it('a middle-mouse-button drag pans the view without ever writing to the store, and never starts a pen stroke', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
      const applySpy = vi.spyOn(store, 'applyOperation');
      const before = svg.getAttribute('viewBox');

      act(() => {
        firePointerEvent(svg, 'pointerdown', { button: 1, clientX: 100, clientY: 100 });
        firePointerEvent(svg, 'pointermove', { button: 1, clientX: 150, clientY: 130 });
        firePointerEvent(svg, 'pointerup', { button: 1, clientX: 150, clientY: 130 });
      });

      expect(svg.getAttribute('viewBox')).not.toBe(before);
      expect(applySpy).not.toHaveBeenCalled();
      expect(store.getBlock(id).props.strokes).toHaveLength(0); // pan, not a pen stroke
    });
  });

  it('a two-finger touch drag pans the view and discards whatever the first finger alone had already started drawing', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const svg = container.querySelector(`[data-block-id="${id}"] svg.be-canvas-surface`);
      const applySpy = vi.spyOn(store, 'applyOperation');
      const before = svg.getAttribute('viewBox');

      act(() => {
        // First finger alone starts a pen stroke (the default tool).
        firePointerEvent(svg, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
        firePointerEvent(svg, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 105, clientY: 105 });
        // A second finger lands mid-gesture — this should cancel the
        // in-progress stroke and switch straight into a two-finger pan.
        firePointerEvent(svg, 'pointerdown', {
          pointerId: 2,
          pointerType: 'touch',
          isPrimary: false,
          clientX: 140,
          clientY: 100,
        });
        // Both fingers drag together (same relative offset from each
        // other — a pan, not a pinch).
        firePointerEvent(svg, 'pointermove', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 130 });
        firePointerEvent(svg, 'pointermove', { pointerId: 2, pointerType: 'touch', clientX: 140, clientY: 130 });
        firePointerEvent(svg, 'pointerup', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 130 });
        firePointerEvent(svg, 'pointerup', {
          pointerId: 2,
          pointerType: 'touch',
          isPrimary: false,
          clientX: 140,
          clientY: 130,
        });
      });

      expect(svg.getAttribute('viewBox')).not.toBe(before);
      expect(applySpy).not.toHaveBeenCalled();
      expect(store.getBlock(id).props.strokes).toHaveLength(0); // the first finger's stroke was discarded, not committed
    });
  });

  it('the zoom in/out buttons change the view (never the store), and the reset button returns to 100%', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    const svg = wrapper.querySelector('svg.be-canvas-surface');
    const applySpy = vi.spyOn(store, 'applyOperation');
    const before = svg.getAttribute('viewBox');

    act(() => {
      wrapper.querySelector('[aria-label="Zoom in"]').click();
    });
    expect(svg.getAttribute('viewBox')).not.toBe(before);
    expect(wrapper.querySelector('.be-canvas-zoom-label').textContent).toBe('110%');
    expect(applySpy).not.toHaveBeenCalled();

    act(() => {
      wrapper.querySelector('[aria-label="Zoom out"]').click();
      wrapper.querySelector('[aria-label="Zoom out"]').click();
    });
    expect(wrapper.querySelector('.be-canvas-zoom-label').textContent).not.toBe('100%');

    act(() => {
      wrapper.querySelector('.be-canvas-zoom-label').click();
    });
    expect(svg.getAttribute('viewBox')).toBe(before);
    expect(wrapper.querySelector('.be-canvas-zoom-label').textContent).toBe('100%');
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('zoom in/out clamp at the same MIN_ZOOM/MAX_ZOOM bounds as wheel-zoom', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    const zoomInBtn = wrapper.querySelector('[aria-label="Zoom in"]');
    const zoomOutBtn = wrapper.querySelector('[aria-label="Zoom out"]');

    act(() => {
      for (let i = 0; i < 40; i += 1) zoomInBtn.click();
    });
    expect(zoomInBtn.disabled).toBe(true);

    act(() => {
      wrapper.querySelector('.be-canvas-zoom-label').click(); // reset
      for (let i = 0; i < 40; i += 1) zoomOutBtn.click();
    });
    expect(zoomOutBtn.disabled).toBe(true);
  });
});

describe('canvas block: toolbar color/size controls (Phase 6)', () => {
  const originalGetBoundingClientRect = SVGElement.prototype.getBoundingClientRect;
  const mockRect = { left: 0, top: 0, width: 480, height: 320, right: 480, bottom: 320 };

  function withMockedRect(fn) {
    SVGElement.prototype.getBoundingClientRect = function () {
      return mockRect;
    };
    try {
      fn();
    } finally {
      SVGElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  function firePointerEvent(el, type, opts = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, pressure: 0.5, clientX: 0, clientY: 0, ...opts });
    el.dispatchEvent(event);
  }

  it('opening the color popover, picking a swatch, and dragging the size slider applies to the next committed stroke', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      act(() => {
        wrapper.querySelector('[aria-label^="Color:"]').click(); // open the color popover
      });
      expect(wrapper.querySelector('.be-canvas-color-picker')).not.toBeNull();
      act(() => {
        wrapper.querySelector('[aria-label="Color #e03131"]').click();
      });
      expect(wrapper.querySelector('.be-canvas-color-picker')).toBeNull(); // picking a swatch closes the popover

      act(() => {
        wrapper.querySelector('[aria-label^="Stroke size:"]').click(); // open the size popover
      });
      const slider = wrapper.querySelector('.be-canvas-size-slider');
      expect(slider).not.toBeNull();
      fireEvent.change(slider, { target: { value: '16' } });

      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 10, clientY: 10 });
        firePointerEvent(svg, 'pointermove', { clientX: 50, clientY: 50 });
        firePointerEvent(svg, 'pointerup', { clientX: 50, clientY: 50 });
      });

      const strokes = store.getBlock(id).props.strokes;
      expect(strokes).toHaveLength(1);
      expect(strokes[0].color).toBe('#e03131');
      expect(strokes[0].size).toBe(16);
    });
  });

  it('the size slider live-updates a preview dot and its displayed value as it is dragged', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    act(() => {
      wrapper.querySelector('[aria-label^="Stroke size:"]').click();
    });
    const slider = wrapper.querySelector('.be-canvas-size-slider');
    fireEvent.change(slider, { target: { value: '30' } });

    expect(wrapper.querySelector('.be-canvas-size-value').textContent).toBe('30px');
    expect(wrapper.querySelector('.be-canvas-size-preview-dot').style.width).toBe('30px');
  });

  it('every default color swatch is reachable and reflects the active selection via aria-pressed, and a custom color input is also offered', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    act(() => {
      wrapper.querySelector('[aria-label^="Color:"]').click();
    });
    const swatches = wrapper.querySelectorAll('.be-canvas-toolbar-swatch');
    expect(swatches.length).toBeGreaterThanOrEqual(3);
    expect(wrapper.querySelector('.be-canvas-custom-swatch input[type="color"]')).not.toBeNull();

    act(() => {
      swatches[1].click();
    });
    // picking a swatch closes the popover — reopen to inspect aria-pressed state
    act(() => {
      wrapper.querySelector('[aria-label^="Color:"]').click();
    });
    const reopened = wrapper.querySelectorAll('.be-canvas-toolbar-swatch');
    expect(reopened[1].getAttribute('aria-pressed')).toBe('true');
    expect(reopened[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('the color popover closes on outside click and Escape', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    act(() => {
      wrapper.querySelector('[aria-label^="Color:"]').click();
    });
    expect(wrapper.querySelector('.be-canvas-color-picker')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(wrapper.querySelector('.be-canvas-color-picker')).toBeNull();

    act(() => {
      wrapper.querySelector('[aria-label^="Color:"]').click();
    });
    expect(wrapper.querySelector('.be-canvas-color-picker')).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(wrapper.querySelector('.be-canvas-color-picker')).toBeNull();
  });

  it('the Fill picker defaults to "no fill", offers a None option plus swatches/custom color, and applies to newly drawn shapes', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      expect(wrapper.querySelector('[aria-label="Fill: none"]')).not.toBeNull();

      act(() => {
        wrapper.querySelector('[aria-label^="Fill:"]').click();
      });
      expect(wrapper.querySelector('[aria-label="No fill"]').getAttribute('aria-pressed')).toBe('true');
      expect(wrapper.querySelector('.be-canvas-custom-swatch input[type="color"]')).not.toBeNull();

      act(() => {
        wrapper.querySelector('[aria-label="Fill #1971c2"]').click();
      });
      expect(wrapper.querySelector('.be-canvas-color-picker')).toBeNull(); // picking a fill swatch closes the popover
      expect(wrapper.querySelector('[aria-label="Fill: #1971c2"]')).not.toBeNull();

      // draw a rectangle: open the Shape popover, pick Rectangle, drag
      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Rectangle"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 32, clientY: 32 }); // local (100,100)
        firePointerEvent(svg, 'pointermove', { clientX: 96, clientY: 64 }); // local (300,200)
        firePointerEvent(svg, 'pointerup', { clientX: 96, clientY: 64 });
      });

      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.fillColor).toBe('#1971c2');
    });
  });

  it('arrows are unaffected by the fill color — their arrowhead is always solid-filled with the stroke color, not a separate fill', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      act(() => {
        wrapper.querySelector('[aria-label^="Fill:"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Fill #1971c2"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Arrow"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 32, clientY: 32 });
        firePointerEvent(svg, 'pointermove', { clientX: 96, clientY: 64 });
        firePointerEvent(svg, 'pointerup', { clientX: 96, clientY: 64 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.fillColor).toBeUndefined();
    });
  });

  it('picking "No fill" again after a color resets newly drawn shapes back to fill="none"', () => {
    withMockedRect(() => {
      const store = new EditorStore(emptyDoc());
      const id = insertAtRoot(store, createCanvasBlock());
      const { container } = renderDoc(store);
      const wrapper = container.querySelector(`[data-block-id="${id}"]`);
      const svg = wrapper.querySelector('svg.be-canvas-surface');

      act(() => {
        wrapper.querySelector('[aria-label^="Fill:"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Fill #1971c2"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label^="Fill:"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="No fill"]').click();
      });
      expect(wrapper.querySelector('[aria-label="Fill: none"]')).not.toBeNull();

      act(() => {
        wrapper.querySelector('[aria-label="Shape"]').click();
      });
      act(() => {
        wrapper.querySelector('[aria-label="Rectangle"]').click();
      });
      act(() => {
        firePointerEvent(svg, 'pointerdown', { clientX: 32, clientY: 32 });
        firePointerEvent(svg, 'pointermove', { clientX: 96, clientY: 64 });
        firePointerEvent(svg, 'pointerup', { clientX: 96, clientY: 64 });
      });
      const shape = store.getBlock(id).props.shapes[0];
      expect(shape.fillColor).toBeNull();
    });
  });
});

describe('canvas block: PNG export', () => {
  it('the Export PNG button is disabled on an empty canvas and enabled once there is content', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    const button = wrapper.querySelector('[aria-label="Export PNG"]');
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);

    act(() => {
      store.applyOperation(
        updateBlockProps(id, {
          shapes: [{ id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 4 }],
        }),
      );
    });
    expect(button.disabled).toBe(false);
  });

  it('clicking Export PNG does not throw, even in an environment (like this test suite\'s jsdom) with no real URL.createObjectURL/canvas support', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    act(() => {
      store.applyOperation(
        updateBlockProps(id, {
          shapes: [{ id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000', strokeWidth: 4 }],
        }),
      );
    });
    const { container } = renderDoc(store);
    const wrapper = container.querySelector(`[data-block-id="${id}"]`);

    expect(() => {
      act(() => {
        wrapper.querySelector('[aria-label="Export PNG"]').click();
      });
    }).not.toThrow();

    // a purely local/visual action — never touches the store
    expect(store.getBlock(id).props.shapes).toHaveLength(1);
  });
});

describe('canvas block: contentless select-then-delete works with zero canvas-specific code', () => {
  it('Backspace from a following empty-obstacle check treats it exactly like divider/embed via isContentlessBlock', async () => {
    const { isContentlessBlock } = await import('../../src/blocks/shared/contentless.js');
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createCanvasBlock());
    expect(isContentlessBlock(store, store.getBlock(id))).toBe(true);
  });
});
