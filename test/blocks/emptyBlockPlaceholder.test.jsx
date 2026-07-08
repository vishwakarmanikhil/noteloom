import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { isRunsEmpty, isRunBlank } from '../../src/blocks/shared/blockEmpty.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['h1', 'p1', 'p2', 'li1', 'li2'], props: {} },
      { id: 'h1', type: 'heading', parentId: 'root', contentIds: ['r-h1'], props: { level: 2 } },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r-p1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r-p2'], props: {} },
      { id: 'li1', type: 'listItem', parentId: 'root', contentIds: [], props: { ordered: false, titleRunIds: ['r-li1'] } },
      {
        id: 'li2',
        type: 'listItem',
        parentId: 'root',
        contentIds: [],
        props: { ordered: false, titleRunIds: ['r-li2'], checked: false },
      },
    ],
    runs: [
      { id: 'r-h1', type: 'text', value: '', marks: {} }, // empty heading
      { id: 'r-p1', type: 'text', value: 'hello', marks: {} }, // non-empty paragraph
      { id: 'r-p2', type: 'text', value: '', marks: {} }, // empty paragraph
      { id: 'r-li1', type: 'text', value: '', marks: {} }, // empty bullet
      { id: 'r-li2', type: 'text', value: '', marks: {} }, // empty to-do
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

describe('isRunsEmpty / isRunBlank', () => {
  it('is true for no runs, absent runs, or every run blank; false once any run has text', () => {
    const store = new EditorStore(makeDoc());
    expect(isRunsEmpty(store, [])).toBe(true);
    expect(isRunsEmpty(store, undefined)).toBe(true);
    expect(isRunsEmpty(store, ['missing-run-id'])).toBe(true);
    expect(isRunsEmpty(store, ['r-p2'])).toBe(true);
    expect(isRunsEmpty(store, ['r-p1'])).toBe(false);
  });

  it('never treats an atomic (non-text) run as blank, even without a "value"', () => {
    expect(isRunBlank({ id: 'sel1', type: 'select', data: {} })).toBe(false);
    expect(isRunBlank({ id: 'd1', type: 'date' })).toBe(false);
    expect(isRunBlank({ id: 't1', type: 'text', value: '' })).toBe(true);
  });
});

describe('empty-block placeholder hint (data-empty/data-placeholder)', () => {
  it('marks empty heading/paragraph/list-item blocks with data-empty, and leaves non-empty ones unmarked', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    expect(container.querySelector('[data-block-id="h1"]').hasAttribute('data-empty')).toBe(true);
    expect(container.querySelector('[data-block-id="p1"]').hasAttribute('data-empty')).toBe(false); // "hello"
    expect(container.querySelector('[data-block-id="p2"]').hasAttribute('data-empty')).toBe(true);

    const li1Title = container.querySelector('[data-block-id="li1"] .be-list-item-title');
    const li2Title = container.querySelector('[data-block-id="li2"] .be-list-item-title');
    expect(li1Title.hasAttribute('data-empty')).toBe(true);
    expect(li2Title.hasAttribute('data-empty')).toBe(true);
  });

  it('sets a distinct placeholder string per block type/variant', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);

    expect(container.querySelector('[data-block-id="h1"]').getAttribute('data-placeholder')).toBe('Heading 2');
    expect(container.querySelector('[data-block-id="p2"]').getAttribute('data-placeholder')).toBe(
      "Type '/' for commands",
    );
    expect(
      container.querySelector('[data-block-id="li1"] .be-list-item-title').getAttribute('data-placeholder'),
    ).toBe('List item');
    expect(
      container.querySelector('[data-block-id="li2"] .be-list-item-title').getAttribute('data-placeholder'),
    ).toBe('To-do'); // checked !== undefined => to-do item, distinct hint from a plain bullet
  });

  it('removes data-empty the moment text is typed, and restores it if the text is deleted back to nothing', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-block-id="p2"]');
    const runNode = container.querySelector('[data-run-id="r-p2"]');

    expect(wrapper.hasAttribute('data-empty')).toBe(true);

    runNode.textContent = 'now typed';
    fireEvent.input(runNode);
    expect(wrapper.hasAttribute('data-empty')).toBe(false);

    runNode.textContent = '';
    fireEvent.input(runNode);
    expect(wrapper.hasAttribute('data-empty')).toBe(true);
  });

  it('stays in sync across undo/redo, which only notify the run — not the block (regression)', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderDoc(store);
    const wrapper = container.querySelector('[data-block-id="p2"]');
    const runNode = container.querySelector('[data-run-id="r-p2"]');

    runNode.textContent = 'now typed';
    fireEvent.input(runNode);
    expect(wrapper.hasAttribute('data-empty')).toBe(false);

    // Undo restores the run's value via a plain updateRun op — TextRunSpan's
    // own layout effect (not a block-level re-render) is what has to notice
    // this and put data-empty back.
    act(() => store.undo());
    expect(store.getRun('r-p2').value).toBe('');
    expect(wrapper.hasAttribute('data-empty')).toBe(true);

    act(() => store.redo());
    expect(store.getRun('r-p2').value).toBe('now typed');
    expect(wrapper.hasAttribute('data-empty')).toBe(false);
  });
});
