import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { insertBlock } from '../../src/store/operations.js';
import { createButtonBlock } from '../../src/blocks/button/createButtonBlock.js';
import { mergeWithPreviousOrDelete } from '../../src/blocks/shared/mergeCommands.js';
import { walkDomToBlocks } from '../../src/clipboard/domWalk.js';

function emptyDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function insertAtRoot(store, factory, index = 0) {
  const { block, runs = [] } = factory('root');
  store.applyOperation(insertBlock(block, 'root', index, { blocks: [block], runs }));
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

describe('button block: rendering', () => {
  it('renders the label as editable text and an "open" control, disabled with no href', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ label: 'Click me' }));
    const { container } = renderDoc(store);

    const wrapper = container.querySelector(`[data-block-id="${id}"]`);
    expect(wrapper.textContent).toContain('Click me');
    expect(wrapper.querySelector('.be-button-block-open').disabled).toBe(true);
    expect(wrapper.querySelector('[data-run-id]')).not.toBeNull(); // real editable run, not static text
  });

  it('enables the open control once href is set', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ href: 'https://example.com' }));
    const { container } = renderDoc(store);
    expect(container.querySelector(`[data-block-id="${id}"] .be-button-block-open`).disabled).toBe(false);
  });

  it('typing into the label updates only that run, same as a paragraph', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ label: 'Click me' }));
    const { container } = renderDoc(store);

    const runNode = container.querySelector(`[data-block-id="${id}"] [data-run-id]`);
    runNode.textContent = 'Sign up';
    fireEvent.input(runNode);

    expect(store.getRun(store.getBlock(id).contentIds[0]).value).toBe('Sign up');
  });
});

describe('button block: editing the link is a separate control from clicking to activate it', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicking the "⚙" settings control opens the edit modal; saving sets props.href (undo-able)', () => {
    const rawStore = new EditorStore(emptyDoc());
    const id = insertAtRoot(rawStore, createButtonBlock());
    const store = new History(rawStore);
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-settings'));
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const urlInput = dialog.querySelector('input[type="url"]');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/signup' } });
    fireEvent.click(dialog.querySelector('.be-modal-save'));

    expect(store.getBlock(id).props.href).toBe('https://example.com/signup');
    expect(container.querySelector('[role="dialog"]')).toBeNull(); // closed after save

    act(() => store.undo());
    expect(store.getBlock(id).props.href).toBe('');
  });

  it('clicking the "open" control calls window.open with the href, without touching the label text', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ href: 'https://example.com', label: 'Go' }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-open'));

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    expect(store.getRun(store.getBlock(id).contentIds[0]).value).toBe('Go'); // label untouched
  });

  it('the disabled open control does nothing when no href is set', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createButtonBlock());
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-open'));
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('button block: Enter creates a plain paragraph sibling (not another button)', () => {
  it('splits at the caret into a new paragraph, matching heading\'s own convention', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ label: 'Click me' }));
    const { container } = renderDoc(store);
    const runNode = container.querySelector(`[data-block-id="${id}"] [data-run-id]`);

    fireEvent.keyDown(runNode, { key: 'Enter' });

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    expect(store.getBlock(rootIds[1]).type).toBe('paragraph');
  });
});

describe('button block: Backspace-at-start (not a mergeable text type, matches table/listItem/callout)', () => {
  it('a non-empty button does not merge into a preceding paragraph', () => {
    const store = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(store, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const id = insertAtRoot(store, createButtonBlock({ label: 'Click me' }), 1);

    const result = mergeWithPreviousOrDelete(store, id);
    expect(result).toBeNull();
    expect(store.getBlock(id)).toBeDefined();
    expect(store.getBlock('root').contentIds).toEqual([beforeId, id]);
  });

  it('an empty button is removed outright', () => {
    const store = new EditorStore(emptyDoc());
    const beforeId = insertAtRoot(store, () => ({
      block: { id: 'before', type: 'paragraph', parentId: 'root', contentIds: ['r-before'], props: {} },
      runs: [{ id: 'r-before', type: 'text', value: 'before', marks: {} }],
    }));
    const id = insertAtRoot(store, createButtonBlock({ label: '' }), 1);

    const result = mergeWithPreviousOrDelete(store, id);
    expect(result).toBe(beforeId);
    expect(store.getBlock(id)).toBeUndefined();
  });
});

describe('button block: clipboard round-trip', () => {
  it('toHTML emits a distinctively-classed <a> so ordinary link pasting is unaffected', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ href: 'https://example.com', label: 'Go' }));
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('button').toHTML(store.getBlock(id), { store, registry });
    expect(html).toBe('<a class="be-button-block-link" href="https://example.com">Go</a>');
  });

  it('walkDomToBlocks reconstructs a button from its own marker class', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks('<a class="be-button-block-link" href="https://example.com">Go</a>', registry);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].block.type).toBe('button');
    expect(inserts[0].block.props.href).toBe('https://example.com');
    expect(inserts[0].runs[0].value).toBe('Go');
  });

  it('an ordinary pasted <a> (no marker class) is NOT treated as a button', () => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const inserts = walkDomToBlocks('<a href="https://example.com">just a link</a>', registry);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].block.type).toBe('paragraph'); // falls back to the generic inline-link-in-paragraph path
    expect(inserts[0].runs[0].marks.link?.href).toBe('https://example.com');
  });

  it('toHTML includes background-color style and data-* attrs when set', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(
      store,
      createButtonBlock({ href: 'https://example.com', label: 'Go', color: '#e03131', customAttrs: [{ key: 'track', value: 'signup' }] }),
    );
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);

    const html = registry.get('button').toHTML(store.getBlock(id), { store, registry });
    expect(html).toContain('style="background-color:#e03131"');
    expect(html).toContain('data-track="signup"');
  });
});

