import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function renderDoc(doc) {
  const store = new EditorStore(doc);
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const { container } = render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
  return { store, container };
}

function selectCollapsedAt(runNode, offset) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.setEnd(textNode, offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// Regression: real editors (Notion, Word, Google Docs) split a block's text
// at the caret on Enter — text before stays, text after moves into the new
// block. This project's Enter used to always insert a *blank* sibling and
// leave the entire original text behind, silently dropping the split.
describe('Enter splits block content at the caret', () => {
  it('paragraph: splits "hello world" into "hello " and "world"', () => {
    const { store, container } = renderDoc({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello world', marks: {} }],
    });

    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 6); // right after "hello "
    fireEvent.keyDown(runNode, { key: 'Enter' });

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    expect(store.getRun('r1').value).toBe('hello ');

    const newBlockId = rootIds[1];
    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('paragraph');
    const newRunId = newBlock.contentIds[0];
    expect(store.getRun(newRunId).value).toBe('world');
  });

  it('heading: splits into a truncated heading and a new plain paragraph with the remainder', () => {
    const { store, container } = renderDoc({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['h1'], props: {} },
        { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r1'], props: { level: 2 } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'Section Title', marks: {} }],
    });

    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 'Section'.length);
    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getRun('r1').value).toBe('Section');
    const rootIds = store.getBlock('root').contentIds;
    const newBlock = store.getBlock(rootIds[1]);
    expect(newBlock.type).toBe('paragraph');
    expect(store.getRun(newBlock.contentIds[0]).value).toBe(' Title');
  });

  it('list item (no children): splits the title, new sibling item gets the remainder', () => {
    const { store, container } = renderDoc({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'buy milk', marks: {} }],
    });

    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 'buy'.length);
    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getRun('r1').value).toBe('buy');
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    const newItem = store.getBlock(rootIds[1]);
    expect(newItem.type).toBe('listItem');
    expect(store.getRun(newItem.props.titleRunIds[0]).value).toBe(' milk');
  });

  it('list item (with nested children): splits the title, new item becomes first child, existing children stay put', () => {
    const { store, container } = renderDoc({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['nested1'],
          props: { ordered: false, titleRunIds: ['r1'] },
        },
        {
          id: 'nested1',
          type: 'listItem',
          parentId: 'li1',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r-nested'] },
        },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'parent item', marks: {} },
        { id: 'r-nested', type: 'text', value: 'nested item', marks: {} },
      ],
    });

    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 'parent'.length);
    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getRun('r1').value).toBe('parent');
    const li1 = store.getBlock('li1');
    expect(li1.contentIds.length).toBe(2);
    const newItem = store.getBlock(li1.contentIds[0]); // first child, before the pre-existing nested item
    expect(newItem.type).toBe('listItem');
    expect(store.getRun(newItem.props.titleRunIds[0]).value).toBe(' item');
    expect(li1.contentIds[1]).toBe('nested1'); // pre-existing nested item untouched, still there
  });

  it('Enter at the very start of a block leaves one blank run behind, not zero (regression)', () => {
    // Caret at offset 0 means leftRuns comes back empty from the split — the
    // block staying behind must never end up with zero runs, or its
    // contentEditable region has no valid caret anchor and the next time
    // someone types into it, every keystroke mints a brand-new run instead
    // of updating one in place.
    const { store, container } = renderDoc({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    });

    const runNode = container.querySelector('[data-run-id="r1"]');
    selectCollapsedAt(runNode, 0);
    fireEvent.keyDown(runNode, { key: 'Enter' });

    const p1ContentIds = store.getBlock('p1').contentIds;
    expect(p1ContentIds.length).toBe(1);
    expect(store.getRun(p1ContentIds[0]).value).toBe('');

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    expect(store.getRun(store.getBlock(rootIds[1]).contentIds[0]).value).toBe('hello');
  });

  it('falls back to a blank sibling when there is no live caret (e.g. no DOM selection at all)', () => {
    const { store, container } = renderDoc({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello world', marks: {} }],
    });

    window.getSelection().removeAllRanges();
    const runNode = container.querySelector('[data-run-id="r1"]');
    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getRun('r1').value).toBe('hello world'); // untouched
    const rootIds = store.getBlock('root').contentIds;
    const newBlock = store.getBlock(rootIds[1]);
    const newRun = store.getRun(newBlock.contentIds[0]);
    expect(newRun.value).toBe(''); // blank, old behavior
  });
});
