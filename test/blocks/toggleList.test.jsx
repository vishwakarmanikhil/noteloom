import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { mergeListItemOrOutdent } from '../../src/blocks/listItem/mergeCommands.js';
import { createListItemBlock } from '../../src/blocks/listItem/createListItemBlock.js';
import { serializeBlockRange, remapSubtreeIds } from '../../src/clipboard/serialize.js';

function makeDocWithToggle({ collapsed = false } = {}) {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['t1'], props: {} },
      {
        id: 't1',
        type: 'listItem',
        parentId: 'root',
        contentIds: ['child1'],
        props: { ordered: false, collapsed, titleRunIds: ['r-t1'] },
      },
      { id: 'child1', type: 'paragraph', parentId: 't1', contentIds: ['r-child1'], props: {} },
    ],
    runs: [
      { id: 'r-t1', type: 'text', value: 'toggle title', marks: {} },
      { id: 'r-child1', type: 'text', value: 'hidden content', marks: {} },
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

describe('createListItemBlock: a toggle is always seeded with one empty paragraph child (regression: dead-end childless toggles)', () => {
  it('seeds a paragraph child when collapsed is set, unlike a plain bullet/todo', () => {
    const toggleResult = createListItemBlock({ collapsed: false })('root');
    expect(toggleResult.block.contentIds.length).toBe(1);
    expect(toggleResult.subtreeBlocks).toHaveLength(1);
    expect(toggleResult.subtreeBlocks[0].type).toBe('paragraph');
    expect(toggleResult.subtreeBlocks[0].parentId).toBe(toggleResult.block.id);
    expect(toggleResult.runs.length).toBe(2); // the title's blank run + the seeded child's blank run

    const bulletResult = createListItemBlock({})('root');
    expect(bulletResult.block.contentIds).toEqual([]);
    expect(bulletResult.subtreeBlocks).toEqual([]);
  });
});

describe('toggle list item: rendering', () => {
  it('renders a disclosure triangle marker instead of a bullet/checkbox', () => {
    const store = new EditorStore(makeDocWithToggle());
    const { container } = renderDoc(store);

    const item = container.querySelector('[data-block-id="t1"]');
    expect(item.querySelector('.be-list-toggle-marker')).not.toBeNull();
    expect(item.querySelector('.be-list-marker')).toBeNull();
    expect(item.querySelector('.be-list-checkbox')).toBeNull();
  });

  it('shows children when expanded (collapsed: false)', () => {
    const store = new EditorStore(makeDocWithToggle({ collapsed: false }));
    const { container } = renderDoc(store);

    expect(container.querySelector('[data-block-id="child1"]')).not.toBeNull();
    expect(container.textContent).toContain('hidden content');
    expect(container.querySelector('.be-list-toggle-marker').getAttribute('aria-expanded')).toBe('true');
  });

  it('hides children (no DOM at all) when collapsed: true', () => {
    const store = new EditorStore(makeDocWithToggle({ collapsed: true }));
    const { container } = renderDoc(store);

    expect(container.querySelector('[data-block-id="child1"]')).toBeNull();
    expect(container.textContent).not.toContain('hidden content');
    expect(container.querySelector('.be-list-toggle-marker').getAttribute('aria-expanded')).toBe('false');
  });

  it('the triangle is never disabled — clicking a childless toggle bootstraps its first child instead of being a dead end (regression)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['t1'], props: {} },
        { id: 't1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, collapsed: false, titleRunIds: ['r1'] } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'empty toggle', marks: {} }],
    });
    const { container } = renderDoc(store);
    const marker = container.querySelector('.be-list-toggle-marker');
    expect(marker.disabled).toBe(false);
    expect(marker.getAttribute('aria-label')).toBe('Add content to toggle');

    fireEvent.click(marker);

    const childId = store.getBlock('t1').contentIds[0];
    expect(childId).toBeDefined();
    expect(store.getBlock(childId).type).toBe('paragraph');
    expect(store.getBlock('t1').props.collapsed).toBe(false);
    expect(container.querySelector('.be-list-item-children .be-paragraph')).not.toBeNull();
  });
});

