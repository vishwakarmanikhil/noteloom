import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { createInlineRegistry } from '../../src/registry/inlineRegistry.js';
import { registerBuiltInInlineTypes } from '../../src/inlineTypes/index.js';
import { useSlashMenuTrigger } from '../../src/commands/useSlashMenuTrigger.js';
import { SlashMenu } from '../../src/commands/SlashMenu.jsx';
import { EMOJI_LIST } from '../../src/inlineTypes/emoji/emojiList.js';

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

function renderHarness(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const inlineRegistry = createInlineRegistry();
  registerBuiltInInlineTypes(inlineRegistry);
  return render(
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry}>
      <Harness />
    </EditorProvider>,
  );
}

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

describe('emoji slash commands: listing and search', () => {
  it('typing "/emoji" lists every emoji (all share the "emoji" keyword)', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRunWithCaretAt(runNode, '/emoji', 6);
    const items = container.querySelectorAll('.be-slash-menu-item');
    expect(items.length).toBe(EMOJI_LIST.length);
  });

  it('typing a specific name/synonym like "/fire" jumps straight to just that emoji', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRunWithCaretAt(runNode, '/fire', 5);
    const items = [...container.querySelectorAll('.be-slash-menu-item')];
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('🔥 fire');
  });
});

describe('emoji slash commands: inserting one splices plain text, not an atomic chip', () => {
  it('selecting an emoji on an empty line inserts it as that line\'s own plain-text content', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRunWithCaretAt(runNode, '/fire', 5);
    fireEvent.mouseDown(container.querySelector('.be-slash-menu-item'));

    expect(store.getBlock('root').contentIds).toEqual(['p1']); // still no new block
    const p1 = store.getBlock('p1');
    expect(p1.contentIds.length).toBe(1); // one plain text run, not a chip + trailing empty text
    expect(store.getRun(p1.contentIds[0]).type).toBe('text');
    expect(store.getRun(p1.contentIds[0]).value).toBe('🔥');
  });

  it('selecting an emoji mid-text splices it in at the cursor, preserving text on both sides in ONE run', () => {
    const store = new EditorStore(makeDoc());
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    const text = 'nice /fire work';
    typeIntoRunWithCaretAt(runNode, text, 'nice /fire'.length);
    fireEvent.mouseDown(container.querySelector('.be-slash-menu-item'));

    const p1 = store.getBlock('p1');
    expect(p1.contentIds.length).toBe(1); // spliced into the same run, no atomic chip run created
    expect(store.getRun(p1.contentIds[0]).value).toBe('nice 🔥 work');
  });

  it('undo restores the run to its state before typing "/fire" and inserting (History coalesces the rapid same-run edits into one step)', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const runNode = container.querySelector('[data-run-id="r1"]');

    typeIntoRunWithCaretAt(runNode, '/fire', 5);
    fireEvent.mouseDown(container.querySelector('.be-slash-menu-item'));
    expect(store.getRun('r1').value).toBe('🔥');

    act(() => store.undo());
    expect(store.getRun('r1').value).toBe('');
  });
});
