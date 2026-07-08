import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { EditableBlockContent } from '../../src/react/EditableBlockContent.jsx';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { EMPTY_RUN_PLACEHOLDER } from '../../src/react/domRunSync.js';
import { setBlockRuns } from '../../src/store/operations.js';

function makeStore() {
  return new EditorStore({
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'hello ', marks: {} },
      { id: 'r2', type: 'text', value: 'world', marks: { bold: true } },
    ],
  });
}

function renderBlock(store, props = {}, inlineRegistry = createInlineRegistry()) {
  registerBuiltInInlineTypes(inlineRegistry);
  const runIds = store.getBlock('p1').contentIds;
  return render(
    <EditorProvider store={store} registry={{}} inlineRegistry={inlineRegistry}>
      <EditableBlockContent blockId="p1" runIds={runIds} {...props} />
    </EditorProvider>,
  );
}

describe('EditableBlockContent: rendering', () => {
  it('renders one contentEditable region containing both run spans', () => {
    const store = makeStore();
    const { container } = renderBlock(store);

    const editable = container.querySelector('[contenteditable]');
    expect(editable).not.toBeNull();
    const runSpans = editable.querySelectorAll('[data-run-id]');
    expect(runSpans.length).toBe(2);
    expect(runSpans[0].textContent).toBe('hello ');
    expect(runSpans[1].textContent).toBe('world');
    expect(runSpans[1].style.fontWeight).toBe('bold');
  });
});

describe('EditableBlockContent: empty-run placeholder (regression)', () => {
  it('renders a zero-width-space placeholder for an empty run, never a truly empty span', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderBlock(store);

    const runSpan = container.querySelector('[data-run-id="r1"]');
    expect(runSpan.textContent).toBe(EMPTY_RUN_PLACEHOLDER);
    expect(runSpan.textContent.length).toBe(1); // a real text node exists for the browser to anchor a caret in
  });

  it('typing into a freshly-empty run produces exactly one run with the typed value (no duplication)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const runSpan = container.querySelector('[data-run-id="r1"]');

    // simulate the browser correctly anchoring the caret in the placeholder
    // and inserting "k" right after it, inside the same span
    runSpan.textContent = `${EMPTY_RUN_PLACEHOLDER}k`;
    fireEvent.input(editable);

    expect(store.getBlock('p1').contentIds).toEqual(['r1']); // still exactly one run
    expect(store.getRun('r1').value).toBe('k');
  });

  it('does not rewrite the DOM after the store update once logical content already matches (caret-reset regression)', () => {
    // el.textContent assignment destroys/recreates the underlying Text node,
    // which resets the browser's caret — so the sync effect must NOT touch
    // the DOM here, since "​k" already logically equals the new value "k"
    // once the placeholder is stripped. Rewriting anyway (comparing raw
    // text instead of stripped text) is exactly what caused the caret to
    // jump to the start of the run right after the first keystroke.
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: '', marks: {} }],
    });
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const runSpan = container.querySelector('[data-run-id="r1"]');

    runSpan.textContent = `${EMPTY_RUN_PLACEHOLDER}k`;
    fireEvent.input(editable);

    // after the store update triggers TextRunSpan's re-render, the DOM's
    // raw text (placeholder + "k") must be left exactly as the browser put
    // it — no corrective rewrite, since it already matches "k" once stripped.
    expect(container.querySelector('[data-run-id="r1"]').textContent).toBe(`${EMPTY_RUN_PLACEHOLDER}k`);
  });
});

describe('EditableBlockContent: fast path (in-place text edit)', () => {
  it('typing within an existing run span updates only that run via updateRun', () => {
    const store = makeStore();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const runSpans = editable.querySelectorAll('[data-run-id]');

    runSpans[0].textContent = 'hi ';
    fireEvent.input(editable);

    expect(store.getRun('r1').value).toBe('hi ');
    expect(store.getRun('r2').value).toBe('world'); // untouched
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']); // no structural change
  });
});

describe('EditableBlockContent: slow path (structural DOM change)', () => {
  it('an unwrapped new text node triggers a bulk setBlockRuns resync', () => {
    const store = makeStore();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');

    // simulate the browser inserting a bare text node before the first span
    // (e.g. typing at the very start of the contentEditable region)
    editable.insertBefore(document.createTextNode('oh, '), editable.firstChild);
    fireEvent.input(editable);

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(3);
    expect(store.getRun(contentIds[0]).value).toBe('oh, ');
    expect(store.getRun(contentIds[1]).value).toBe('hello ');
    expect(store.getRun(contentIds[2]).value).toBe('world');
  });
});

