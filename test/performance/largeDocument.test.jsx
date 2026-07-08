import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { updateRun } from '../../src/store/operations.js';

const BLOCK_COUNT = 500;

function makeLargeDoc() {
  const rootContentIds = [];
  const blocks = [];
  const runs = [];
  for (let i = 0; i < BLOCK_COUNT; i += 1) {
    const blockId = `p${i}`;
    const runId = `r${i}`;
    rootContentIds.push(blockId);
    blocks.push({ id: blockId, type: 'paragraph', parentId: 'root', contentIds: [runId], props: {} });
    runs.push({ id: runId, type: 'text', value: `Paragraph number ${i}`, marks: {} });
  }
  blocks.unshift({ id: 'root', type: 'page', parentId: null, contentIds: rootContentIds, props: {} });
  return { rootId: 'root', blocks, runs };
}

/**
 * Wraps the real ParagraphBlock (not a stand-in probe) so the tree
 * rendered here is exactly what a consumer app would get — including the
 * full EditableBlockContent host/portal machinery — while still counting
 * renders per block id, the thing that actually proves (or disproves)
 * re-render isolation at scale.
 */
function instrumentedRegistry(renderCounts) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const paragraphEntry = registry.get('paragraph');
  const RealParagraph = paragraphEntry.component;
  registry.register('paragraph', {
    ...paragraphEntry,
    component: function InstrumentedParagraph({ id }) {
      renderCounts[id] = (renderCounts[id] ?? 0) + 1;
      return <RealParagraph id={id} />;
    },
  });
  return registry;
}

describe('performance: large document (stress test)', () => {
  it(`mounts a ${BLOCK_COUNT}-block document with every block rendering exactly once`, () => {
    const store = new EditorStore(makeLargeDoc());
    const renderCounts = {};
    const registry = instrumentedRegistry(renderCounts);

    const { container } = render(
      <EditorProvider store={store} registry={registry}>
        <BlockChildren parentId="root" />
      </EditorProvider>,
    );

    expect(container.querySelectorAll('[data-block-id]').length).toBe(BLOCK_COUNT);
    expect(Object.keys(renderCounts).length).toBe(BLOCK_COUNT);
    expect(Object.values(renderCounts).every((count) => count === 1)).toBe(true);
  });

  it('editing one run deep in a 500-block document re-renders zero ParagraphBlock components', () => {
    const store = new EditorStore(makeLargeDoc());
    const renderCounts = {};
    const registry = instrumentedRegistry(renderCounts);

    const { container } = render(
      <EditorProvider store={store} registry={registry}>
        <BlockChildren parentId="root" />
      </EditorProvider>,
    );

    const renderCountsBefore = { ...renderCounts };
    const midIndex = Math.floor(BLOCK_COUNT / 2);

    act(() => {
      store.applyOperation(updateRun(`r${midIndex}`, { value: 'edited mid-document' }));
    });

    // A run's *value* is subscribed to directly by TextRunSpan (useRun),
    // several levels below ParagraphBlock — ParagraphBlock itself only
    // subscribes to the block object (useBlock), which a run-only edit
    // never touches. So the correct, and stronger, isolation claim isn't
    // "only the edited block re-renders" — it's that *none* of the 500
    // ParagraphBlock components re-render at all for this edit; the update
    // is handled entirely by the one TextRunSpan instance that owns it.
    for (let i = 0; i < BLOCK_COUNT; i += 1) {
      expect(renderCounts[`p${i}`]).toBe(renderCountsBefore[`p${i}`]);
    }

    const host = container.querySelector(`[data-run-id="r${midIndex}"]`);
    expect(host.textContent).toBe('edited mid-document');
  });

  it('mounts in roughly linear (not quadratic) time as document size grows', () => {
    // A generous smoke test, not a tight benchmark: jsdom has no real
    // layout/paint and CI hardware speed varies, so this only guards
    // against an accidental O(n²) regression (e.g. an accidental full
    // document re-render loop), not a precise performance budget.
    function timeMount(blockCount) {
      const rootContentIds = [];
      const blocks = [];
      const runs = [];
      for (let i = 0; i < blockCount; i += 1) {
        rootContentIds.push(`p${i}`);
        blocks.push({ id: `p${i}`, type: 'paragraph', parentId: 'root', contentIds: [`r${i}`], props: {} });
        runs.push({ id: `r${i}`, type: 'text', value: `Paragraph ${i}`, marks: {} });
      }
      blocks.unshift({ id: 'root', type: 'page', parentId: null, contentIds: rootContentIds, props: {} });

      const store = new EditorStore({ rootId: 'root', blocks, runs });
      const registry = createBlockRegistry();
      registerBuiltInBlocks(registry);

      const start = performance.now();
      render(
        <EditorProvider store={store} registry={registry}>
          <BlockChildren parentId="root" />
        </EditorProvider>,
      );
      return performance.now() - start;
    }

    timeMount(50); // warm up JIT/module caches before measuring either size
    const small = timeMount(100);
    const large = timeMount(1000); // 10x the blocks

    // True O(n) would put this around 10x; leave generous headroom (25x)
    // before treating it as a regression, since jsdom timing is noisy.
    expect(large).toBeLessThan(Math.max(small * 25, 500));
  });
});
