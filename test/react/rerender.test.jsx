import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { useBlock } from '../../src/react/useBlock.js';
import { useBlockChildren } from '../../src/react/useBlockChildren.js';
import { updateRun, insertBlock } from '../../src/store/operations.js';

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

function BlockProbe({ id, renderCounts }) {
  const block = useBlock(id);
  renderCounts[id] = (renderCounts[id] ?? 0) + 1;
  return <div data-testid={id}>{block?.type}</div>;
}

function ChildrenProbe({ parentId, renderCounts }) {
  const contentIds = useBlockChildren(parentId);
  renderCounts.children = (renderCounts.children ?? 0) + 1;
  return <div data-testid="children">{contentIds.join(',')}</div>;
}

describe('React bindings: per-block re-render isolation', () => {
  it('editing one block does not re-render a sibling subscribed via useBlock', () => {
    const store = new EditorStore(makeDoc());
    const renderCounts = {};

    render(
      <EditorProvider store={store} registry={{}}>
        <BlockProbe id="p1" renderCounts={renderCounts} />
        <BlockProbe id="p2" renderCounts={renderCounts} />
      </EditorProvider>,
    );

    expect(renderCounts.p1).toBe(1);
    expect(renderCounts.p2).toBe(1);

    act(() => {
      store.applyOperation(updateRun('r2', { value: 'world!' }));
    });

    // p2's own block object is untouched by a run-only update, and p1
    // subscribes only to its own id — neither should re-render.
    expect(renderCounts.p1).toBe(1);
    expect(renderCounts.p2).toBe(1);
  });

  it('useBlockChildren only re-renders on structural change, not on a child leaf edit', () => {
    const store = new EditorStore(makeDoc());
    const renderCounts = {};

    render(
      <EditorProvider store={store} registry={{}}>
        <ChildrenProbe parentId="root" renderCounts={renderCounts} />
      </EditorProvider>,
    );

    expect(renderCounts.children).toBe(1);

    act(() => {
      store.applyOperation(updateRun('r1', { value: 'changed' }));
    });
    expect(renderCounts.children).toBe(1); // unchanged: no structural change happened

    act(() => {
      store.applyOperation(
        insertBlock({ id: 'p3', type: 'paragraph', parentId: 'root', contentIds: [], props: {} }, 'root', 2),
      );
    });
    expect(renderCounts.children).toBe(2); // contentIds reference changed
  });
});