describe('button block: the edit modal (label/link/color/custom attributes in one place)', () => {
  it('opens pre-filled with the current label, href, and color', () => {
    const store = new EditorStore(emptyDoc());
    insertAtRoot(store, createButtonBlock({ href: 'https://example.com', label: 'Go', color: '#e03131' }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-settings'));
    const dialog = container.querySelector('[role="dialog"]');

    expect(dialog.querySelector('input[type="text"]').value).toBe('Go');
    expect(dialog.querySelector('input[type="url"]').value).toBe('https://example.com');
    expect(dialog.querySelector('.be-modal-color-swatch-active').title).toBe('Red');
  });

  it('renaming the label via the modal replaces the block\'s runs with the new plain text', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ label: 'Go' }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-settings'));
    const dialog = container.querySelector('[role="dialog"]');
    const labelInput = dialog.querySelector('input[type="text"]');
    fireEvent.change(labelInput, { target: { value: 'Sign up now' } });
    fireEvent.click(dialog.querySelector('.be-modal-save'));

    const block = store.getBlock(id);
    expect(block.contentIds.length).toBe(1);
    expect(store.getRun(block.contentIds[0]).value).toBe('Sign up now');
  });

  it('picking a color swatch and saving sets props.color, reflected in the pill background', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock());
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-settings'));
    const dialog = container.querySelector('[role="dialog"]');
    fireEvent.click(dialog.querySelector('.be-modal-color-swatch[title="Green"]'));
    fireEvent.click(dialog.querySelector('.be-modal-save'));

    expect(store.getBlock(id).props.color).toBe('#2f9e44');
    const pill = container.querySelector('.be-button-block-pill');
    expect(pill.style.backgroundColor).toBe('rgb(47, 158, 68)');
  });

  it('adding a custom attribute row and saving stores it, rendered as a data-* attribute on the pill', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock());
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-settings'));
    const dialog = container.querySelector('[role="dialog"]');
    const [keyInput, valueInput] = dialog.querySelectorAll('.be-modal-attr-row input');
    fireEvent.change(keyInput, { target: { value: 'analytics-id' } });
    fireEvent.change(valueInput, { target: { value: 'cta-42' } });
    fireEvent.click(dialog.querySelector('.be-modal-save'));

    expect(store.getBlock(id).props.customAttrs).toEqual([{ key: 'analytics-id', value: 'cta-42' }]);
    const pill = container.querySelector('.be-button-block-pill');
    expect(pill.getAttribute('data-analytics-id')).toBe('cta-42');
  });

  it('clicking Cancel discards changes', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ href: 'https://original.com' }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-settings'));
    const dialog = container.querySelector('[role="dialog"]');
    fireEvent.change(dialog.querySelector('input[type="url"]'), { target: { value: 'https://changed.com' } });
    fireEvent.click(dialog.querySelector('.be-modal-cancel'));

    expect(store.getBlock(id).props.href).toBe('https://original.com');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('pressing Escape also closes the modal without saving', () => {
    const store = new EditorStore(emptyDoc());
    const id = insertAtRoot(store, createButtonBlock({ href: 'https://original.com' }));
    const { container } = renderDoc(store);

    fireEvent.click(container.querySelector('.be-button-block-settings'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(store.getBlock(id).props.href).toBe('https://original.com');
  });
});
