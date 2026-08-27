import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  saveDocumentVersion,
  loadDocumentVersion,
  deleteDocumentVersion,
  listDocumentVersions,
  saveTemplate,
  loadTemplate,
} from '../../src/persistence/indexedDbPersistence.js';

function makeVersion(id, overrides = {}) {
  return {
    id,
    docId: 'doc-1',
    timestamp: Date.now(),
    label: undefined,
    doc: {
      rootId: 'root',
      blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
      runs: [],
    },
    ...overrides,
  };
}

describe('version storage (separate object store from documents/templates, same DB)', () => {
  it('loadDocumentVersion returns null for an id that was never saved', async () => {
    expect(await loadDocumentVersion('never-saved-version')).toBeNull();
  });

  it('round-trips a saved version exactly', async () => {
    const version = makeVersion('round-trip');
    await saveDocumentVersion(version);
    expect(await loadDocumentVersion('round-trip')).toEqual(version);
  });

  it('saving again under the same id overwrites the previous value', async () => {
    await saveDocumentVersion(makeVersion('overwrite', { label: 'first' }));
    await saveDocumentVersion(makeVersion('overwrite', { label: 'second' }));
    expect((await loadDocumentVersion('overwrite')).label).toBe('second');
  });

  it('deleteDocumentVersion removes it -- loading afterward returns null', async () => {
    await saveDocumentVersion(makeVersion('to-delete'));
    await deleteDocumentVersion('to-delete');
    expect(await loadDocumentVersion('to-delete')).toBeNull();
  });

  it('deleting an id that was never saved is a harmless no-op', async () => {
    await expect(deleteDocumentVersion('never-existed')).resolves.toBeUndefined();
  });

  it('listDocumentVersions returns only versions for the given docId, newest first', async () => {
    await saveDocumentVersion(
      makeVersion('v-a', { docId: 'doc-list', timestamp: 100, label: 'A' }),
    );
    await saveDocumentVersion(
      makeVersion('v-b', { docId: 'doc-list', timestamp: 200, label: 'B' }),
    );
    await saveDocumentVersion(
      makeVersion('v-other', { docId: 'doc-list-2', timestamp: 300, label: 'Other' }),
    );

    const versions = await listDocumentVersions('doc-list');
    expect(versions.map((v) => v.id)).toEqual(['v-b', 'v-a']);
    expect(versions.every((v) => v.docId === 'doc-list')).toBe(true);
  });

  it('is a separate store from templates -- saving a version does not affect a template under the same id, and vice versa', async () => {
    const sharedId = 'shared-id';
    await saveTemplate({
      id: sharedId,
      scope: 'document',
      name: 'the-template',
      doc: { rootId: 'r', blocks: [], runs: [] },
    });
    await saveDocumentVersion(makeVersion(sharedId, { label: 'the-version' }));

    expect((await loadTemplate(sharedId)).name).toBe('the-template');
    expect((await loadDocumentVersion(sharedId)).label).toBe('the-version');
  });
});
