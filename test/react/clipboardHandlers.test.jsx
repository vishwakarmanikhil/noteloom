import { describe, it, expect } from 'vitest';
import { render, fireEvent, act, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { EditorProvider, useBlockRangeSelection } from '../../src/react/EditorProvider.jsx';
import { BlockChildren } from '../../src/react/BlockChildren.jsx';
import { createBlockRegistry } from '../../src/registry/blockRegistry.js';
import { registerBuiltInBlocks } from '../../src/blocks/index.js';
import { useClipboardHandlers } from '../../src/react/useClipboardHandlers.js';
import { useEditorKeyboardShortcuts } from '../../src/react/useEditorKeyboardShortcuts.js';
import { APP_MIME } from '../../src/clipboard/mimeType.js';
import { serializeBlockRange } from '../../src/clipboard/serialize.js';
import { createEmbedBlock } from '../../src/blocks/embed/createEmbedBlock.js';
import { insertBlock } from '../../src/store/operations.js';

class FakeDataTransfer {
  constructor(initial = {}, files = []) {
    this._data = { ...initial };
    this.files = files;
  }
  setData(type, value) {
    this._data[type] = value;
  }
  getData(type) {
    return this._data[type] ?? '';
  }
  get types() {
    return Object.keys(this._data);
  }
}

function fireClipboardEvent(node, type, dataTransfer) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
  fireEvent(node, event);
  return event;
}

function Harness() {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  return (
    <div ref={containerRef} onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
      <BlockChildren parentId="root" />
    </div>
  );
}

function renderHarness(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return {
    ...render(
      <EditorProvider store={store} registry={registry}>
        <Harness />
      </EditorProvider>,
    ),
    registry,
  };
}

function renderHarnessWithUpload(store, uploadOptions) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry} {...uploadOptions}>
      <Harness />
    </EditorProvider>,
  );
}

// Combines both hooks the way a real app does — needed for the whole-
// document-selected tests, since that state is only ever set via Ctrl+A
// through useEditorKeyboardShortcuts.
function FullHarness() {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  useEditorKeyboardShortcuts(containerRef);
  return (
    <div ref={containerRef} onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
      <BlockChildren parentId="root" />
    </div>
  );
}

function renderFullHarness(store) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  return render(
    <EditorProvider store={store} registry={registry}>
      <FullHarness />
    </EditorProvider>,
  );
}

// jsdom doesn't implement real native "select all" — simulate the state a
// first Ctrl+A press would have produced (the whole run selected), then
// fire the keydown that represents the *second* press, which is the one
// our own code acts on.
function selectEntireDocumentViaCtrlA(runNode) {
  selectWithinRunNode(runNode, 0, runNode.textContent.length);
  act(() =>
    runNode.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}

function selectWithinRunNode(runNode, start, end) {
  const textNode = runNode.firstChild;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectAcrossRunNodes(startRunNode, startOffset, endRunNode, endOffset) {
  const range = document.createRange();
  range.setStart(startRunNode.firstChild, startOffset);
  range.setEnd(endRunNode.firstChild, endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function makeTwoParagraphDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1', 'p2'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      { id: 'p2', type: 'paragraph', parentId: 'root', contentIds: ['r2'], props: {} },
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'first line', marks: {} },
      { id: 'r2', type: 'text', value: 'second line', marks: {} },
    ],
  };
}

