import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'para1', 'li1'], props: {} },
      { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r-h1'], props: { level: 2 } },
      { id: 'para1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
      {
        id: 'li1',
        type: 'listItem',
        parentId: 'root',
        contentIds: ['li2'],
        props: { ordered: false, titleRunIds: ['r-li1'] },
      },
      {
        id: 'li2',
        type: 'listItem',
        parentId: 'li1',
        contentIds: [],
        props: { ordered: false, titleRunIds: ['r-li2'] },
      },
    ],
    runs: [
      { id: 'r-h1', type: 'text', value: 'Complaints', marks: {} },
      { id: 'r-p1', type: 'text', value: 'hello world', marks: {} },
      { id: 'r-li1', type: 'text', value: 'top item', marks: {} },
      { id: 'r-li2', type: 'text', value: 'nested item', marks: {} },
    ],
  };
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

describe('built-in block types render via the shared container/leaf model', () => {
  it('renders heading, paragraph, and nested list items from one recursive tree walk', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    expect(container.querySelector('h2').textContent).toBe('Complaints');
    expect(container.querySelector('.be-paragraph').textContent).toBe('hello world');

    const listItems = container.querySelectorAll('.be-list-item');
    expect(listItems.length).toBe(2); // top-level + nested, both rendered by the same component
    expect(container.textContent).toContain('top item');
    expect(container.textContent).toContain('nested item');
  });

  it('typing into a paragraph updates only that run in the store, DOM reflects it', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const runNode = container.querySelector('[data-run-id="r-p1"]');
    runNode.textContent = 'hello world!';
    fireEvent.input(runNode);

    expect(store.getRun('r-p1').value).toBe('hello world!');
  });

  it('pressing Enter in a paragraph inserts a new sibling paragraph after it', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const runNode = container.querySelector('[data-run-id="r-p1"]');
    fireEvent.keyDown(runNode, { key: 'Enter' });

    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds.length).toBe(4);
    const newBlockId = rootContentIds[rootContentIds.indexOf('para1') + 1];
    expect(store.getBlock(newBlockId).type).toBe('paragraph');
  });
});