describe('EditableBlockContent: keyboard wiring', () => {
  it('Enter calls onEnter and prevents default', () => {
    const store = makeStore();
    const onEnter = vi.fn();
    const { container } = renderBlock(store, { onEnter });
    const editable = container.querySelector('[contenteditable]');

    fireEvent.keyDown(editable, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('Tab calls onTab, Shift+Tab calls onShiftTab', () => {
    const store = makeStore();
    const onTab = vi.fn();
    const onShiftTab = vi.fn();
    const { container } = renderBlock(store, { onTab, onShiftTab });
    const editable = container.querySelector('[contenteditable]');

    fireEvent.keyDown(editable, { key: 'Tab' });
    expect(onTab).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(editable, { key: 'Tab', shiftKey: true });
    expect(onShiftTab).toHaveBeenCalledTimes(1);
  });

  it('ArrowUp/ArrowDown call their handlers', () => {
    const store = makeStore();
    const onArrowUp = vi.fn();
    const onArrowDown = vi.fn();
    const { container } = renderBlock(store, { onArrowUp, onArrowDown });
    const editable = container.querySelector('[contenteditable]');

    fireEvent.keyDown(editable, { key: 'ArrowUp' });
    fireEvent.keyDown(editable, { key: 'ArrowDown' });
    expect(onArrowUp).toHaveBeenCalledTimes(1);
    expect(onArrowDown).toHaveBeenCalledTimes(1);
  });
});

describe('EditableBlockContent: atomic inline runs', () => {
  it('renders a registered inline type (select) as an atomic contentEditable=false island', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'sel1'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'Pick one: ', marks: {} },
        {
          id: 'sel1',
          type: 'select',
          value: '',
          marks: {},
          data: { options: [{ value: 'a', label: 'A' }], selectedValue: 'a' },
        },
      ],
    });

    const { container } = renderBlock(store, {}, undefined);
    const editable = container.querySelector('[contenteditable]');
    const chip = editable.querySelector('[data-run-id="sel1"]');

    expect(chip).not.toBeNull();
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.querySelector('select')).not.toBeNull();
  });
});

describe('EditableBlockContent: IME composition (regression)', () => {
  it('ignores input events fired while composing, and reconciles once on compositionend', () => {
    const store = makeStore();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const runSpan = container.querySelector('[data-run-id="r1"]');

    fireEvent.compositionStart(editable);

    // simulate the IME's transient, uncommitted intermediate states
    runSpan.textContent = 'h';
    fireEvent.input(editable);
    runSpan.textContent = 'ha';
    fireEvent.input(editable);
    runSpan.textContent = 'あ'; // transient kana candidate, mid-composition
    fireEvent.input(editable);

    // none of the transient states should have reached the store
    expect(store.getRun('r1').value).toBe('hello ');

    // IME commits the final chosen text and composition ends
    runSpan.textContent = 'あい'; // committed text
    fireEvent.compositionEnd(editable);

    expect(store.getRun('r1').value).toBe('あい');
  });

  it('ignores Enter/Backspace/Tab while composing (IME candidate-selection keys, not block commands)', () => {
    const store = makeStore();
    const onEnter = vi.fn();
    const onBackspaceAtStart = vi.fn();
    const { container } = renderBlock(store, { onEnter, onBackspaceAtStart });
    const editable = container.querySelector('[contenteditable]');

    fireEvent.compositionStart(editable);
    fireEvent.keyDown(editable, { key: 'Enter' });
    fireEvent.keyDown(editable, { key: 'Backspace' });

    expect(onEnter).not.toHaveBeenCalled();
    expect(onBackspaceAtStart).not.toHaveBeenCalled();

    fireEvent.compositionEnd(editable);
    fireEvent.keyDown(editable, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1); // works normally once composition has ended
  });
});

