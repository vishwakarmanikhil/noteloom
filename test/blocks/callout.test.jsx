import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { insertBlock, removeBlock } from '../../src/store/operations.js';
import { createCalloutBlock, DEFAULT_CALLOUT_ICON } from '../../src/blocks/callout/createCalloutBlock.js';
import { serializeBlockRange, remapSubtreeIds } from '../../src/clipboard/serialize.js';
import { deleteOverBlockRange } from '../../src/inline/deleteCommands.js';
import { mergeWithPreviousOrDelete } from '../../src/blocks/shared/mergeCommands.js';

function emptyDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function insertAtRoot(store, factory, index = 0) {
  const { block, runs = [], subtreeBlocks = [] } = factory('root');
  store.applyOperation(insertBlock(block, 'root', index, { blocks: [block, ...subtreeBlocks], runs }));
  return block.id;
}

function renderDoc(store, registry) {
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" />
    </EditorProvider>,
  );
}

describe('callout block: renders as a plain container (same mechanism as layoutColumn/page)', () => {
  it('renders the icon button and one empty paragraph child, ready to type into', () => {
    const store = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(store, createCalloutBlock());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const wrapper = container.querySelector('[data-block-id="' + calloutId + '"]');
    expect(wrapper.className).toBe('be-callout');
    expect(wrapper.querySelector('.be-callout-icon').textContent).toBe(DEFAULT_CALLOUT_ICON);
    expect(wrapper.querySelector('.be-callout-content .be-paragraph')).not.toBeNull();
    expect(wrapper.querySelector('.be-callout-content [data-run-id]')).not.toBeNull();
  });

  it('a custom icon passed to the factory is used instead of the default', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createCalloutBlock({ icon: '⚠️' }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    expect(container.querySelector('.be-callout-icon').textContent).toBe('⚠️');
  });

  it('typing into the child paragraph updates only that run, same as any other paragraph', () => {
    const store = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(store, createCalloutBlock());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const runNode = container.querySelector('[data-block-id="' + calloutId + '"] [data-run-id]');
    runNode.textContent = 'heads up';
    fireEvent.input(runNode);

    const callout = store.getBlock(calloutId);
    const childId = callout.contentIds[0];
    const child = store.getBlock(childId);
    expect(store.getRun(child.contentIds[0]).value).toBe('heads up');
  });

  it('clicking the icon opens an editable input; committing a new emoji updates props.icon (undo-able)', () => {
    const rawStore = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(rawStore, createCalloutBlock());
    const store = new History(rawStore);
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    const iconButton = container.querySelector('.be-callout-icon');
    fireEvent.click(iconButton);
    const input = container.querySelector('.be-callout-icon-input');
    expect(input).not.toBeNull();

    fireEvent.change(input, { target: { value: '🔥' } });
    fireEvent.blur(input);

    expect(store.getBlock(calloutId).props.icon).toBe('🔥');

    act(() => store.undo());
    expect(store.getBlock(calloutId).props.icon).toBe(DEFAULT_CALLOUT_ICON);
  });

  it('blank input on blur discards the edit and keeps the previous icon', () => {
    const store = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(store, createCalloutBlock());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = renderDoc(store, registry);

    fireEvent.click(container.querySelector('.be-callout-icon'));
    const input = container.querySelector('.be-callout-icon-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    expect(store.getBlock(calloutId).props.icon).toBe(DEFAULT_CALLOUT_ICON);
  });
});

describe('callout block: clipboard round-trip', () => {
  it('toHTML wraps the icon and serialized children in a callout div', () => {
    const store = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(store, createCalloutBlock({ icon: '📌' }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('callout').toHTML(store.getBlock(calloutId), { store, registry });
    expect(html).toContain('class="callout"');
    expect(html).toContain('data-icon="📌"');
    expect(html).toContain('<div class="callout-icon">📌</div>');
    expect(html).toContain('<p>'); // the child paragraph's own toHTML
  });

  it('toPlainText prefixes the icon before the flattened child text', () => {
    const store = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(store, createCalloutBlock({ icon: '📌' }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const callout = store.getBlock(calloutId);
    const childId = callout.contentIds[0];
    const child = store.getBlock(childId);
    store.applyOperation({ type: 'updateRun', id: child.contentIds[0], patch: { value: 'remember this' } });

    const text = registry.get('callout').toPlainText(store.getBlock(calloutId), { store, registry });
    expect(text).toBe('📌 remember this');
  });

  it('same-editor copy/paste (the generic subtree JSON path) round-trips a callout losslessly, with fresh ids', () => {
    const store = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(store, createCalloutBlock({ icon: '📌' }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const { json } = serializeBlockRange(store, registry, [calloutId]);
    const parsed = JSON.parse(json);
    const { block: pastedCallout, runs, subtreeBlocks } = remapSubtreeIds(parsed.blocks[0]);

    expect(pastedCallout.id).not.toBe(calloutId); // remapped, not colliding with the original
    expect(pastedCallout.type).toBe('callout');
    expect(pastedCallout.props.icon).toBe('📌');
    expect(subtreeBlocks.length).toBe(1); // the child paragraph
    expect(subtreeBlocks[0].type).toBe('paragraph');
    expect(runs.length).toBe(1);
  });
});

describe('callout block: cross-block selection delete removes it as one unit', () => {
  it('deleteOverBlockRange spanning a callout sibling removes the whole callout subtree', () => {
    const store = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(store, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const calloutId = insertAtRoot(store, createCalloutBlock({ icon: '📌' }), 1);
    const afterId = insertAtRoot(
      store,
      () => ({
        block: { id: 'after', type: 'paragraph', parentId: 'root', contentIds: ['r-after'], props: {} },
        runs: [{ id: 'r-after', type: 'text', value: 'after', marks: {} }],
      }),
      2,
    );

    const callout = store.getBlock(calloutId);
    const childId = callout.contentIds[0];
    const child = store.getBlock(childId);

    // Spans from the end of "before" through the start of "after" — the
    // callout sits entirely inside that range as a whole sibling block.
    deleteOverBlockRange(store, {
      blockIds: [beforeId, calloutId, afterId],
      startBlockId: beforeId,
      startRunId: 'r-before',
      startOffset: 'before'.length,
      endBlockId: afterId,
      endRunId: 'r-after',
      endOffset: 0,
    });

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual([beforeId]); // callout and "after" gone, merged into one surviving block
    expect(store.getBlock(calloutId)).toBeUndefined();
    expect(store.getBlock(childId)).toBeUndefined(); // its child paragraph went with it, not orphaned
  });
});

describe('callout block: an empty callout is removed entirely on Backspace', () => {
  it('backspacing the sole empty paragraph removes the whole callout, not just leaving an empty box', () => {
    const store = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(store, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const calloutId = insertAtRoot(store, createCalloutBlock(), 1);
    const childId = store.getBlock(calloutId).contentIds[0];

    // Directly exercise the shared merge command the child's own
    // onBackspaceAtStart calls.
    const result = mergeWithPreviousOrDelete(store, childId);

    expect(result).toBe(beforeId); // focus lands on whatever preceded the callout
    expect(store.getBlock(calloutId)).toBeUndefined();
    expect(store.getBlock(childId)).toBeUndefined();
    expect(store.getBlock('root').contentIds).toEqual([beforeId]);
  });

  it('removing the only block in the document falls back to a blank paragraph (never leaves the doc empty)', () => {
    const store = new EditorStore(emptyDoc());
    const calloutId = insertAtRoot(store, createCalloutBlock());
    const childId = store.getBlock(calloutId).contentIds[0];

    const result = mergeWithPreviousOrDelete(store, childId);

    expect(store.getBlock(calloutId)).toBeUndefined();
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(1);
    expect(store.getBlock(rootIds[0]).type).toBe('paragraph');
    expect(result).toBe(rootIds[0]); // focus lands on the new fallback paragraph
  });
});
