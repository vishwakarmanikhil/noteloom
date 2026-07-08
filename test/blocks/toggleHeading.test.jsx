import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { insertBlock } from '../../src/store/operations.js';
import { createToggleHeadingBlock } from '../../src/blocks/toggleHeading/createToggleHeadingBlock.js';
import { mergeToggleHeadingOrNoop } from '../../src/blocks/toggleHeading/mergeCommands.js';
import { serializeBlockRange, remapSubtreeIds } from '../../src/clipboard/serialize.js';
import { walkDomToBlocks } from '../../src/clipboard/domWalk.js';

function emptyDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function insertAtRoot(store, factory, index = 0) {
  const { block, runs = [], subtreeBlocks = [] } = factory('root');
  store.applyOperation(insertBlock(block, 'root', index, { blocks: [block, ...subtreeBlocks], runs }));
  return block.id;
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

function collapseCaretAt(runNode, offset) {
  const range = document.createRange();
  range.setStart(runNode.firstChild, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('toggle heading: rendering', () => {
  it('renders as an hN tag with a disclosure marker and one seeded empty paragraph child', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }));
    const { container } = renderDoc(store);

    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    expect(wrapper.querySelector('h2.be-toggle-heading-title')).not.toBeNull();
    expect(wrapper.querySelector('.be-toggle-heading-marker')).not.toBeNull();
    expect(wrapper.querySelector('.be-toggle-heading-children .be-paragraph')).not.toBeNull();
  });

  it('hides children when collapsed: true, without deleting them from the store', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2, collapsed: true }));
    const { container } = renderDoc(store);

    expect(container.querySelector('.be-toggle-heading-children')).toBeNull();
    const childId = store.getBlock(id).contentIds[0];
    expect(store.getBlock(childId)).toBeDefined();
  });

  it('the marker is disabled only when there truly are no children (not the seeded-child default case)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }));
    const { container } = renderDoc(store);
    expect(container.querySelector(`[data-block-id="${id}"] .be-toggle-heading-marker`).disabled).toBe(false);
  });

  it('shows the empty-title placeholder text', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 1 }));
    const { container } = renderDoc(store);
    const title = container.querySelector(`[data-block-id="${id}"] .be-toggle-heading-title`);
    expect(title.getAttribute('data-empty')).toBe('');
    expect(title.getAttribute('data-placeholder')).toBe('Toggle heading 1');
  });
});

describe('toggle heading: clicking the marker toggles collapsed without touching child data', () => {
  it('collapses/expands and is undo-able', () => {
    const rawStore = new EditorStore(emptyDoc());
    const id = insertAtRoot(rawStore, createToggleHeadingBlock({ level: 2 }));
    const store = new History(rawStore);
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-toggle-heading-marker'));
    expect(store.getBlock(id).props.collapsed).toBe(true);
    expect(container.querySelector('.be-toggle-heading-children')).toBeNull();

    act(() => store.undo());
    expect(store.getBlock(id).props.collapsed).toBe(false);
  });

  it('is never disabled — clicking a childless toggle heading bootstraps its first child instead of being a dead end (regression)', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }));
    store.applyOperation({ type: 'setBlockContentIds', blockId: id, contentIds: [] }); // simulate a childless toggle heading
    const { container } = renderDoc(store);

    const marker = container.querySelector('.be-toggle-heading-marker');
    expect(marker.disabled).toBe(false);
    expect(marker.getAttribute('aria-label')).toBe('Add content to section');

    fireEvent.click(marker);

    const childId = store.getBlock(id).contentIds[0];
    expect(childId).toBeDefined();
    expect(store.getBlock(childId).type).toBe('paragraph');
    expect(store.getBlock(id).props.collapsed).toBe(false);
  });
});

describe('toggle heading: Enter inserts a first child once it has one, else a plain sibling', () => {
  it('Enter at the end of the title (already has the seeded child) inserts a new FIRST child, not a sibling', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }));
    const { container } = renderDoc(store);
    const titleRunId = store.getBlock(id).props.titleRunIds[0];
    const runNode = container.querySelector(`[data-run-id="${titleRunId}"]`);

    fireEvent.keyDown(runNode, { key: 'Enter' });

    expect(store.getBlock('root').contentIds).toEqual([id]); // still just the toggle heading at root
    expect(store.getBlock(id).contentIds.length).toBe(2); // new paragraph inserted before the seeded one
  });
});

