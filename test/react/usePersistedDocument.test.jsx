import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, fireEvent, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { updateRun } from '../../src/store/operations.js';
import { usePersistedDocument } from '../../src/react/usePersistedDocument.js';
import { loadPersistedDocument } from '../../src/persistence/indexedDbPersistence.js';

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

let hookApi;
function renderHarness(store, docId, options) {
  function Wrapper() {
    hookApi = usePersistedDocument({ store, docId, ...options });
    return <div data-testid="loaded">{String(hookApi.isLoaded)}</div>;
  }
  return render(<Wrapper />);
}

let docCounter = 0;
const freshDocId = () => `upd-doc-${docCounter++}`;

describe('usePersistedDocument: Ctrl/Cmd+S save shortcut', () => {
  it('Ctrl+S calls save(), which persists immediately without waiting for the debounce window', async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const { unmount } = renderHarness(store, docId, { debounceMs: 5000 });
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    store.applyOperation(updateRun('r1', { value: 'edited' }));

    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(async () => {
      const saved = await loadPersistedDocument(docId);
      expect(saved?.runs.find((r) => r.id === 'r1').value).toBe('edited');
    });

    unmount();
  });

  it('Cmd+S (metaKey) works the same as Ctrl+S', async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const { unmount } = renderHarness(store, docId, { debounceMs: 5000 });
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    store.applyOperation(updateRun('r1', { value: 'via cmd' }));
    fireEvent.keyDown(document, { key: 's', metaKey: true });

    await waitFor(async () => {
      const saved = await loadPersistedDocument(docId);
      expect(saved?.runs.find((r) => r.id === 'r1').value).toBe('via cmd');
    });

    unmount();
  });

  it("preventDefault() is called, so the browser's own save-page dialog never opens", async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const { unmount } = renderHarness(store, docId);
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it('onSave fires after the shortcut-triggered save completes', async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const onSave = vi.fn();
    const { unmount } = renderHarness(store, docId, { onSave });
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    unmount();
  });

  it('does not fire on Ctrl+Shift+S or Ctrl+Alt+S — only the plain modifier+S', async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const onSave = vi.fn();
    const { unmount } = renderHarness(store, docId, { onSave });
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    fireEvent.keyDown(document, { key: 's', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: 's', ctrlKey: true, altKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onSave).not.toHaveBeenCalled();
    unmount();
  });

  it('plain "s" with no modifier does not trigger a save (normal typing)', async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const onSave = vi.fn();
    const { unmount } = renderHarness(store, docId, { onSave });
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    fireEvent.keyDown(document, { key: 's' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onSave).not.toHaveBeenCalled();
    unmount();
  });

  it('saveShortcut: false opts out of the keyboard listener entirely', async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const onSave = vi.fn();
    const { unmount } = renderHarness(store, docId, { saveShortcut: false, onSave });
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onSave).not.toHaveBeenCalled();
    unmount();
  });

  it('the returned save() function can also be called directly (e.g. from a "Save" button)', async () => {
    const docId = freshDocId();
    const store = new EditorStore(makeDoc());
    const onSave = vi.fn();
    const { unmount } = renderHarness(store, docId, { onSave });
    await waitFor(() => expect(hookApi.isLoaded).toBe(true));

    store.applyOperation(updateRun('r1', { value: 'button save' }));
    await act(async () => {
      await hookApi.save();
    });

    const saved = await loadPersistedDocument(docId);
    expect(saved?.runs.find((r) => r.id === 'r1').value).toBe('button save');
    expect(onSave).toHaveBeenCalledTimes(1);

    unmount();
  });
});
