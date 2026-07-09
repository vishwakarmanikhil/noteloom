import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { useSlashMenuTrigger } from '../../src/commands/useSlashMenuTrigger.js';
import { SlashMenu } from '../../src/commands/SlashMenu.jsx';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
  };
}

function Harness() {
  const containerRef = useRef(null);
  const { isOpen, rect, commands, runId, selectCommand, close } = useSlashMenuTrigger(containerRef);
  return (
    <div ref={containerRef}>
      <BlockChildren parentId="root" />
      <SlashMenu isOpen={isOpen} rect={rect} commands={commands} runId={runId} onSelect={selectCommand} onClose={close} />
    </div>
  );
}

function renderHarness(store, { withInlineTypes = false } = {}) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const inlineRegistry = createInlineRegistry();
  if (withInlineTypes) registerBuiltInInlineTypes(inlineRegistry);
  return render(
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry}>
      <Harness />
    </EditorProvider>,
  );
}

/** Types `text` into runNode and places a collapsed caret at its end, mimicking real browser typing. */
function typeIntoRun(runNode, text) {
  typeIntoRunWithCaretAt(runNode, text, text.length);
}

/** Types `text` into runNode and places a collapsed caret at `caretOffset` within it — for testing truly mid-block triggers with trailing content after the cursor. */
function typeIntoRunWithCaretAt(runNode, text, caretOffset) {
  runNode.textContent = text;
  const range = document.createRange();
  range.setStart(runNode.firstChild, caretOffset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.input(runNode);
}

describe('slash command menu', () => {
  it('opens on "/" and filters commands by query, driven entirely by the registry', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '/');
    let items = container.querySelectorAll('.be-slash-menu-item');
    expect(items.length).toBeGreaterThan(1); // every registered slashCommand, unfiltered

    // matches all three plain heading levels AND all three toggle-heading
    // levels — both share "heading" as a keyword/label substring
    typeIntoRun(runNode, '/hea');
    items = container.querySelectorAll('.be-slash-menu-item');
    expect([...items].map((el) => el.textContent)).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Toggle heading 1',
      'Toggle heading 2',
      'Toggle heading 3',
    ]);

    typeIntoRun(runNode, '/h3');
    items = container.querySelectorAll('.be-slash-menu-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('Heading 3');
  });

  it('selecting a command on an otherwise-empty block converts it in place, rather than leaving an empty block behind', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '/hea'); // p1's only run, so trimming the query leaves it empty

    const item = container.querySelector('.be-slash-menu-item');
    fireEvent.mouseDown(item);

    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds.length).toBe(1); // no new sibling — the empty block became the heading
    expect(store.getBlock('p1')).toBeUndefined(); // old empty block is gone, not left behind
    expect(store.getBlock(rootContentIds[0]).type).toBe('heading');
  });

  it('closes on Escape', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '/');
    expect(container.querySelectorAll('.be-slash-menu-item').length).toBeGreaterThan(0);

    fireEvent.keyDown(runNode, { key: 'Escape' });
    expect(container.querySelectorAll('.be-slash-menu-item').length).toBe(0);
  });
});

describe('slash command menu: accessibility (listbox + aria-activedescendant)', () => {
  it('exposes a listbox with selectable options, and wires aria-activedescendant onto the triggering run', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '/hea');

    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(6); // 3 plain heading levels + 3 toggle-heading levels, both match "hea"
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');

    expect(runNode.getAttribute('aria-expanded')).toBe('true');
    expect(runNode.getAttribute('aria-controls')).toBe(listbox.id);
    expect(runNode.getAttribute('aria-activedescendant')).toBe(options[0].id);

    fireEvent.keyDown(runNode, { key: 'ArrowDown' });
    expect(container.querySelectorAll('[aria-selected="true"]')[0].id).toBe(options[1].id);
    expect(runNode.getAttribute('aria-activedescendant')).toBe(options[1].id);

    fireEvent.keyDown(runNode, { key: 'Escape' });
    expect(runNode.hasAttribute('aria-expanded')).toBe(false);
    expect(runNode.hasAttribute('aria-activedescendant')).toBe(false);
  });
});