describe('toggle heading: Backspace-at-start is safe (regression-consistent with the listItem fix)', () => {
  it('an empty title with real nested content is left alone, not cascade-deleted', () => {
    const store = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(store, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }), 1);
    const childId = store.getBlock(id).contentIds[0];
    const childRunId = store.getBlock(childId).contentIds[0];
    store.applyOperation({ type: 'updateRun', id: childRunId, patch: { value: 'important content' } });

    const result = mergeToggleHeadingOrNoop(store, id);

    expect(result).toBeNull();
    expect(store.getBlock(id)).toBeDefined();
    expect(store.getBlock(childId)).toBeDefined();
    expect(store.getRun(childRunId).value).toBe('important content');
    expect(store.getBlock('root').contentIds).toEqual([beforeId, id]);
  });

  it('an empty title with literally no children at all is removed', () => {
    const store = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(store, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }), 1);
    store.applyOperation({ type: 'setBlockContentIds', blockId: id, contentIds: [] });

    const result = mergeToggleHeadingOrNoop(store, id);

    expect(result).toEqual({ focusBlockId: beforeId, needsRefocus: true });
    expect(store.getBlock(id)).toBeUndefined();
  });

  it('an empty title whose body is still just the untouched seeded paragraph is ALSO removed (regression: was permanently undeletable)', () => {
    // Before the fix, isBodyEmpty didn't exist — the check required
    // literally zero children, which createToggleHeadingBlock's own
    // seeded child made impossible to satisfy in practice, so a toggle
    // heading could never actually be deleted via Backspace at all.
    const store = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(store, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }), 1); // still has its seeded child, untouched
    const childId = store.getBlock(id).contentIds[0];

    const result = mergeToggleHeadingOrNoop(store, id);

    expect(result).toEqual({ focusBlockId: beforeId, needsRefocus: true });
    expect(store.getBlock(id)).toBeUndefined();
    expect(store.getBlock(childId)).toBeUndefined(); // its seeded child went with it
    expect(store.getBlock('root').contentIds).toEqual([beforeId]);
  });

  it('is replaced with a blank paragraph, not left with nothing, when it is the only block in the document', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }));

    const result = mergeToggleHeadingOrNoop(store, id);

    expect(store.getBlock(id)).toBeUndefined();
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(1);
    expect(store.getBlock(rootIds[0]).type).toBe('paragraph');
    expect(result).toEqual({ focusBlockId: rootIds[0], needsRefocus: true });
  });

  it('end-to-end via the keyboard: Backspace on the seeded child pops back to the title, a second Backspace removes the whole toggle heading', () => {
    const rawStore = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(rawStore, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const id = insertAtRoot(rawStore, createToggleHeadingBlock({ level: 2 }), 1);
    const store = new History(rawStore);
    const { container } = renderDoc(store);

    const childId = store.getBlock(id).contentIds[0];
    const childRunId = store.getBlock(childId).contentIds[0];
    const childRunNode = container.querySelector(`[data-run-id="${childRunId}"]`);
    collapseCaretAt(childRunNode, 0);
    fireEvent.keyDown(childRunNode, { key: 'Backspace' });

    // step 1: nothing deleted yet, just popped back out to the title
    expect(store.getBlock(id)).toBeDefined();
    expect(store.getBlock(childId)).toBeDefined();

    const titleRunId = store.getBlock(id).props.titleRunIds[0];
    const titleRunNode = container.querySelector(`[data-run-id="${titleRunId}"]`);
    collapseCaretAt(titleRunNode, 0);
    fireEvent.keyDown(titleRunNode, { key: 'Backspace' });

    // step 2: the whole toggle heading is now gone
    expect(store.getBlock(id)).toBeUndefined();
    expect(store.getBlock('root').contentIds).toEqual([beforeId]);

    act(() => store.undo());
    expect(store.getBlock(id)).toBeDefined();
  });
});

describe('toggle heading: clipboard round-trip via semantic <details>/<summary>', () => {
  it('toHTML emits <details open><summary><h2>...', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2 }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    store.applyOperation({ type: 'updateRun', id: store.getBlock(id).props.titleRunIds[0], patch: { value: 'Section' } });

    const html = registry.get('toggleHeading').toHTML(store.getBlock(id), { store, registry });
    expect(html).toBe('<details open><summary><h2>Section</h2></summary><p></p></details>');
  });

  it('a collapsed toggle heading omits the "open" attribute', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 3, collapsed: true }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('toggleHeading').toHTML(store.getBlock(id), { store, registry });
    expect(html.startsWith('<details><summary><h3>')).toBe(true);
  });

  it('walkDomToBlocks parses <details>/<summary> back into a toggleHeading with its paragraph children', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks(
      '<details open><summary><h2>My section</h2></summary><p>line one</p><p>line two</p></details>',
      registry,
    );
    expect(inserts).toHaveLength(1);
    const { block, runs, subtreeBlocks } = inserts[0];
    expect(block.type).toBe('toggleHeading');
    expect(block.props.level).toBe(2);
    expect(block.props.collapsed).toBe(false);
    expect(runs.find((r) => r.value === 'My section')).toBeDefined();
    expect(subtreeBlocks).toHaveLength(2);
    expect(subtreeBlocks.every((b) => b.type === 'paragraph')).toBe(true);
  });

  it('a <details> with no "open" attribute parses as collapsed', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inserts = walkDomToBlocks('<details><summary><h2>Closed</h2></summary><p>hidden</p></details>', registry);
    expect(inserts[0].block.props.collapsed).toBe(true);
  });

  it('same-editor copy preserves collapsed state and nested children losslessly', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createToggleHeadingBlock({ level: 2, collapsed: true }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const { json } = serializeBlockRange(store, registry, [id]);
    const { block, subtreeBlocks } = remapSubtreeIds(JSON.parse(json).blocks[0]);

    expect(block.props.collapsed).toBe(true);
    expect(subtreeBlocks).toHaveLength(1);
    expect(subtreeBlocks[0].type).toBe('paragraph');
  });
});
