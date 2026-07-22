import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { insertBlock, removeBlock, updateRun } from '../../src/store/operations.js';
import { CollabSession } from '../../src/sync/CollabSession.js';
import { FakeRTCPeerConnection, makeFakeSignalingNetwork } from './fakeWebrtc.js';

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

function emptyDoc() {
  return { rootId: null, blocks: [], runs: [] };
}

function waitForOpen(peerConnection) {
  return new Promise((resolve) => peerConnection.onOpen(resolve));
}

describe('CollabSession (over a fake in-memory WebRTC transport)', () => {
  let originalRTCPeerConnection;

  beforeEach(() => {
    originalRTCPeerConnection = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = FakeRTCPeerConnection;
  });

  afterEach(() => {
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  });

  async function connectPair(historyA, historyB) {
    const network = makeFakeSignalingNetwork();
    const sessionA = new CollabSession({ history: historyA, signaling: network.makeChannelFor('peer-a') });
    const sessionB = new CollabSession({ history: historyB, signaling: network.makeChannelFor('peer-b') });

    const peerA = sessionA.connect('peer-b', { initiator: true });
    const peerB = sessionB.connect('peer-a', { initiator: false });
    await Promise.all([waitForOpen(peerA), waitForOpen(peerB)]);
    // let the post-open hello/syncRequest/syncResponse round-trip settle
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    return { sessionA, sessionB };
  }

  it('a peer joining empty adopts the other peer\'s existing document on connect', async () => {
    const historyA = new History(new EditorStore(makeDoc()));
    const historyB = new History(new EditorStore(emptyDoc()));

    const { sessionA, sessionB } = await connectPair(historyA, historyB);

    expect(historyB.getBlock('root')).toBeDefined();
    expect(historyB.getBlock('p1').type).toBe('paragraph');
    expect(historyB.getRun('r1').value).toBe('hello');

    sessionA.destroy();
    sessionB.destroy();
  });

  it('a live local edit after connecting propagates to the other peer', async () => {
    const historyA = new History(new EditorStore(makeDoc()));
    const historyB = new History(new EditorStore(makeDoc()));
    const { sessionA, sessionB } = await connectPair(historyA, historyB);

    historyA.performBatch([updateRun('r1', { value: 'hello, world' })]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(historyB.getRun('r1').value).toBe('hello, world');

    sessionA.destroy();
    sessionB.destroy();
  });

  it('a remote edit is never added to the receiving peer\'s local undo stack', async () => {
    const historyA = new History(new EditorStore(makeDoc()));
    const historyB = new History(new EditorStore(makeDoc()));
    const { sessionA, sessionB } = await connectPair(historyA, historyB);

    historyA.performBatch([updateRun('r1', { value: 'from A' })]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(historyB.getRun('r1').value).toBe('from A');
    expect(historyB.canUndo()).toBe(false); // received remotely, not locally performed

    sessionA.destroy();
    sessionB.destroy();
  });

  it('concurrent inserts from both peers, made before either sees the other\'s change, both survive and converge identically', async () => {
    const historyA = new History(new EditorStore(makeDoc()));
    const historyB = new History(new EditorStore(makeDoc()));
    const { sessionA, sessionB } = await connectPair(historyA, historyB);

    // simulate genuine concurrency: both perform before either broadcast is received
    const fromA = { id: 'fromA', type: 'paragraph', parentId: 'root', contentIds: ['rFromA'], props: {} };
    const fromB = { id: 'fromB', type: 'paragraph', parentId: 'root', contentIds: ['rFromB'], props: {} };
    historyA.performBatch([
      insertBlock(fromA, 'root', 1, { blocks: [fromA], runs: [{ id: 'rFromA', type: 'text', value: 'From A', marks: {} }] }),
    ]);
    historyB.performBatch([
      insertBlock(fromB, 'root', 1, { blocks: [fromB], runs: [{ id: 'rFromB', type: 'text', value: 'From B', marks: {} }] }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(historyA.getBlock('root').contentIds).toEqual(historyB.getBlock('root').contentIds);
    expect(historyA.getBlock('root').contentIds).toContain('fromA');
    expect(historyA.getBlock('root').contentIds).toContain('fromB');

    sessionA.destroy();
    sessionB.destroy();
  });

  it('regression: every op in a multi-op performBatch syncs, not just the last one (e.g. remove-and-replace for an in-place block conversion)', async () => {
    // Reproduces a real reported bug: slash-command block conversion on an
    // otherwise-empty block (e.g. typing "/heading" then selecting it)
    // goes through a remove-old-block + insert-new-block batch. Only
    // broadcasting the batch's LAST envelope silently dropped the
    // "remove old block" half, leaving the old (soon-to-be-stale) block
    // behind on every other peer alongside the new one.
    const historyA = new History(new EditorStore(makeDoc()));
    const historyB = new History(new EditorStore(makeDoc()));
    const { sessionA, sessionB } = await connectPair(historyA, historyB);

    const replacement = { id: 'replacement', type: 'heading', parentId: 'root', contentIds: ['rReplacement'], props: { level: 1 } };
    historyA.performBatch([
      removeBlock('p1'),
      insertBlock(replacement, 'root', 0, { blocks: [replacement], runs: [{ id: 'rReplacement', type: 'text', value: 'check', marks: {} }] }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(historyB.getBlock('p1')).toBeUndefined(); // old block's removal must have synced too
    expect(historyB.getBlock('replacement')?.type).toBe('heading');
    expect(historyB.getRun('rReplacement')?.value).toBe('check');
    expect(historyB.getBlock('root').contentIds).toEqual(['replacement']);

    sessionA.destroy();
    sessionB.destroy();
  });

  it('a local undo is broadcast to peers too, not just kept local', async () => {
    const historyA = new History(new EditorStore(makeDoc()));
    const historyB = new History(new EditorStore(makeDoc()));
    const { sessionA, sessionB } = await connectPair(historyA, historyB);

    historyA.performBatch([updateRun('r1', { value: 'edited by A' })]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(historyB.getRun('r1').value).toBe('edited by A');

    historyA.undo();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(historyA.getRun('r1').value).toBe('hello');
    expect(historyB.getRun('r1').value).toBe('hello'); // the undo itself propagated

    sessionA.destroy();
    sessionB.destroy();
  });
});