describe('toggle list item: clicking the triangle toggles collapsed, without touching the store\'s child data', () => {
  it('collapses on click, and the child block still exists in the store (only the DOM is gone)', () => {
    const rawStore = new EditorStore(makeDocWithToggle({ collapsed: false }));
    const store = new History(rawStore);
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-list-toggle-marker'));

    expect(store.getBlock('t1').props.collapsed).toBe(true);
    expect(store.getBlock('child1')).toBeDefined(); // data intact, not deleted
    expect(store.getRun('r-child1').value).toBe('hidden content');
    expect(container.querySelector('[data-block-id="child1"]')).toBeNull(); // just not rendered

    act(() => store.undo());
    expect(store.getBlock('t1').props.collapsed).toBe(false);
  });

  it('expands again on a second click', () => {
    const store = new EditorStore(makeDocWithToggle({ collapsed: true }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-list-toggle-marker'));
    expect(store.getBlock('t1').props.collapsed).toBe(false);
    expect(container.querySelector('[data-block-id="child1"]')).not.toBeNull();
  });
});

describe('toggle list item: Enter inheritance (new sibling/child stays a toggle, matching how todo already inherits checked)', () => {
  it('Enter on a childless toggle title creates a new sibling toggle (collapsed: false)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['t1'], props: {} },
        { id: 't1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, collapsed: false, titleRunIds: ['r1'] } },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'toggle text', marks: {} }],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    // caret at the end so the split creates a genuinely new (empty) sibling
    const range = document.createRange();
    range.setStart(runNode.firstChild, 'toggle text'.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    fireEvent.keyDown(runNode, { key: 'Enter' });

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    const newId = rootIds[1];
    expect(store.getBlock(newId).type).toBe('listItem');
    expect(store.getBlock(newId).props.collapsed).toBe(false); // inherited toggle-ness, matches todo's inheritance

    // regression: the new toggle must NOT be another childless dead end —
    // it's seeded with one empty paragraph child, same as callout/toggleHeading
    expect(store.getBlock(newId).contentIds.length).toBe(1);
    const newChildId = store.getBlock(newId).contentIds[0];
    expect(store.getBlock(newChildId).type).toBe('paragraph');
    expect(container.querySelector(`[data-block-id="${newId}"] .be-list-toggle-marker`).disabled).toBe(false);
  });

  it('Enter on a toggle title still creates a SIBLING even when it already has nested children (regression: was wrongly nesting as first child)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['t1'], props: {} },
        {
          id: 't1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['child1'],
          props: { ordered: false, collapsed: false, titleRunIds: ['r1'] },
        },
        { id: 'child1', type: 'paragraph', parentId: 't1', contentIds: ['r-child1'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'toggle text', marks: {} },
        { id: 'r-child1', type: 'text', value: 'existing content', marks: {} },
      ],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    const range = document.createRange();
    range.setStart(runNode.firstChild, 'toggle text'.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    fireEvent.keyDown(runNode, { key: 'Enter' });

    // t1 must still have exactly its original one child (untouched) — the
    // new item landed at the ROOT level as t1's own sibling, not nested
    // inside t1 alongside/before "existing content".
    expect(store.getBlock('t1').contentIds).toEqual(['child1']);
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    expect(rootIds[0]).toBe('t1');
    expect(store.getBlock(rootIds[1]).type).toBe('listItem');
    expect(store.getBlock(rootIds[1]).parentId).toBe('root');
  });
});

describe('toggle list item: Backspace on an empty title never deletes a non-empty subtree (regression)', () => {
  it('an empty toggle title with real nested children is left alone (safe no-op), not cascade-deleted', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['before', 't1'], props: {} },
        { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
        { id: 't1', type: 'listItem', parentId: 'root', contentIds: ['child1'], props: { ordered: false, collapsed: false, titleRunIds: ['r1'] } },
        { id: 'child1', type: 'paragraph', parentId: 't1', contentIds: ['r-child1'], props: {} },
      ],
      runs: [
        { id: 'r-before', type: 'text', value: 'before', marks: {} },
        { id: 'r1', type: 'text', value: '', marks: {} }, // empty title
        { id: 'r-child1', type: 'text', value: 'important content', marks: {} },
      ],
    });

    const result = mergeListItemOrOutdent(store, 't1');

    expect(result).toBeNull(); // safe no-op — previously this branch deleted the whole subtree
    expect(store.getBlock('t1')).toBeDefined();
    expect(store.getBlock('child1')).toBeDefined();
    expect(store.getRun('r-child1').value).toBe('important content');
  });

  it('an empty toggle title with NO children is still deleted normally (unaffected by the fix)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['before', 't1'], props: {} },
        { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
        { id: 't1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, collapsed: false, titleRunIds: ['r1'] } },
      ],
      runs: [
        { id: 'r-before', type: 'text', value: 'before', marks: {} },
        { id: 'r1', type: 'text', value: '', marks: {} },
      ],
    });

    const result = mergeListItemOrOutdent(store, 't1');
    expect(result).toEqual({ focusBlockId: 'before', needsRefocus: true });
    expect(store.getBlock('t1')).toBeUndefined();
  });
});

describe('toggle list item: clipboard round-trip preserves collapsed children even when visually collapsed', () => {
  it('same-editor copy of a collapsed toggle still includes its hidden child in the subtree JSON', () => {
    const store = new EditorStore(makeDocWithToggle({ collapsed: true }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const { json } = serializeBlockRange(store, registry, ['t1']);
    const parsed = JSON.parse(json).blocks[0];
    const { block, subtreeBlocks, runs } = remapSubtreeIds(parsed);

    expect(block.props.collapsed).toBe(true);
    expect(subtreeBlocks).toHaveLength(1);
    expect(subtreeBlocks[0].type).toBe('paragraph');
    expect(runs.some((r) => r.value === 'hidden content')).toBe(true);
  });

  it('toPlainText/toHTML still include a collapsed toggle\'s children (only the live DOM hides them, not serialization)', () => {
    const store = new EditorStore(makeDocWithToggle({ collapsed: true }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const block = store.getBlock('t1');
    const html = registry.get('listItem').toHTML(block, { store, registry });
    expect(html).toContain('hidden content');
  });
});

describe('toggle list item: indent/outdent work the same as any other list item', () => {
  it('Tab nests the toggle under its previous sibling', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 't1'], props: {} },
        { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r1'] } },
        { id: 't1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, collapsed: false, titleRunIds: ['r2'] } },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'item', marks: {} },
        { id: 'r2', type: 'text', value: 'toggle', marks: {} },
      ],
    });
    const { container } = renderDoc(store);
    const runNode = container.querySelector('[data-run-id="r2"]');

    fireEvent.keyDown(runNode, { key: 'Tab' });

    expect(store.getBlock('li1').contentIds).toEqual(['t1']);
    expect(store.getBlock('t1').props.collapsed).toBe(false); // unaffected by reparenting
  });
});