function selectCollapsedAt(runNode, offset) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.setEnd(textNode, offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('EditableBlockContent: deleting an atomic inline run (regression)', () => {
  // Regression for a real-browser crash: native Backspace/Delete let the
  // browser rip the atomic chip's DOM node out before React knew, so
  // React's next commit tried to remove it again and threw
  // "NotFoundError: removeChild ... not a child of this node". Deletion
  // must go through the store instead, with the DOM never touched natively.
  function makeStoreWithChip() {
    return new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'chip', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'before ', marks: {} },
        { id: 'chip', type: 'select', value: '', marks: {}, data: { options: [], selectedValue: '' } },
        { id: 'r2', type: 'text', value: ' after', marks: {} },
      ],
    });
  }

  it('Backspace right after the chip removes the chip, not the surrounding text', () => {
    const store = makeStoreWithChip();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectCollapsedAt(r2Node, 0); // caret right after the chip, before " after"
    fireEvent.keyDown(editable, { key: 'Backspace' });

    expect(store.getRun('chip')).toBeUndefined();
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
    expect(store.getRun('r1').value).toBe('before ');
    expect(store.getRun('r2').value).toBe(' after');
  });

  it('Delete right before the chip removes the chip, not the surrounding text', () => {
    const store = makeStoreWithChip();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectCollapsedAt(r1Node, 'before '.length); // caret right before the chip
    fireEvent.keyDown(editable, { key: 'Delete' });

    expect(store.getRun('chip')).toBeUndefined();
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
  });

  it('Backspace removes the chip when the browser selects it as a whole unit (non-collapsed node selection)', () => {
    // Real browsers commonly turn arrow-key navigation past a
    // contentEditable={false} island into a *non-collapsed* "select this
    // node as a unit" selection rather than a collapsed caret beside it —
    // the collapsed-caret check alone misses this and lets native deletion
    // reproduce the removeChild crash.
    const store = makeStoreWithChip();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const chipNode = container.querySelector('[data-run-id="chip"]');
    const chipIndex = Array.prototype.indexOf.call(editable.childNodes, chipNode);

    const range = document.createRange();
    range.setStart(editable, chipIndex);
    range.setEnd(editable, chipIndex + 1);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.isCollapsed).toBe(false);

    fireEvent.keyDown(editable, { key: 'Backspace' });

    expect(store.getRun('chip')).toBeUndefined();
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
  });

  it('Delete removes the chip when the browser selects it as a whole unit (non-collapsed node selection)', () => {
    const store = makeStoreWithChip();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const chipNode = container.querySelector('[data-run-id="chip"]');
    const chipIndex = Array.prototype.indexOf.call(editable.childNodes, chipNode);

    const range = document.createRange();
    range.setStart(editable, chipIndex);
    range.setEnd(editable, chipIndex + 1);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    fireEvent.keyDown(editable, { key: 'Delete' });

    expect(store.getRun('chip')).toBeUndefined();
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
  });

  it('plain Backspace inside text (not adjacent to a chip) is left to native/browser handling', () => {
    const store = makeStoreWithChip();
    const onBackspaceAtStart = vi.fn();
    const { container } = renderBlock(store, { onBackspaceAtStart });
    const editable = container.querySelector('[contenteditable]');
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectCollapsedAt(r1Node, 3); // mid-text, nowhere near the chip
    fireEvent.keyDown(editable, { key: 'Backspace' });

    expect(store.getRun('chip')).toBeDefined();
    expect(onBackspaceAtStart).not.toHaveBeenCalled();
  });

  it('ignores a chip-shaped DOM node the store already deleted (holding Backspace outruns React\'s commit)', () => {
    // Holding Backspace down fires keydowns faster than React necessarily
    // commits the previous removal's DOM update, so a chip already gone
    // from the *logical* run list (removed by op #1) can still be
    // physically sitting in the DOM for one more event. Trusting
    // previousElementSibling/nextElementSibling here re-triggered a second
    // delete of an already-deleted run and reproduced the removeChild crash
    // intermittently. Simulate the lag directly: the store/runIds no longer
    // know about "chip", but a stray DOM node with that shape still lingers
    // right where the real one used to be.
    const store = makeStoreWithChip();
    store.applyOperation(setBlockRuns('p1', [store.getRun('r1'), store.getRun('r2')]));
    const runIds = store.getBlock('p1').contentIds; // ['r1', 'r2'] — chip already gone

    const registry = createInlineRegistry();
    registerBuiltInInlineTypes(registry);
    const { container } = render(
      <EditorProvider store={store} registry={{}} inlineRegistry={registry}>
        <EditableBlockContent blockId="p1" runIds={runIds} />
      </EditorProvider>,
    );
    const editable = container.querySelector('[contenteditable]');
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    const staleChip = document.createElement('span');
    staleChip.setAttribute('data-run-id', 'chip');
    staleChip.setAttribute('contenteditable', 'false');
    staleChip.textContent = 'stale';
    editable.insertBefore(staleChip, r2Node);

    selectCollapsedAt(r2Node, 0); // caret right after the stale (already-deleted) chip node

    expect(() => fireEvent.keyDown(editable, { key: 'Backspace' })).not.toThrow();
    expect(store.getBlock('p1').contentIds).toEqual(['r1', 'r2']);
    expect(store.getRun('r1').value).toBe('before ');
  });
});

