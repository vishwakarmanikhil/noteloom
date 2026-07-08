import { describe, it, expect, vi } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { insertSiblingAfterAndFocus, trimSlashQueryAndInsertAfter } from '../../src/blocks/shared/blockCommands.js';
import { createTextLeafBlock } from '../../src/blocks/shared/leafBlockFactory.js';
import { createListItemBlock } from '../../src/blocks/listItem/createListItemBlock.js';

vi.mock('../../src/react/focusRun.js', () => ({ focusRunEnd: vi.fn() }));
import { focusRunEnd } from '../../src/react/focusRun.js';

function makeDocWithParagraph(value) {
  return new EditorStore({
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value, marks: {} }],
  });
}

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
      { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
    ],
    runs: [{ id: 'r1', type: 'text', value: 'hello', marks: {} }],
  };
}

describe('insertSiblingAfterAndFocus', () => {
  it('inserts the new block (same as insertSiblingAfter) and focuses its first run', () => {
    const store = new EditorStore(makeDoc());
    focusRunEnd.mockClear();

    const newBlockId = insertSiblingAfterAndFocus(store, 'p1', createTextLeafBlock('paragraph'));

    const rootContentIds = store.getBlock('root').contentIds;
    expect(rootContentIds).toEqual(['p1', newBlockId]);
    const newBlock = store.getBlock(newBlockId);
    expect(newBlock.type).toBe('paragraph');

    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith(newBlock.contentIds[0]); // the new (empty) paragraph's run, not the old block's
  });
});

describe('trimSlashQueryAndInsertAfter: empty-block in-place conversion (regression)', () => {
  it('converts an empty block in place instead of leaving it behind with a new sibling after it', () => {
    const store = makeDocWithParagraph('/hea'); // p1's only run — trimming it away leaves p1 empty
    const newBlockId = trimSlashQueryAndInsertAfter(
      store,
      { blockId: 'p1', runId: 'r1', sliceStart: 0, sliceEnd: '/hea'.length },
      createTextLeafBlock('heading', { level: 1 }),
    );

    const rootIds = store.getBlock('root').contentIds;
    expect(rootIds).toEqual([newBlockId]); // no leftover empty block, no extra sibling
    expect(store.getBlock('p1')).toBeUndefined();
    expect(store.getBlock(newBlockId).type).toBe('heading');
  });

  it('still inserts a sibling after when the block keeps other content (not actually empty)', () => {
    const store = makeDocWithParagraph('hello /table');
    const newBlockId = trimSlashQueryAndInsertAfter(
      store,
      { blockId: 'p1', runId: 'r1', sliceStart: 'hello '.length, sliceEnd: 'hello /table'.length },
      createTextLeafBlock('table'),
    );

    expect(store.getRun('r1').value).toBe('hello ');
    expect(store.getBlock('root').contentIds).toEqual(['p1', newBlockId]);
    expect(store.getBlock(newBlockId).type).toBe('table');
  });

  it('does not convert in place — and so does not destroy nested children — when the block has them (e.g. an indented list item)', () => {
    const store = new EditorStore({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'page', parentId: null, contentIds: ['li1'], props: {} },
        {
          id: 'li1',
          type: 'listItem',
          parentId: 'root',
          contentIds: ['li1-child'],
          props: { ordered: false, titleRunIds: ['r1'] },
        },
        {
          id: 'li1-child',
          type: 'listItem',
          parentId: 'li1',
          contentIds: [],
          props: { ordered: false, titleRunIds: ['r-child'] },
        },
      ],
      runs: [
        { id: 'r1', type: 'text', value: '/hea', marks: {} },
        { id: 'r-child', type: 'text', value: 'nested item', marks: {} },
      ],
    });

    const newBlockId = trimSlashQueryAndInsertAfter(
      store,
      { blockId: 'li1', runId: 'r1', sliceStart: 0, sliceEnd: '/hea'.length },
      createListItemBlock({ ordered: true }),
    );

    // li1 must still exist with its nested child intact — replaceBlockInPlace's
    // removeBlock would otherwise cascade-delete "nested item" along with it.
    expect(store.getBlock('li1')).toBeDefined();
    expect(store.getBlock('li1').contentIds).toEqual(['li1-child']);
    expect(store.getRun('r-child').value).toBe('nested item');
    expect(store.getBlock('root').contentIds).toEqual(['li1', newBlockId]);
  });
});
