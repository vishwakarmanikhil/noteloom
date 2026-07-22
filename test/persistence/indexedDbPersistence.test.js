import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  savePersistedDocument,
  loadPersistedDocument,
  deletePersistedDocument,
  listPersistedDocumentIds,
} from '../../src/persistence/indexedDbPersistence.js';

function makeDoc(marker) {
  return {
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
    runs: [],
    marker,
  };
}

describe('indexedDbPersistence', () => {
  it('loadPersistedDocument returns null for a docId that was never saved', async () => {
    const doc = await loadPersistedDocument('never-saved-doc');
    expect(doc).toBeNull();
  });

  it('round-trips a saved document exactly', async () => {
    const doc = makeDoc('round-trip');
    await savePersistedDocument('doc-round-trip', doc);
    const loaded = await loadPersistedDocument('doc-round-trip');
    expect(loaded).toEqual(doc);
  });

  it('saving again under the same docId overwrites the previous value', async () => {
    await savePersistedDocument('doc-overwrite', makeDoc('first'));
    await savePersistedDocument('doc-overwrite', makeDoc('second'));
    const loaded = await loadPersistedDocument('doc-overwrite');
    expect(loaded.marker).toBe('second');
  });

  it('deletePersistedDocument removes it -- loading afterward returns null', async () => {
    await savePersistedDocument('doc-to-delete', makeDoc('x'));
    await deletePersistedDocument('doc-to-delete');
    const loaded = await loadPersistedDocument('doc-to-delete');
    expect(loaded).toBeNull();
  });

  it('deleting a docId that was never saved is a harmless no-op', async () => {
    await expect(deletePersistedDocument('never-existed')).resolves.toBeUndefined();
  });

  it('listPersistedDocumentIds includes every saved docId', async () => {
    await savePersistedDocument('doc-list-a', makeDoc('a'));
    await savePersistedDocument('doc-list-b', makeDoc('b'));
    const ids = await listPersistedDocumentIds();
    expect(ids).toContain('doc-list-a');
    expect(ids).toContain('doc-list-b');
  });

  it('two different docIds are stored independently', async () => {
    await savePersistedDocument('doc-independent-1', makeDoc('one'));
    await savePersistedDocument('doc-independent-2', makeDoc('two'));
    expect((await loadPersistedDocument('doc-independent-1')).marker).toBe('one');
    expect((await loadPersistedDocument('doc-independent-2')).marker).toBe('two');
  });
});
