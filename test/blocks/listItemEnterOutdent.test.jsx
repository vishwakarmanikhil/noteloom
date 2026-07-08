import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
      {
        id: 'li1',
        type: 'listItem',
        parentId: 'root',
        contentIds: ['li2'],
        props: { ordered: false, titleRunIds: ['r-li1'] },
      },
      {
        id: 'li2', // nested, empty
        type: 'listItem',
        parentId: 'li1',
        contentIds: [],
        props: { ordered: false, titleRunIds: ['r-li2'] },
      },
    ],
    runs: [
      { id: 'r-li1', type: 'text', value: 'top item', marks: {} },
      { id: 'r-li2', type: 'text', value: '', marks: {} },
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

describe('ListItemBlock Enter on an empty nested item (regression)', () => {
  it('outdents the item instead of creating another empty nested item', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const nestedRun = container.querySelector('[data-run-id="r-li2"]');
    fireEvent.keyDown(nestedRun, { key: 'Enter' });

    // li2 promoted to be a sibling of li1 under root, not left nested
    expect(store.getBlock('li1').contentIds).toEqual([]);
    expect(store.getBlock('root').contentIds).toEqual(['li1', 'li2']);
    expect(store.getBlock('li2').parentId).toBe('root');

    // no new list item was created
    expect(Object.keys(store.toJSON().blocks).length ?? store.toJSON().blocks.length).toBe(3);
  });

  it('still creates a new sibling item for Enter on a non-empty nested item', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation({ type: 'updateRun', id: 'r-li2', patch: { value: 'not empty' } });
    const { container } = renderDoc(store);

    const nestedRun = container.querySelector('[data-run-id="r-li2"]');
    fireEvent.keyDown(nestedRun, { key: 'Enter' });

    // li2 stays nested under li1, and a new sibling was created alongside it
    expect(store.getBlock('li1').contentIds.length).toBe(2);
    expect(store.getBlock('li1').contentIds[0]).toBe('li2');
    expect(store.getBlock(store.getBlock('li1').contentIds[1]).type).toBe('listItem');
  });

  it('creates a normal new sibling for Enter on a NON-empty top-level item', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'not empty', marks: {} }],
    });
    const { container } = renderDoc(store);

    const run = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(run, { key: 'Enter' });

    expect(store.getBlock('root').contentIds.length).toBe(2);
    expect(store.getBlock(store.getBlock('root').contentIds[1]).type).toBe('listItem');
  });

  it('regression: Enter on an EMPTY top-level (last) item exits the list, replacing it with a paragraph', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderDoc(store);

    const run = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(run, { key: 'Enter' });

    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds.length).toBe(1); // replaced in place, not appended
    expect(store.getBlock('li1')).toBeUndefined(); // the list item is gone
    expect(store.getBlock(rootContentIds[0]).type).toBe('paragraph');
  });

  it('does not exit the list if the empty top-level item still has nested children (inserts a new first child instead)', () => {
    const store = new EditorStore(makeDoc()); // li1 has nested li2
    store.applyOperation({ type: 'updateRun', id: 'r-li1', patch: { value: '' } }); // make li1's own title empty
    const { container } = renderDoc(store);

    const run = container.querySelector('[data-run-id="r-li1"]');
    fireEvent.keyDown(run, { key: 'Enter' });

    // li1 must still exist (has nested children, so it's not eligible to exit the list)
    expect(store.getBlock('li1')).toBeDefined();
    expect(store.getBlock('li1').contentIds.length).toBe(2);
    expect(store.getBlock('li1').contentIds[1]).toBe('li2'); // existing child pushed down, not replaced
    expect(store.getBlock(store.getBlock('li1').contentIds[0]).type).toBe('listItem');
  });
});

describe('ListItemBlock Enter on an item with nested children (regression: insert position)', () => {
  it('inserts the new item as the first nested child, not as a sibling after the whole nested subtree', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['nested1', 'nested2'],
          props: { ordered: false, titleRunIds: ['r-li1'] },
        },
        {
          id: 'nested1',
          type: 'listItem',
          parentId: 'li1',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r-n1'] },
        },
        {
          id: 'nested2',
          type: 'listItem',
          parentId: 'li1',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r-n2'] },
        },
      ],
      runs: [
        { id: 'r-li1', type: 'text', value: 'item i am here', marks: {} },
        { id: 'r-n1', type: 'text', value: 'nested item 1', marks: {} },
        { id: 'r-n2', type: 'text', value: 'nested item 2', marks: {} },
      ],
    });
    const { container } = renderDoc(store);

    const run = container.querySelector('[data-run-id="r-li1"]');
    fireEvent.keyDown(run, { key: 'Enter' });

    // root itself gets no new sibling — li1 is still root's only child
    expect(store.getBlock('root').contentIds).toEqual(['li1']);

    // the new item is li1's FIRST child, ahead of the pre-existing nested items
    const li1ContentIds = store.getBlock('li1').contentIds;
    expect(li1ContentIds.length).toBe(3);
    expect(li1ContentIds[1]).toBe('nested1');
    expect(li1ContentIds[2]).toBe('nested2');
    const newItemId = li1ContentIds[0];
    expect(store.getBlock(newItemId).type).toBe('listItem');
    expect(store.getBlock(newItemId).props.titleRunIds.length).toBe(1);
  });
});
