import { describe, it, expect, vi } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { indentListItem, outdentListItem } from '../../src/blocks/listItem/indentCommands.js';

vi.mock('../../src/react/focusRun.js', () => ({ focusRunEnd: vi.fn() }));
import { focusRunEnd } from '../../src/react/focusRun.js';

function li(id, parentId, titleRunIds, contentIds = []) {
  return { id, type: 'listItem', parentId, contentIds, props: { ordered: false, titleRunIds } };
}

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['li1', 'li2'], props: {} },
      li('li1', 'root', ['r1']),
      li('li2', 'root', ['r2']),
    ],
    runs: [
      { id: 'r1', type: 'text', value: 'one', marks: {} },
      { id: 'r2', type: 'text', value: 'two', marks: {} },
    ],
  };
}

describe('indentListItem/outdentListItem refocus (regression: Tab/Shift+Tab losing the caret)', () => {
  it('indentListItem refocuses the reparented item after a successful indent', () => {
    const store = new EditorStore(makeDoc());
    focusRunEnd.mockClear();

    indentListItem(store, 'li2');

    expect(store.getBlock('li2').parentId).toBe('li1'); // actually reparented
    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith('r2'); // li2's own title run
  });

  it('outdentListItem refocuses the reparented item after a successful outdent', () => {
    const store = new EditorStore(makeDoc());
    indentListItem(store, 'li2'); // nest li2 under li1 first
    focusRunEnd.mockClear();

    outdentListItem(store, 'li2');

    expect(store.getBlock('li2').parentId).toBe('root'); // actually reparented back out
    expect(focusRunEnd).toHaveBeenCalledTimes(1);
    expect(focusRunEnd).toHaveBeenCalledWith('r2');
  });
});
