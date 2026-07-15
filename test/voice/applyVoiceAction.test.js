import { describe, it, expect, vi } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { applyVoiceAction } from '../../src/voice/applyVoiceAction.js';
import { updateRun } from '../../src/store/operations.js';

vi.mock('../../src/react/focusRun.js', () => ({ focusRunEnd: vi.fn(), focusRunStart: vi.fn(), focusRunAtOffset: vi.fn() }));
vi.mock('../../src/blocks/shared/navigationCommands.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, focusBlockStart: vi.fn() };
});

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello world', marks: {} }],
  };
}

describe('applyVoiceAction: insertParagraph', () => {
  it('inserts a new paragraph right after the current block', () => {
    const store = new EditorStore(makeDoc());
    applyVoiceAction(store, 'p1', { type: 'insertParagraph' });

    const contentIds = store.getBlock('root').contentIds;
    expect(contentIds.length).toBe(2);
    expect(contentIds[0]).toBe('p1');
    expect(store.getBlock(contentIds[1]).type).toBe('paragraph');
  });
});

describe('applyVoiceAction: convertBlock', () => {
  it('converts the current block to the target type, preserving already-dictated text', () => {
    const store = new EditorStore(makeDoc());
    applyVoiceAction(store, 'p1', { type: 'convertBlock', blockType: 'heading', props: { level: 1 } });

    const newBlockId = store.getBlock('root').contentIds[0];
    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('heading');
    expect(newBlock.props.level).toBe(1);
    expect(store.getRun(newBlock.contentIds[0]).value).toBe('hello world'); // dictated text survived
    expect(store.getBlock('p1')).toBeUndefined(); // old block gone, not left behind
  });

  it('converts to a listItem shape (titleRunIds), same as a markdown shortcut would', () => {
    const store = new EditorStore(makeDoc());
    applyVoiceAction(store, 'p1', {
      type: 'convertBlock',
      blockType: 'listItem',
      props: { ordered: false, titleRunIds: [] },
    });

    const newBlockId = store.getBlock('root').contentIds[0];
    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('listItem');
    expect(store.getRun(newBlock.props.titleRunIds[0]).value).toBe('hello world');
  });

  it('is a no-op when the block no longer exists', () => {
    const store = new EditorStore(makeDoc());
    expect(() =>
      applyVoiceAction(store, 'does-not-exist', { type: 'convertBlock', blockType: 'heading', props: { level: 1 } }),
    ).not.toThrow();
    expect(store.getBlock('p1')).toBeDefined(); // untouched
  });
});

describe('applyVoiceAction: undo/redo', () => {
  it('undoes the last edit and redoes it', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    store.applyOperation(updateRun('r1', { value: 'hello world!' }));

    applyVoiceAction(store, 'p1', { type: 'undo' });
    expect(store.getRun('r1').value).toBe('hello world');

    applyVoiceAction(store, 'p1', { type: 'redo' });
    expect(store.getRun('r1').value).toBe('hello world!');
  });

  it('is a no-op on a plain EditorStore with no History (no undo/redo available)', () => {
    const store = new EditorStore(makeDoc());
    expect(() => applyVoiceAction(store, 'p1', { type: 'undo' })).not.toThrow();
    expect(() => applyVoiceAction(store, 'p1', { type: 'redo' })).not.toThrow();
  });
});
