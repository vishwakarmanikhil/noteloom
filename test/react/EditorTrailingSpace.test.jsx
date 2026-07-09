import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { EditorTrailingSpace } from '../../src/react/EditorTrailingSpace.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function renderDoc(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
      <EditorTrailingSpace />
    </EditorProvider>,
  );
}

describe('EditorTrailingSpace', () => {
  it('clicking it when the last block is already a paragraph does not create a new block', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    });
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-trailing-space'));

    expect(store.getBlock('root').contentIds).toEqual(['p1']); // no new sibling
  });

  it('clicking it when the last block is NOT a paragraph (e.g. a heading) inserts and focuses a new paragraph after it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['h1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r1'], props: { level: 1 } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'Title', marks: {} }],
    });
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-trailing-space'));

    const contentIds = store.getBlock('root').contentIds;
    expect(contentIds.length).toBe(2);
    expect(contentIds[0]).toBe('h1');
    expect(store.getBlock(contentIds[1]).type).toBe('paragraph');
  });

  it('clicking it on a completely empty document backfills a paragraph via ensureRootNonEmpty', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-trailing-space'));

    const contentIds = store.getBlock('root').contentIds;
    expect(contentIds.length).toBe(1);
    expect(store.getBlock(contentIds[0]).type).toBe('paragraph');
  });

  it('renders with the given minHeight', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    });
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = render(
      <EditorProvider store={store} registry={registry}>
        <EditorTrailingSpace minHeight={222} />
      </EditorProvider>,
    );
    expect(container.querySelector('.be-trailing-space').style.minHeight).toBe('222px');
  });
});