describe('useClipboardHandlers: Cut actually deletes the selection', () => {
  it('Cut within one block writes the clipboard and removes the selected text, one atomic undo step', () => {
    const rawStore = new EditorStore(makeTwoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(r1Node, 6, 10); // "line"
    const dt = new FakeDataTransfer();
    const event = fireClipboardEvent(container.firstChild, 'cut', dt);

    expect(event.defaultPrevented).toBe(true);
    // Copy's block-range resolution copies the whole containing block
    // regardless of partial-text selection (documented v0.1 scope of
    // resolveSelectedBlockIds) — the important thing Cut adds is that the
    // *store* deletion below is still precise, matching the actual
    // selection exactly.
    expect(dt.getData('text/plain')).toBe('first line');
    expect(store.getRun('r1').value).toBe('first ');

    store.undo();
    expect(store.getRun('r1').value).toBe('first line');
  });

  it('Cut across two sibling blocks writes the clipboard and deletes+merges them, one atomic undo step', () => {
    const rawStore = new EditorStore(makeTwoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');
    const r2Node = container.querySelector('[data-run-id="r2"]');

    selectAcrossRunNodes(r1Node, 6, r2Node, 6); // "line" through "second"
    const dt = new FakeDataTransfer();
    fireClipboardEvent(container.firstChild, 'cut', dt);

    expect(store.getBlock('root').contentIds).toEqual(['p1']);
    const mergedText = store
      .getBlock('p1')
      .contentIds.map((id) => store.getRun(id).value)
      .join('');
    expect(mergedText).toBe('first  line');

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(store.getRun('r1').value).toBe('first line');
    expect(store.getRun('r2').value).toBe('second line');
  });
});

describe('useClipboardHandlers: Paste replaces an active selection', () => {
  it('pasting plain text over a same-block selection splices it inline, in the same block — not a new one', () => {
    const rawStore = new EditorStore(makeTwoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(r1Node, 6, 10); // "line"
    const dt = new FakeDataTransfer({ 'text/plain': 'ROW' });
    fireClipboardEvent(container.firstChild, 'paste', dt);

    // no new sibling block: "ROW" replaced "line" in place, same as typing
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(store.getRun('r1').value).toBe('first ROW');

    store.undo(); // undoes the inline insert
    store.undo(); // undoes the selection deletion
    expect(store.getRun('r1').value).toBe('first line');
  });

  it('pasting multiple blocks is one atomic undo step (previously one step per inserted block)', () => {
    const rawStore = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
        { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
      ],
      runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
    });
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    // collapsed caret, nothing selected: pure insert-after-current-block path
    const range = document.createRange();
    range.setStart(r1Node.firstChild, 5);
    range.setEnd(r1Node.firstChild, 5);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const dt = new FakeDataTransfer({ 'text/plain': 'line one\nline two\nline three' });
    fireClipboardEvent(container.firstChild, 'paste', dt);

    const rootIdsAfterPaste = store.getBlock('root').contentIds;
    expect(rootIdsAfterPaste.length).toBe(4); // original + 3 pasted paragraphs

    store.undo(); // must undo ALL three inserted blocks in one press
    expect(store.getBlock('root').contentIds).toEqual(['p1']);
  });

  it('pasting a single-run app-native MIME block over a selection splices its text inline too', () => {
    const sourceStore = new EditorStore(makeTwoParagraphDoc());
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const { json } = serializeBlockRange(sourceStore, registry, ['p2']);

    const rawStore = new EditorStore(makeTwoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectWithinRunNode(r1Node, 0, 'first line'.length); // whole p1 text selected
    const dt = new FakeDataTransfer({ [APP_MIME]: json, 'text/plain': 'second line' });
    fireClipboardEvent(container.firstChild, 'paste', dt);

    // spliced into p1 in place — no extra sibling block for a single-run paste
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(store.getRun('r1').value).toBe('second line');
  });

  it('pasting a structured (multi-block or non-text) clipboard entry still inserts as a new sibling block', () => {
    const store = new History(new EditorStore(makeTwoParagraphDoc()));
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    const range = document.createRange();
    range.setStart(r1Node.firstChild, 5);
    range.setEnd(r1Node.firstChild, 5);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const dt = new FakeDataTransfer({ 'text/html': '<ul><li>a</li><li>b</li></ul>' });
    fireClipboardEvent(container.firstChild, 'paste', dt);

    expect(store.getRun('r1').value).toBe('first line'); // untouched: not a simple single-run text paste
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(4); // p1, p2, + 2 inserted list items
  });
});

describe('useClipboardHandlers: pasting a raw file straight off the clipboard (screenshot, OS "Copy Image")', () => {
  it('inserts an embed block via the data: URL fallback when no uploadFile is configured', async () => {
    const store = new History(new EditorStore(makeTwoParagraphDoc()));
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    const range = document.createRange();
    range.setStart(r1Node.firstChild, 5);
    range.setEnd(r1Node.firstChild, 5);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const file = new File(['fake-png-bytes'], 'screenshot.png', { type: 'image/png' });
    const dt = new FakeDataTransfer({}, [file]);
    const event = fireClipboardEvent(container.firstChild, 'paste', dt);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(store.getBlock('root').contentIds.length).toBe(3));
    const insertedId = store.getBlock('root').contentIds[1];
    const inserted = store.getBlock(insertedId);
    expect(inserted.type).toBe('embed');
    expect(inserted.props.kind).toBe('image');
    expect(inserted.props.src).toMatch(/^data:image\/png/);

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
  });

  it('routes through the configured uploadFile instead of a data: URL when one is set', async () => {
    const store = new History(new EditorStore(makeTwoParagraphDoc()));
    const uploadFile = async (file) => ({ src: `https://cdn.example.com/${file.name}` });
    const { container } = renderHarnessWithUpload(store, { uploadFile });
    const r1Node = container.querySelector('[data-run-id="r1"]');

    const range = document.createRange();
    range.setStart(r1Node.firstChild, 5);
    range.setEnd(r1Node.firstChild, 5);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const file = new File(['fake-png-bytes'], 'screenshot.png', { type: 'image/png' });
    const dt = new FakeDataTransfer({}, [file]);
    fireClipboardEvent(container.firstChild, 'paste', dt);

    await waitFor(() => expect(store.getBlock('root').contentIds.length).toBe(3));
    const insertedId = store.getBlock('root').contentIds[1];
    expect(store.getBlock(insertedId).props.src).toBe('https://cdn.example.com/screenshot.png');
  });

  it('takes priority over text/html on the same clipboard event', async () => {
    const store = new History(new EditorStore(makeTwoParagraphDoc()));
    const { container } = renderHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    const range = document.createRange();
    range.setStart(r1Node.firstChild, 5);
    range.setEnd(r1Node.firstChild, 5);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const file = new File(['fake-png-bytes'], 'screenshot.png', { type: 'image/png' });
    const dt = new FakeDataTransfer({ 'text/html': '<ul><li>a</li><li>b</li></ul>' }, [file]);
    fireClipboardEvent(container.firstChild, 'paste', dt);

    await waitFor(() => expect(store.getBlock('root').contentIds.length).toBe(3));
    const insertedId = store.getBlock('root').contentIds[1];
    expect(store.getBlock(insertedId).type).toBe('embed'); // not the <ul>'s list items
  });
});

describe('useClipboardHandlers: leaves plain <input>/<textarea> fields (embed URL box, FindBar, modals, ...) alone', () => {
  it("pasting into the embed block's own URL input does not hijack it into inserting a new block elsewhere in the document", () => {
    const store = new EditorStore(makeTwoParagraphDoc());
    const { block, runs = [] } = createEmbedBlock({ kind: 'file' })('root');
    store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block], runs }));
    const { container } = renderHarness(store);

    const urlInput = container.querySelector(`[data-block-id="${block.id}"] .be-embed-url-input`);
    expect(urlInput).not.toBeNull();

    const dt = new FakeDataTransfer({ 'text/plain': 'https://example.com/a.pdf' });
    const event = fireClipboardEvent(urlInput, 'paste', dt);

    // The browser's own native paste-into-<input> behavior is left to
    // proceed (not hijacked into inserting a block), and nothing was
    // inserted into the document as a side effect.
    expect(event.defaultPrevented).toBe(false);
    expect(store.getBlock('root').contentIds).toEqual([block.id, 'p1', 'p2']);
  });

  it("copying/cutting inside a plain input is also left alone (the field's own native selection, not a block-range serialization)", () => {
    const store = new EditorStore(makeTwoParagraphDoc());
    const { block, runs = [] } = createEmbedBlock({ kind: 'file' })('root');
    store.applyOperation(insertBlock(block, 'root', 0, { blocks: [block], runs }));
    const { container } = renderHarness(store);
    const urlInput = container.querySelector(`[data-block-id="${block.id}"] .be-embed-url-input`);

    const copyDt = new FakeDataTransfer();
    const copyEvent = fireClipboardEvent(urlInput, 'copy', copyDt);
    expect(copyEvent.defaultPrevented).toBe(false);
    expect(copyDt.getData('text/plain')).toBe(''); // never written to by our handler

    const cutDt = new FakeDataTransfer();
    fireClipboardEvent(urlInput, 'cut', cutDt);
    expect(store.getBlock('root').contentIds).toEqual([block.id, 'p1', 'p2']); // nothing deleted from the document
  });
});

