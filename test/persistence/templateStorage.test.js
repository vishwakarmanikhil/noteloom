import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { saveTemplate, loadTemplate, deleteTemplate, listTemplates } from '../../src/persistence/indexedDbPersistence.js';
import { savePersistedDocument, loadPersistedDocument } from '../../src/persistence/indexedDbPersistence.js';

function makeTemplate(id, overrides = {}) {
  return {
    id,
    scope: 'document',
    name: `Template ${id}`,
    description: 'a test template',
    doc: { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] },
    ...overrides,
  };
}

describe('template storage (separate object store from documents, same DB)', () => {
  it('loadTemplate returns null for an id that was never saved', async () => {
    expect(await loadTemplate('never-saved-template')).toBeNull();
  });

  it('round-trips a saved template exactly', async () => {
    const template = makeTemplate('round-trip');
    await saveTemplate(template);
    expect(await loadTemplate('round-trip')).toEqual(template);
  });

  it('saving again under the same id overwrites the previous value', async () => {
    await saveTemplate(makeTemplate('overwrite', { name: 'first' }));
    await saveTemplate(makeTemplate('overwrite', { name: 'second' }));
    expect((await loadTemplate('overwrite')).name).toBe('second');
  });

  it('deleteTemplate removes it -- loading afterward returns null', async () => {
    await saveTemplate(makeTemplate('to-delete'));
    await deleteTemplate('to-delete');
    expect(await loadTemplate('to-delete')).toBeNull();
  });

  it('deleting an id that was never saved is a harmless no-op', async () => {
    await expect(deleteTemplate('never-existed')).resolves.toBeUndefined();
  });

  it('listTemplates returns full objects (not just ids) for every saved template', async () => {
    await saveTemplate(makeTemplate('list-a', { name: 'A' }));
    await saveTemplate(makeTemplate('list-b', { name: 'B', scope: 'block' }));
    const all = await listTemplates();
    expect(all.find((t) => t.id === 'list-a')).toMatchObject({ name: 'A', scope: 'document' });
    expect(all.find((t) => t.id === 'list-b')).toMatchObject({ name: 'B', scope: 'block' });
  });

  it('a block-scope template stores { roots } as its doc, round-tripping structurally', async () => {
    const blockTemplate = makeTemplate('block-one', {
      scope: 'block',
      doc: { roots: [{ rootId: 'b1', blocks: [{ id: 'b1', type: 'paragraph', parentId: null, contentIds: [], props: {} }], runs: [] }] },
    });
    await saveTemplate(blockTemplate);
    const loaded = await loadTemplate('block-one');
    expect(loaded.doc.roots[0].rootId).toBe('b1');
  });

  it('is a separate store from documents -- saving a template does not affect a persisted document under the same id, and vice versa', async () => {
    const sharedId = 'shared-id';
    await savePersistedDocument(sharedId, { rootId: 'docRoot', blocks: [], runs: [], marker: 'document' });
    await saveTemplate(makeTemplate(sharedId, { name: 'the-template' }));

    expect((await loadPersistedDocument(sharedId)).marker).toBe('document');
    expect((await loadTemplate(sharedId)).name).toBe('the-template');
  });
});