describe('slash command menu: keeps the active item in view while navigating with arrow keys', () => {
  it('calls scrollIntoView on the newly-active item whenever Arrow Up/Down moves the selection', () => {
    // jsdom doesn't implement scrollIntoView at all (throws if actually
    // invoked without a stub) — install a spy so we can assert it fires,
    // without asserting anything about real scroll positions/geometry.
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      const store = new EditorStore(makeDoc());
      const { container } = renderHarness(store);
      const runNode = container.querySelector('[data-run-id="r1"]');

      typeIntoRun(runNode, '/hea');
      scrollIntoView.mockClear(); // ignore the initial mount's call for activeIndex 0

      fireEvent.keyDown(runNode, { key: 'ArrowDown' });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

      scrollIntoView.mockClear();
      fireEvent.keyDown(runNode, { key: 'ArrowUp' });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});

describe('slash command menu: mid-text triggering (regression)', () => {
  it('opens "/" even when the run already has text before it, not just in an empty block', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, 'hello /table');
    const items = container.querySelectorAll('.be-slash-menu-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('Table');
  });

  it('selecting a command only removes the "/query" substring, preserving the text before it', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, 'hello /table');
    fireEvent.mouseDown(container.querySelector('.be-slash-menu-item'));

    expect(store.getRun('r1').value).toBe('hello '); // "/table" removed, "hello " kept
    const rootContentIds = store.getBlock('root').contentIds;
    const newBlockId = rootContentIds[rootContentIds.indexOf('p1') + 1];
    expect(store.getBlock(newBlockId).type).toBe('table');
  });

  it('does not trigger when "/" is not at a word boundary (e.g. inside a word)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, 'a/b'); // "/" immediately follows a non-whitespace character
    expect(container.querySelectorAll('.be-slash-menu-item').length).toBe(0);
  });

  it('triggers with the caret truly in the middle of the run, with more text after the cursor', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    // "hello /table world" with the caret right after "/table", before " world"
    const text = 'hello /table world';
    typeIntoRunWithCaretAt(runNode, text, 'hello /table'.length);

    const items = container.querySelectorAll('.be-slash-menu-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('Table');
  });

  it('selecting a command mid-block preserves text both before AND after the removed "/query"', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    const text = 'hello /table world';
    typeIntoRunWithCaretAt(runNode, text, 'hello /table'.length);
    fireEvent.mouseDown(container.querySelector('.be-slash-menu-item'));

    expect(store.getRun('r1').value).toBe('hello  world'); // "/table" removed, both sides kept
  });
});

describe('slash command menu: inline insertion (regression)', () => {
  it('lists an inline-type command (Select) alongside block commands', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, { withInlineTypes: true });
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, '/select');
    const items = [...container.querySelectorAll('.be-slash-menu-item')];
    expect(items.some((el) => el.textContent === 'Select')).toBe(true);
  });

  it('selecting the inline Select command splices an atomic run into the SAME block instead of creating a new block', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, { withInlineTypes: true });
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRun(runNode, 'pick: /select');
    const items = [...container.querySelectorAll('.be-slash-menu-item')];
    const selectItem = items.find((el) => el.textContent === 'Select');
    fireEvent.mouseDown(selectItem);

    // no new sibling block was created — still just p1 under root
    expect(store.getBlock('root').contentIds).toEqual(['p1']);

    const p1 = store.getBlock('p1');
    expect(p1.contentIds.length).toBe(3); // text("pick: ") + select run + trailing empty text
    const [beforeId, selectId, afterId] = p1.contentIds;
    expect(store.getRun(beforeId).value).toBe('pick: ');
    expect(store.getRun(selectId).type).toBe('select');
    expect(store.getRun(afterId).value).toBe('');
  });

  it('regression: inline insertion lands exactly where the cursor was, not always at the end of the block', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store, { withInlineTypes: true });
    const runNode = container.querySelector('[data-run-id="r1"]');

    // "pick: /select more text" with the caret right after "/select",
    // before " more text" — the chip must land between the two, not
    // swallow/relocate the trailing text to the end.
    const text = 'pick: /select more text';
    typeIntoRunWithCaretAt(runNode, text, 'pick: /select'.length);

    const selectItem = [...container.querySelectorAll('.be-slash-menu-item')].find((el) => el.textContent === 'Select');
    fireEvent.mouseDown(selectItem);

    expect(store.getBlock('root').contentIds).toEqual(['p1']); // still no new block
    const p1 = store.getBlock('p1');
    expect(p1.contentIds.length).toBe(3);
    const [beforeId, selectId, afterId] = p1.contentIds;
    expect(store.getRun(beforeId).value).toBe('pick: ');
    expect(store.getRun(selectId).type).toBe('select');
    expect(store.getRun(afterId).value).toBe(' more text'); // preserved, not lost or appended elsewhere
  });
});
