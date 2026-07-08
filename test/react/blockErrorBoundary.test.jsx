import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['flaky', 'p1'], props: {} },
      { id: 'flaky', type: 'flaky', parentId: 'root', contentIds: [], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: [], props: {} },
    ],
    runs: [],
  };
}

function ParagraphStub({ id }) {
  return <div className="be-paragraph" data-block-id={id}>sibling content</div>;
}

// Regression: an uncaught error while React commits one block's DOM (e.g.
// the removeChild desync from rapid inline-chip deletion) used to unmount
// the *entire* editor root, blanking the whole page over a problem confined
// to a single block. BlockRenderer now wraps every block in
// BlockErrorBoundary, which contains the crash to that one block and
// self-heals by remounting it, leaving every sibling block untouched.
describe('BlockErrorBoundary: one block crashing does not take down the page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps sibling blocks rendered and self-heals the failing block on the next tick', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let renderCount = 0;
    function FlakyBlock() {
      renderCount += 1;
      if (renderCount === 1) throw new Error('simulated commit-phase desync');
      return <div className="be-flaky-recovered">recovered</div>;
    }

    const registry = createBlockRegistry();
    registry.register('flaky', { component: FlakyBlock });
    registry.register('paragraph', { component: ParagraphStub });

    const store = new EditorStore(makeDoc());
    const { container } = render(
      <EditorProvider store={store} registry={registry}>
        <BlockChildren parentId="root" />
      </EditorProvider>,
    );

    // The crash in "flaky" never propagates out of render() and the
    // sibling paragraph is unaffected.
    expect(container.querySelector('.be-paragraph')?.textContent).toBe('sibling content');

    await waitFor(() => {
      expect(container.querySelector('.be-flaky-recovered')).not.toBeNull();
    });
    expect(container.querySelector('.be-paragraph')?.textContent).toBe('sibling content');
  });
});
