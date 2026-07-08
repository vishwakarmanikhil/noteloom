import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function renderDoc(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

describe('paragraph: Enter on an empty last line exits a callout/toggle-heading body back to the outer document', () => {
  it('exits a callout: Enter on its empty sole paragraph creates a new paragraph AFTER the callout, not inside it', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['callout1'], props: {} },
        { id: 'callout1', type: 'callout', parentId: 'root', contentIds: ['p1'], props: { icon: '💡' } },
        { id: 'p1', type: 'paragraph', parentId: 'callout1', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getBlock('callout1').contentIds).toEqual(['p1']); // untouched, nothing added inside
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual(['callout1', rootIds[1]]);
    const newBlock = store.getBlock(rootIds[1]);
    expect(newBlock.type).toBe('paragraph');
    expect(newBlock.parentId).toBe('root');
  });

  it('exits a toggle heading: Enter on its empty last child paragraph creates a sibling of the toggle heading', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['th1'], props: {} },
        {
          id: 'th1',
          type: 'toggleHeading',
          parentId: 'root',
          contentIds: ['p1', 'p2'],
          props: { level: 2, collapsed: false, titleRunIds: ['r-title'] },
        },
        { id: 'p1', type: 'paragraph', parentId: 'th1', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'th1', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r-title', type: 'text', value: 'Section', marks: {} },
        { id: 'r1', type: 'text', value: 'first line', marks: {} },
        { id: 'r2', type: 'text', value: '', marks: {} }, // empty LAST child
      ],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r2"]');

    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getBlock('th1').contentIds).toEqual(['p1', 'p2']); // untouched
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual(['th1', rootIds[1]]);
    expect(store.getBlock(rootIds[1]).type).toBe('paragraph');
    expect(store.getBlock(rootIds[1]).parentId).toBe('root');
  });

  it('does NOT exit when the empty paragraph is not the LAST child (still nests a new line as usual)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['callout1'], props: {} },
        { id: 'callout1', type: 'callout', parentId: 'root', contentIds: ['p1', 'p2'], props: { icon: '💡' } },
        { id: 'p1', type: 'paragraph', parentId: 'callout1', contentIds: ['r1'], props: {} },
        { id: 'p2', type: 'paragraph', parentId: 'callout1', contentIds: ['r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: '', marks: {} }, // empty but NOT last
        { id: 'r2', type: 'text', value: 'second line', marks: {} },
      ],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    fireEvent.keyDown(runNode, { key: 'Enter' });

    // stayed inside the callout: a new paragraph was inserted alongside p1/p2
    expect(store.getBlock('callout1').contentIds.length).toBe(3);
    expect(store.getBlock('root').contentIds).toEqual(['callout1']);
  });

  it('does NOT exit when the last paragraph has real content (a real split still happens, staying inside)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['callout1'], props: {} },
        { id: 'callout1', type: 'callout', parentId: 'root', contentIds: ['p1'], props: { icon: '💡' } },
        { id: 'p1', type: 'paragraph', parentId: 'callout1', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'has content', marks: {} }],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getBlock('callout1').contentIds.length).toBe(2); // split into two paragraphs, both still inside
    expect(store.getBlock('root').contentIds).toEqual(['callout1']);
  });

  it('an ordinary top-level empty paragraph (no exitable parent) behaves exactly as before', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    fireEvent.keyDown(runNode, { key: 'Enter' });

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    expect(rootIds[0]).toBe('p1');
    expect(store.getBlock(rootIds[1]).type).toBe('paragraph');
  });
});
