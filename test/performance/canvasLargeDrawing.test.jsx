import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { insertBlock } from '../../src/store/operations.js';
import { createCanvasBlock } from '../../src/blocks/canvas/createCanvasBlock.js';

const STROKE_COUNT = 1000;

function makeManyStrokes(count) {
  const strokes = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i % 100) * 10;
    const y = Math.floor(i / 100) * 10;
    strokes.push({ id: `s${i}`, points: [[x, y, 0.5], [x + 5, y + 5, 0.5]], color: '#000', size: 4 });
  }
  return strokes;
}

function emptyDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function renderCanvasWithStrokes(strokeCount) {
  const store = new EditorStore(emptyDoc());
  const factory = createCanvasBlock({ strokes: makeManyStrokes(strokeCount) });
  const { block, runs } = factory('root');
  store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block], runs }));

  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const result = render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
  return { store, blockId: block.id, ...result };
}

describe('performance: canvas block with a large drawing (stress test)', () => {
  it(`mounts a canvas with ${STROKE_COUNT} strokes, rendering exactly one <path> per stroke`, () => {
    const { container } = renderCanvasWithStrokes(STROKE_COUNT);
    const svg = container.querySelector('svg.be-canvas-surface');
    expect(svg.querySelectorAll('path').length).toBe(STROKE_COUNT);
  });

  it('mounts in roughly linear (not quadratic) time as stroke count grows', () => {
    // A generous smoke test, not a tight benchmark — see the equivalent
    // large-document test's own doc comment on why (no real jsdom
    // layout/paint, noisy CI timing). This only guards against an
    // accidental O(n²) regression in the strokes.map() render path.
    function timeMount(count) {
      const start = performance.now();
      renderCanvasWithStrokes(count);
      return performance.now() - start;
    }

    timeMount(50); // warm up JIT/module caches before measuring either size
    const small = timeMount(100);
    const large = timeMount(1000); // 10x the strokes

    expect(large).toBeLessThan(Math.max(small * 25, 500));
  });
});
