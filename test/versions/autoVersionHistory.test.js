import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { updateRun } from '../../src/store/operations.js';
import { createAutoVersionHistory } from '../../src/versions/autoVersionHistory.js';
import { listDocumentVersions } from '../../src/persistence/indexedDbPersistence.js';

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let docCounter = 0;
const freshDocId = () => `auto-version-doc-${docCounter++}`; // real fake-indexeddb persists across tests in this file -- isolate by docId instead of resetting the DB

describe('createAutoVersionHistory', () => {
  it('saves nothing until idleMs of inactivity has passed since the last edit', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 150 });

    history.perform(updateRun('r1', { value: 'hi' }));
    await sleep(60);
    expect(await listDocumentVersions(docId)).toEqual([]);

    await sleep(150);
    expect(await listDocumentVersions(docId)).toHaveLength(1);

    auto.stop();
  });

  it('attributes the saved version to defaultActorId, via History', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 50 });

    history.perform(updateRun('r1', { value: 'hi' }));
    await sleep(150);

    const [version] = await listDocumentVersions(docId);
    expect(version.authorId).toBe('alice');
    expect(version.authorIds).toEqual(['alice']);
    expect(version.doc.runs.find((r) => r.id === 'r1').value).toBe('hi');

    auto.stop();
  });

  it('resets the idle timer on each new edit, not saving until edits actually stop', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 150 });

    history.perform(updateRun('r1', { value: 'h' }));
    await sleep(100);
    history.perform(updateRun('r1', { value: 'he' })); // resets the idle timer before it would've fired
    await sleep(100); // 200ms since the first edit, but only 100ms since the second
    expect(await listDocumentVersions(docId)).toEqual([]);

    await sleep(120); // now well past 150ms since the second edit
    expect(await listDocumentVersions(docId)).toHaveLength(1);

    auto.stop();
  });

  it('groups every distinct actor active in the window into authorIds, attributing to the most recent one', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()));
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 50 });

    history.perform(updateRun('r1', { value: 'a' }), { actorId: 'alice' });
    history.performBatch([updateRun('r1', { value: 'ab' })], { actorId: 'bob' }); // its own step, no run-coalescing with the line above
    await sleep(150);

    const [version] = await listDocumentVersions(docId);
    expect(version.authorId).toBe('bob');
    expect(version.authorIds.sort()).toEqual(['alice', 'bob']);

    auto.stop();
  });

  it('a plain undo with nothing else happening saves no additional version', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 50 });

    history.perform(updateRun('r1', { value: 'hi' }));
    await sleep(150); // first version saved

    history.undo();
    await sleep(150);

    expect(await listDocumentVersions(docId)).toHaveLength(1); // still just the one from the real edit

    auto.stop();
  });

  it('prunes the oldest versions once beyond maxVersions', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 30, maxVersions: 2 });

    for (let i = 0; i < 3; i += 1) {
      history.perform(updateRun('r1', { value: `v${i}` }));
      await sleep(80);
    }

    expect(await listDocumentVersions(docId)).toHaveLength(2);

    auto.stop();
  });

  it('flush() closes and saves the current window immediately, without waiting for idleMs', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 60000 });

    history.perform(updateRun('r1', { value: 'hi' }));
    await auto.flush();

    expect(await listDocumentVersions(docId)).toHaveLength(1);

    auto.stop();
  });

  it('stop() unsubscribes -- no version is saved for edits made afterward', async () => {
    const docId = freshDocId();
    const history = new History(new EditorStore(makeDoc()), { defaultActorId: 'alice' });
    const auto = createAutoVersionHistory({ store: history, docId, idleMs: 50 });

    auto.stop();
    history.perform(updateRun('r1', { value: 'hi' }));
    await sleep(150);

    expect(await listDocumentVersions(docId)).toEqual([]);
  });
});