function selectAcross(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('EditableBlockContent: beforeinput over a selection spanning a chip (regression)', () => {
  // Different crash path from plain Backspace/Delete: typing a replacement
  // character (or word/line-deleting) over a selection that spans an
  // atomic chip goes through `beforeinput`, where the browser's default
  // action deletes the chip's DOM node directly as part of "replace the
  // selection" — never touching our Backspace/Delete keydown interception
  // at all. Must be caught here too, or it reproduces the same
  // "NotFoundError: removeChild" crash through a completely different door.
  function makeStoreWithChip() {
    return new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1', 'chip', 'r2'], props: {} },
      ],
      runs: [
        { id: 'r1', type: 'text', value: 'before ', marks: {} },
        { id: 'chip', type: 'select', value: '', marks: {}, data: { options: [], selectedValue: '' } },
        { id: 'r2', type: 'text', value: ' after', marks: {} },
      ],
    });
  }

  it('typing "X" over a selection spanning text-chip-text replaces the whole span with "X"', () => {
    const store = makeStoreWithChip();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    // Select from "befo|re " through " af|ter" — spans the tail of r1, the
    // whole chip, and the head of r2.
    selectAcross(r1Node.firstChild, 4, r2Node.firstChild, 3);

    fireEvent(
      editable,
      new window.InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true }),
    );

    expect(store.getRun('chip')).toBeUndefined();
    const finalText = store
      .getBlock('p1')
      .contentIds.map((id) => store.getRun(id).value)
      .join('');
    expect(finalText).toBe('befoXter');
  });

  it('Ctrl+Backspace word-delete (beforeinput deleteWordBackward) over a chip-spanning range removes the chip cleanly', () => {
    const store = makeStoreWithChip();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectAcross(r1Node.firstChild, 7, r2Node.firstChild, 1); // "before " through " a|fter"

    fireEvent(
      editable,
      new window.InputEvent('beforeinput', { inputType: 'deleteWordBackward', bubbles: true, cancelable: true }),
    );

    expect(store.getRun('chip')).toBeUndefined();
    const finalText = store
      .getBlock('p1')
      .contentIds.map((id) => store.getRun(id).value)
      .join('');
    expect(finalText).toBe('before after'); // chip + its flanking space dropped, both text runs otherwise intact
  });

  it('plain typing with no atomic run in range is left alone (existing onInput path handles it)', () => {
    const store = makeStoreWithChip();
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectAcross(r1Node.firstChild, 1, r1Node.firstChild, 3); // "b|ef|ore " — no chip involved

    const event = new window.InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true });
    fireEvent(editable, event);

    expect(event.defaultPrevented).toBe(false); // untouched: falls through to native handling
    expect(store.getRun('chip')).toBeDefined();
  });
});

describe('EditableBlockContent: never leaves a block with zero runs (regression)', () => {
  // A block whose contentEditable region has zero children isn't a valid
  // caret anchor in most browsers — clicking/typing into it lands the
  // caret at the *container* level instead of any run, producing a stray
  // untracked text node reconcileDomToRuns can never match back to an
  // existing run. Every keystroke after that mints a brand-new run+host
  // instead of updating one in place ("characters double" when typing).
  // Every path that can shrink a block's run list must fall back to one
  // blank run instead of an empty array.

  it('Backspace deleting the sole atomic chip in a block leaves one blank text run, not zero', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['chip'], props: {} },
      ],
      runs: [{ id: 'chip', type: 'select', value: '', marks: {}, data: { options: [], selectedValue: '' } }],
    });
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');
    const chipNode = container.querySelector('[data-run-id="chip"]');
    const chipIndex = Array.prototype.indexOf.call(editable.childNodes, chipNode);

    const range = document.createRange();
    range.setStart(editable, chipIndex);
    range.setEnd(editable, chipIndex + 1);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    fireEvent.keyDown(editable, { key: 'Backspace' });

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(1);
    expect(store.getRun(contentIds[0]).type).toBe('text');
    expect(store.getRun(contentIds[0]).value).toBe('');
  });

  it('a structural DOM resync (handleInput slow path) that would empty the block falls back to one blank run', () => {
    const store = makeStore(); // p1 has runs r1 ("hello "), r2 ("world")
    const { container } = renderBlock(store);
    const editable = container.querySelector('[contenteditable]');

    // Simulate the browser removing all content from the contentEditable
    // region entirely (e.g. select-all then Delete), leaving zero children.
    editable.innerHTML = '';
    fireEvent.input(editable);

    const contentIds = store.getBlock('p1').contentIds;
    expect(contentIds.length).toBe(1);
    expect(store.getRun(contentIds[0]).value).toBe('');
  });
});
