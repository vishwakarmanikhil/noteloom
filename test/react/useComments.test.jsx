import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { useComments } from '../../src/react/useComments.js';
import {
  addCommentThread,
  removeCommentThread,
  resolveComment,
} from '../../src/store/operations.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
    runs: [],
  };
}

function makeThread(id) {
  return {
    id,
    blockId: 'p1',
    anchorRunIds: ['r1', 'r1'],
    resolved: false,
    messages: [{ id: 'm1', authorId: 'alice', text: 'hi', createdAt: 1 }],
  };
}

function Harness() {
  const comments = useComments();
  return <div data-testid="ids">{comments.map((c) => `${c.id}:${c.resolved}`).join(',')}</div>;
}

describe('useComments', () => {
  it('re-renders with the updated list after add/resolve/remove, empty initially', () => {
    const store = new EditorStore(makeDoc());
    const { getByTestId } = render(
      <EditorProvider store={store} registry={{}}>
        <Harness />
      </EditorProvider>,
    );

    expect(getByTestId('ids').textContent).toBe('');

    act(() => {
      store.applyOperation(addCommentThread(makeThread('c1')));
    });
    expect(getByTestId('ids').textContent).toBe('c1:false');

    act(() => {
      store.applyOperation(resolveComment('c1', true));
    });
    expect(getByTestId('ids').textContent).toBe('c1:true');

    act(() => {
      store.applyOperation(addCommentThread(makeThread('c2')));
    });
    expect(getByTestId('ids').textContent).toBe('c1:true,c2:false');

    act(() => {
      store.applyOperation(removeCommentThread('c1'));
    });
    expect(getByTestId('ids').textContent).toBe('c2:false');
  });
});