describe('useClipboardHandlers: whole-document-selected (custom "select all", second Ctrl+A)', () => {
  it('Copy serializes every top-level block, not just the block containing the caret', () => {
    const store = new EditorStore(makeTwoParagraphDoc());
    const { container } = renderFullHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectEntireDocumentViaCtrlA(r1Node);

    const dt = new FakeDataTransfer();
    fireClipboardEvent(container.firstChild, 'copy', dt);

    expect(dt.getData('text/plain')).toBe('first line\nsecond line');
  });

  it('Cut copies everything, clears the document to one blank paragraph, and exits whole-document-selected', () => {
    const rawStore = new EditorStore(makeTwoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderFullHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectEntireDocumentViaCtrlA(r1Node);

    const dt = new FakeDataTransfer();
    fireClipboardEvent(container.firstChild, 'cut', dt);

    expect(dt.getData('text/plain')).toBe('first line\nsecond line');
    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(1);
    const survivor = store.getBlock(rootIds[0]);
    expect(survivor.type).toBe('paragraph');
    expect(store.getRun(survivor.contentIds[0]).value).toBe('');

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(store.getRun('r1').value).toBe('first line');
    expect(store.getRun('r2').value).toBe('second line');
  });

  it('Paste while whole-document-selected replaces the entire document with the pasted content', () => {
    const rawStore = new EditorStore(makeTwoParagraphDoc());
    const store = new History(rawStore);
    const { container } = renderFullHarness(store);
    const r1Node = container.querySelector('[data-run-id="r1"]');

    selectEntireDocumentViaCtrlA(r1Node);

    const dt = new FakeDataTransfer({ 'text/plain': 'brand new content' });
    fireClipboardEvent(container.firstChild, 'paste', dt);

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(1);
    const survivor = store.getBlock(rootIds[0]);
    expect(store.getRun(survivor.contentIds[0]).value).toBe('brand new content');

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
    expect(store.getRun('r1').value).toBe('first line');
    expect(store.getRun('r2').value).toBe('second line');
  });
});

function RangeHarness({ ids }) {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const [, setSelectedBlockRange] = useBlockRangeSelection();
  return (
    <div ref={containerRef} onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
      <button type="button" onClick={() => setSelectedBlockRange(ids)}>
        select-range
      </button>
      <BlockChildren parentId="root" />
    </div>
  );
}

function renderRangeHarness(store, ids) {
  const registry = createBlockRegistry();
  registerBuiltInBlocks(registry);
  const rendered = render(
    <EditorProvider store={store} registry={registry}>
      <RangeHarness ids={ids} />
    </EditorProvider>,
  );
  fireEvent.click(rendered.getByText('select-range'));
  return rendered;
}

describe('useClipboardHandlers: a drag-selected block range takes priority over the native browser selection', () => {
  it('Copy serializes exactly the range, ignoring whatever native selection (if any) happens to also exist', () => {
    const store = new EditorStore(makeTwoParagraphDoc());
    const { container } = renderRangeHarness(store, ['p2']);

    // Also place a native selection inside p1 — the range selection must win regardless.
    selectWithinRunNode(container.querySelector('[data-run-id="r1"]'), 0, 5);

    const dt = new FakeDataTransfer();
    fireClipboardEvent(container.firstChild, 'copy', dt);

    expect(dt.getData('text/plain')).toBe('second line');
  });

  it('Cut removes every block in the range as one step and clears the range afterward', () => {
    const store = new History(new EditorStore(makeTwoParagraphDoc()));
    const { container } = renderRangeHarness(store, ['p1', 'p2']);

    const dt = new FakeDataTransfer();
    fireClipboardEvent(container.firstChild, 'cut', dt);

    expect(dt.getData('text/plain')).toBe('first line\nsecond line');
    expect(store.getBlock('root').contentIds).toEqual([]);

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
  });

  it("Paste replaces the range with the pasted content, starting at the range's former position", () => {
    const store = new History(new EditorStore(makeTwoParagraphDoc()));
    const { container } = renderRangeHarness(store, ['p1']);

    const dt = new FakeDataTransfer({ 'text/plain': 'replacement' });
    fireClipboardEvent(container.firstChild, 'paste', dt);

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds.length).toBe(2);
    const [newId, survivorId] = rootIds;
    expect(store.getRun(store.getBlock(newId).contentIds[0]).value).toBe('replacement');
    expect(survivorId).toBe('p2');

    store.undo();
    expect(store.getBlock('root').contentIds).toEqual(['p1', 'p2']);
  });
});
