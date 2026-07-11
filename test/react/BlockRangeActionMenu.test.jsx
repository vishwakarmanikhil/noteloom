import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider, useBlockRangeSelection } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { BlockRangeActionMenu } from '../../src/react/BlockRangeActionMenu.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2', 'p3', 'p4'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
      { id: 'p3', type: 'paragraph', parentId: 'root', contentIds: ['r3'], props: {} },
      { id: 'p4', type: 'paragraph', parentId: 'root', contentIds: ['r4'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'one', marks: {} },
      { id: 'r2', type: 'text', value: 'two', marks: {} },
      { id: 'r3', type: 'text', value: 'three', marks: {} },
      { id: 'r4', type: 'text', value: 'four', marks: {} },
    ],
  };
}

function SelectRangeButton({ ids }) {
  const [, setSelectedBlockRange] = useBlockRangeSelection();
  return (
    <button type="button" onClick={() => setSelectedBlockRange(ids)}>
      select-range
    </button>
  );
}

function renderHarness(store, ids) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const { container, getByText } = render(
    <EditorProvider store={store} registry={registry}>
      <SelectRangeButton ids={ids} />
      <BlockRangeActionMenu />
      <BlockChildren parentId="root" isTopLevel />
    </EditorProvider>,
  );
  fireEvent.click(getByText('select-range'));
  return { container };
}

describe('BlockRangeActionMenu: visibility', () => {
  it('renders nothing while no range is selected', () => {
    const store = new EditorStore(makeDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    render(
      <EditorProvider store={store} registry={registry}>
        <BlockRangeActionMenu />
        <BlockChildren parentId="root" isTopLevel />
      </EditorProvider>,
    );
    expect(document.querySelector('.be-block-range-menu')).toBeNull();
  });

  it('opens with all five actions once a range is selected', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, ['p2', 'p3']);

    const menu = document.querySelector('.be-block-range-menu');
    expect(menu).not.toBeNull();
    const labels = [...menu.querySelectorAll('.be-block-range-menu-item')].map((el) => el.textContent.trim());
    expect(labels).toEqual(['Copy', 'Cut', 'Move up', 'Move down', 'Hide in preview', 'Delete']);
  });
});

describe('BlockRangeActionMenu: Delete', () => {
  it('removes every block in the range as one undo step and closes the menu', () => {
    const store = new History(new EditorStore(makeDoc()));
    renderHarness(store, ['p2', 'p3']);

    fireEvent.click([...document.querySelectorAll('.be-block-range-menu-item')].find((el) => el.textContent.trim() === 'Delete'));

    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p4']);
    expect(document.querySelector('.be-block-range-menu')).toBeNull();

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('BlockRangeActionMenu: Move up / Move down', () => {
  it('Move up swaps the range with the preceding sibling and closes the menu', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, ['p3', 'p4']);

    fireEvent.click([...document.querySelectorAll('.be-block-range-menu-item')].find((el) => el.textContent.trim() === 'Move up'));

    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p3', 'p4', 'p2']);
    // Every action closes the menu and clears the selection once it's done
    // — re-drag-select if you want to move the same range again.
    expect(document.querySelector('.be-block-range-menu')).toBeNull();
  });

  it('Move down swaps the range with the following sibling and closes the menu', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, ['p1', 'p2']);

    fireEvent.click([...document.querySelectorAll('.be-block-range-menu-item')].find((el) => el.textContent.trim() === 'Move down'));

    expect(store.getBlock('root').contentIds).toEqual(['p3', 'p1', 'p2', 'p4']);
    expect(document.querySelector('.be-block-range-menu')).toBeNull();
  });
});

describe('BlockRangeActionMenu: Hide/Show in preview', () => {
  it('Hide sets props.hidden on every block in the range and closes the menu', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, ['p2', 'p3']);

    fireEvent.click([...document.querySelectorAll('.be-block-range-menu-item')].find((el) => el.textContent.includes('Hide')));

    expect(store.getBlock('p2').props.hidden).toBe(true);
    expect(store.getBlock('p3').props.hidden).toBe(true);
    expect(document.querySelector('.be-block-range-menu')).toBeNull();
  });
});

describe('BlockRangeActionMenu: Copy / Cut', () => {
  it('Copy writes text/html to the clipboard without touching the store', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    const originalClipboardItem = global.ClipboardItem;
    global.ClipboardItem = class {
      constructor(data) {
        this.data = data;
      }
    };

    try {
      const store = new EditorStore(makeDoc());
      renderHarness(store, ['p2']);

      await act(async () => {
        fireEvent.click([...document.querySelectorAll('.be-block-range-menu-item')].find((el) => el.textContent.trim() === 'Copy'));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(write).toHaveBeenCalledTimes(1);
      expect(store.getBlock('p2')).toBeDefined(); // untouched
      expect(document.querySelector('.be-block-range-menu')).toBeNull(); // closes after acting, like every other action
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
      global.ClipboardItem = originalClipboardItem;
    }
  });

  it('Cut copies then deletes the range', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    const originalClipboardItem = global.ClipboardItem;
    global.ClipboardItem = class {
      constructor(data) {
        this.data = data;
      }
    };

    try {
      const store = new EditorStore(makeDoc());
      renderHarness(store, ['p2', 'p3']);

      await act(async () => {
        fireEvent.click([...document.querySelectorAll('.be-block-range-menu-item')].find((el) => el.textContent.trim() === 'Cut'));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(write).toHaveBeenCalledTimes(1);
      expect(store.getBlock('root').contentIds).toEqual(['p1', 'p4']);
      expect(document.querySelector('.be-block-range-menu')).toBeNull();
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
      global.ClipboardItem = originalClipboardItem;
    }
  });
});

describe('BlockRangeActionMenu: dismissal', () => {
  it('Escape clears the selection and closes the menu', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, ['p2', 'p3']);
    expect(document.querySelector('.be-block-range-menu')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.be-block-range-menu')).toBeNull();
  });

  it('Delete/Backspace (outside a text field) deletes the range, same as the menu button', () => {
    const store = new EditorStore(makeDoc());
    renderHarness(store, ['p2']);

    fireEvent.keyDown(document, { key: 'Delete' });

    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p3', 'p4']);
    expect(document.querySelector('.be-block-range-menu')).toBeNull();
  });

  it('clicking outside the menu and outside any gutter clears the selection', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, ['p2', 'p3']);

    fireEvent.mouseDown(container.querySelector('[data-run-id="r1"]'));
    expect(document.querySelector('.be-block-range-menu')).toBeNull();
  });

  it('clicking a different block\'s gutter is NOT treated as an outside click (that gutter is meant to start its own drag — see useBlockRangeDrag.test.jsx for the full drag mechanic, not mounted in this harness)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, ['p2', 'p3']);

    fireEvent.mouseDown(container.querySelector('[data-block-row-id="p1"] .be-block-gutter'));
    fireEvent.mouseUp(document);

    // the original selection survives — a gutter click is excluded from the
    // "clicked outside, clear everything" check regardless of whether a
    // drag hook happens to be mounted to also act on that same press
    expect(document.querySelector('.be-block-range-menu')).not.toBeNull();
    expect(container.querySelector('[data-block-row-id="p2"]').classList.contains('be-block-row-range-selected')).toBe(true);
    expect(container.querySelector('[data-block-row-id="p3"]').classList.contains('be-block-row-range-selected')).toBe(true);
  });
});
