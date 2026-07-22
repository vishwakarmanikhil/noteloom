import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { updateRun } from '../../src/store/operations.js';
import { createAutoPersistence } from '../../src/persistence/autoPersist.js';
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createAutoPersistence', () => {
  it('debounces: a single edit is saved once, after debounceMs of quiet, not immediately', async () => {
    const store = new EditorStore(makeDoc());
    const { stop } = createAutoPersistence({ store, docId: 'debounce-test-1', debounceMs: 50 });

    store.applyOperation(updateRun('r1', { value: 'edited' }));
    expect(await loadPersistedDocument('debounce-test-1')).toBeNull(); // not yet -- still within the debounce window

    await wait(150);
    const saved = await loadPersistedDocument('debounce-test-1');
    expect(saved.runs.find((r) => r.id === 'r1').value).toBe('edited');

    stop();
  });

  it('several rapid edits within the debounce window collapse into a single save of the final state', async () => {
    const store = new EditorStore(makeDoc());
    const { stop } = createAutoPersistence({ store, docId: 'debounce-test-2', debounceMs: 60 });

    store.applyOperation(updateRun('r1', { value: 'a' }));
    await wait(20);
    store.applyOperation(updateRun('r1', { value: 'ab' }));
    await wait(20);
    store.applyOperation(updateRun('r1', { value: 'abc' }));
    await wait(150);

    const saved = await loadPersistedDocument('debounce-test-2');
    expect(saved.runs.find((r) => r.id === 'r1').value).toBe('abc');

    stop();
  });

  it('works with a History-wrapped store too (History delegates subscribeAll/toJSON to the underlying EditorStore)', async () => {
    const history = new History(new EditorStore(makeDoc()));
    const { stop } = createAutoPersistence({ store: history, docId: 'debounce-test-history', debounceMs: 50 });

    history.perform(updateRun('r1', { value: 'via history' }));
    await wait(150);

    const saved = await loadPersistedDocument('debounce-test-history');
    expect(saved.runs.find((r) => r.id === 'r1').value).toBe('via history');

    stop();
  });

  it('remote edits (applyRemoteOperation) also trigger a save, since subscribeAll does not distinguish local from remote', async () => {
    const store = new EditorStore(makeDoc());
    const remoteStore = new EditorStore(makeDoc());
    const { stop } = createAutoPersistence({ store, docId: 'debounce-test-remote', debounceMs: 50 });

    remoteStore.applyOperation(updateRun('r1', { value: 'from a peer' }));
    store.applyRemoteOperation(remoteStore.getLastEnvelope());
    await wait(150);

    const saved = await loadPersistedDocument('debounce-test-remote');
    expect(saved.runs.find((r) => r.id === 'r1').value).toBe('from a peer');

    stop();
  });

  it('flush() saves immediately without waiting for the debounce window', async () => {
    const store = new EditorStore(makeDoc());
    const { stop, flush } = createAutoPersistence({ store, docId: 'debounce-test-flush', debounceMs: 5000 });

    store.applyOperation(updateRun('r1', { value: 'flushed' }));
    flush();
    await wait(20);

    const saved = await loadPersistedDocument('debounce-test-flush');
    expect(saved.runs.find((r) => r.id === 'r1').value).toBe('flushed');

    stop();
  });

  it('stop() cancels a pending debounced save that has not fired yet', async () => {
    const store = new EditorStore(makeDoc());
    const { stop } = createAutoPersistence({ store, docId: 'debounce-test-stop', debounceMs: 50 });

    store.applyOperation(updateRun('r1', { value: 'should not be saved' }));
    stop();
    await wait(150);

    expect(await loadPersistedDocument('debounce-test-stop')).toBeNull();
  });
});
