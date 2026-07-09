import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider, usePreviewMode } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2', 'p3'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'one', marks: {} },
      { id: 'r2', type: 'text', value: 'two', marks: {} },
      { id: 'r3', type: 'text', value: 'three', marks: {} },
    ],
  };
}

function renderDoc(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <BlockChildren parentId="root" isTopLevel />
    </EditorProvider>,
  );
}

describe('BlockChildren isTopLevel=false (default): no gutter at all (backward compatible)', () => {
  it('renders blocks directly, with no .be-block-row wrapper', () => {
    const store = new EditorStore(makeDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container } = render(
      <EditorProvider store={store} registry={registry}>
        <BlockChildren parentId="root" />
      </EditorProvider>,
    );
    expect(container.querySelector('.be-block-row')).toBeNull();
    expect(container.querySelector('.be-block-gutter')).toBeNull();
    expect(container.querySelectorAll('[data-block-id]')).toHaveLength(3);
  });
});

describe('BlockGutterRow: "+" button inserts a new paragraph right after the block', () => {
  it('inserts and does not touch the existing blocks', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const firstRow = container.querySelector('[data-block-row-id="p1"]');
    fireEvent.click(firstRow.querySelector('.be-block-gutter-btn[aria-label="Add block below"]'));

    const contentIds = store.getBlock('root').contentIds;
    expect(contentIds.length).toBe(4);
    expect(contentIds[0]).toBe('p1');
    expect(store.getBlock(contentIds[1]).type).toBe('paragraph');
    expect(contentIds[1]).not.toBe('p1');
  });
});

describe('BlockGutterRow: more-options menu', () => {
  it('opens a portaled menu with Duplicate/Move up/Move down/Hide/Delete', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const row = container.querySelector('[data-block-row-id="p2"]');
    fireEvent.click(row.querySelector('[aria-label="More options"]'));

    const menu = document.querySelector('.be-block-gutter-menu');
    expect(menu).not.toBeNull();
    const items = [...menu.querySelectorAll('.be-block-gutter-menu-item')].map((el) => el.textContent.trim());
    expect(items).toEqual(['Duplicate', 'Move up', 'Move down', 'Hide in preview', 'Delete']);
  });

  it('Duplicate clones the block right after itself', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const row = container.querySelector('[data-block-row-id="p2"]');
    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    fireEvent.click([...document.querySelectorAll('.be-block-gutter-menu-item')].find((el) => el.textContent.trim() === 'Duplicate'));

    const contentIds = store.getBlock('root').contentIds;
    expect(contentIds.length).toBe(4);
    expect(contentIds[0]).toBe('p1');
    expect(contentIds[1]).toBe('p2');
    expect(contentIds[2]).not.toBe('p2'); // the clone
    expect(store.getBlock(contentIds[2]).type).toBe('paragraph');
    expect(contentIds[3]).toBe('p3');
    expect(document.querySelector('.be-block-gutter-menu')).toBeNull(); // menu closes after the action
  });

  it('Move up / Move down reorder the block among its siblings', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const row = container.querySelector('[data-block-row-id="p2"]');
    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    fireEvent.click([...document.querySelectorAll('.be-block-gutter-menu-item')].find((el) => el.textContent.trim() === 'Move up'));
    expect(store.getBlock('root').contentIds).toEqual(['p2', 'p1', 'p3']);

    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    fireEvent.click([...document.querySelectorAll('.be-block-gutter-menu-item')].find((el) => el.textContent.trim() === 'Move down'));
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('Delete removes the block', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const row = container.querySelector('[data-block-row-id="p2"]');
    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    fireEvent.click([...document.querySelectorAll('.be-block-gutter-menu-item')].find((el) => el.textContent.trim() === 'Delete'));

    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p3']);
    expect(store.getBlock('p2')).toBeUndefined();
  });

  it('closes on outside click and Escape', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const row = container.querySelector('[data-block-row-id="p1"]');
    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    expect(document.querySelector('.be-block-gutter-menu')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.be-block-gutter-menu')).toBeNull();

    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    expect(document.querySelector('.be-block-gutter-menu')).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector('.be-block-gutter-menu')).toBeNull();
  });
});

describe('BlockGutterRow: Hide/Show toggle + preview mode', () => {
  it('"Hide in preview" sets props.hidden and dims the block in edit mode; "Show in preview" reverses it', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const row = container.querySelector('[data-block-row-id="p2"]');
    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    fireEvent.click([...document.querySelectorAll('.be-block-gutter-menu-item')].find((el) => el.textContent.trim() === 'Hide in preview'));

    expect(store.getBlock('p2').props.hidden).toBe(true);
    expect(container.querySelector('[data-block-row-id="p2"]').classList.contains('be-block-row-hidden')).toBe(true);
    // still fully in the DOM/editable — only dimmed via CSS (opacity), not removed
    expect(container.querySelector('[data-block-id="p2"]')).not.toBeNull();

    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    const items = [...document.querySelectorAll('.be-block-gutter-menu-item')].map((el) => el.textContent.trim());
    expect(items).toContain('Show in preview'); // label flips once hidden

    fireEvent.click(document.querySelectorAll('.be-block-gutter-menu-item')[3]); // "Show in preview"
    expect(store.getBlock('p2').props.hidden).toBe(false);
    expect(container.querySelector('[data-block-row-id="p2"]').classList.contains('be-block-row-hidden')).toBe(false);
  });

  it('is one atomic, undoable prop change', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    const row = container.querySelector('[data-block-row-id="p1"]');
    fireEvent.click(row.querySelector('[aria-label="More options"]'));
    fireEvent.click([...document.querySelectorAll('.be-block-gutter-menu-item')].find((el) => el.textContent.trim() === 'Hide in preview'));

    expect(store.getBlock('p1').props.hidden).toBe(true);
  });
});

function PreviewToggleHarness({ parentId }) {
  const [, setIsPreviewMode] = usePreviewMode();
  return (
    <div>
      <button type="button" onClick={() => setIsPreviewMode((v) => !v)}>
        toggle
      </button>
      <BlockChildren parentId={parentId} isTopLevel />
    </div>
  );
}

describe('preview mode: hidden blocks are skipped entirely, not just dimmed', () => {
  it('a hidden block disappears from the DOM once switched to preview mode, and the gutter disappears for everyone', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation({ type: 'updateBlockProps', id: 'p2', patch: { hidden: true } });

    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container, getByText } = render(
      <EditorProvider store={store} registry={registry}>
        <PreviewToggleHarness parentId="root" />
      </EditorProvider>,
    );

    // edit mode: all three still present, gutter visible
    expect(container.querySelectorAll('[data-block-id]')).toHaveLength(3);
    expect(container.querySelector('.be-block-gutter')).not.toBeNull();

    fireEvent.click(getByText('toggle')); // -> preview mode

    expect(container.querySelectorAll('[data-block-id]')).toHaveLength(2); // p2 is gone
    expect(container.querySelector('[data-block-id="p1"]')).not.toBeNull();
    expect(container.querySelector('[data-block-id="p3"]')).not.toBeNull();
    expect(container.querySelector('[data-block-id="p2"]')).toBeNull();
    expect(container.querySelector('.be-block-gutter')).toBeNull(); // no editing chrome in preview

    fireEvent.click(getByText('toggle')); // back to edit mode
    expect(container.querySelectorAll('[data-block-id]')).toHaveLength(3);
    expect(container.querySelector('.be-block-gutter')).not.toBeNull();
  });

  it('a non-hidden block is unaffected by preview mode', () => {
    const store = new EditorStore(makeDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { container, getByText } = render(
      <EditorProvider store={store} registry={registry}>
        <PreviewToggleHarness parentId="root" />
      </EditorProvider>,
    );

    fireEvent.click(getByText('toggle'));
    expect(container.querySelectorAll('[data-block-id]')).toHaveLength(3);
  });
});
