import { MESSAGE_TYPE, encodeMessage, decodeMessage, helloMessage, opMessage, syncRequestMessage, syncResponseMessage } from './syncProtocol.js';
import { PeerConnection } from './peerConnection.js';

/**
 * Wires a History-wrapped EditorStore up to one or more WebRTC peers.
 * Every local write — `history.perform`, `performBatch` (each op in a
 * multi-op batch individually, not just the batch's net effect),
 * `undo`, and `redo` — is broadcast to every connected peer right after
 * it's applied, using the same envelope `EditorStore` already computed
 * for it. Incoming changes are applied via `store.applyRemoteOperation`,
 * which — by construction — never reaches `history`, so remote edits can
 * never be locally undone.
 *
 * A peer connecting for the first time gets a full document snapshot
 * (`syncResponse`) rather than a partial op backlog, and a peer
 * reconnecting after a drop re-requests the same full snapshot rather
 * than trying to track what it might have missed — simple and correct,
 * at the cost of O(document size) traffic per (re)connect. Swapping in an
 * op-log-since-clock resync later is a pure optimization, not a
 * correctness fix, so it's deliberately not attempted here.
 */
export class CollabSession {
  constructor({ history, signaling }) {
    this._history = history;
    this._store = history.store;
    this._signaling = signaling;
    this._peers = new Map(); // remotePeerId -> PeerConnection
    this._unsubscribeLocal = this._attachLocalBroadcast();
  }

  /**
   * Wraps `store.applyOperation` itself — the one chokepoint every local
   * write path funnels through (perform, performBatch's internal loop,
   * undo, redo) — rather than perform/performBatch individually. A
   * multi-op batch (e.g. "remove this block, insert a replacement" for an
   * in-place block-type conversion) calls applyOperation once per op but
   * only returns/settles once at the end; broadcasting only
   * `getLastEnvelope()` after the whole batch would silently drop every
   * op's envelope except the last one. Queuing one envelope per
   * applyOperation call and flushing the queue after perform/
   * performBatch/undo/redo -- all of which call applyOperation and
   * nothing else pushes onto the undo stack or replays inverses -- is
   * what makes multi-op batches sync completely instead of partially.
   * Undo/redo are included deliberately: an undo is itself a local write
   * peers should see too (their document should also lose whatever was
   * undone), not just a local-only reversal.
   */
  _attachLocalBroadcast() {
    const originalApplyOperation = this._store.applyOperation.bind(this._store);
    this._pendingEnvelopes = [];
    this._store.applyOperation = (op) => {
      const inverse = originalApplyOperation(op);
      const envelope = this._store.getLastEnvelope();
      if (envelope) this._pendingEnvelopes.push(envelope);
      return inverse;
    };

    const originals = {};
    for (const methodName of ['perform', 'performBatch', 'undo', 'redo']) {
      const original = this._history[methodName].bind(this._history);
      originals[methodName] = original;
      this._history[methodName] = (...args) => {
        const result = original(...args);
        this._flushPendingEnvelopes();
        return result;
      };
    }

    return () => {
      for (const methodName of Object.keys(originals)) this._history[methodName] = originals[methodName];
      this._store.applyOperation = originalApplyOperation;
    };
  }

  _flushPendingEnvelopes() {
    const envelopes = this._pendingEnvelopes;
    this._pendingEnvelopes = [];
    for (const envelope of envelopes) {
      // Coarse resync ops (setBlockContentIds/replaceRunSpan/setBlockRuns)
      // have no CRDT-safe wire form yet -- getLastEnvelope() is null for
      // those, so they're already filtered out before reaching this queue.
      this._broadcast(opMessage(envelope));
    }
  }

  _broadcast(message) {
    const raw = encodeMessage(message);
    for (const peer of this._peers.values()) peer.send(raw);
  }

  /** Establishes (or re-establishes) a connection to `remotePeerId`. `initiator` must be true on exactly one side of each pair. */
  connect(remotePeerId, { initiator }) {
    this._peers.get(remotePeerId)?.close();
    const peer = new PeerConnection({ signaling: this._signaling, remotePeerId, initiator });
    peer.onOpen(() => {
      peer.send(encodeMessage(helloMessage(this._signaling.localPeerId)));
      peer.send(encodeMessage(syncRequestMessage()));
    });
    peer.onMessage((raw) => this._handleMessage(peer, raw));
    peer.onClose(() => {
      // Reconnection itself is a transport-layer concern (re-call connect
      // when the host app's own retry/backoff policy decides to) -- this
      // session just drops the peer on close. A fresh connect() always
      // starts with syncRequest/syncResponse, so there's no dependency on
      // resuming from wherever the dropped connection left off.
      this._peers.delete(remotePeerId);
    });
    this._peers.set(remotePeerId, peer);
    return peer;
  }

  _handleMessage(peer, raw) {
    let message;
    try {
      message = decodeMessage(raw);
    } catch {
      return; // malformed message from a misbehaving/incompatible peer -- ignore rather than crash the session
    }

    if (message.type === MESSAGE_TYPE.OP) {
      this._store.applyRemoteOperation(message.envelope);
      // A remote write can land on the same field a local edit is
      // mid-coalescing on (e.g. both peers typing into the same run).
      // History's coalescing has no visibility into applyRemoteOperation
      // (by design — that path never touches History), so without this,
      // the NEXT local keystroke would still be folded into the batch
      // that started BEFORE the remote write, and a single local undo
      // would revert past it, clobbering the peer's edit. Flushing here
      // closes that batch out, so the next local keystroke starts a new
      // one whose "undo to" state correctly includes what just arrived.
      this._history.flush();
    } else if (message.type === MESSAGE_TYPE.SYNC_REQUEST) {
      peer.send(encodeMessage(syncResponseMessage(this._store.toJSON())));
    } else if (message.type === MESSAGE_TYPE.SYNC_RESPONSE) {
      this._adoptSnapshotIfEmpty(message.doc);
    }
    // HELLO carries no required action yet -- reserved for future presence/awareness use.
  }

  /**
   * Adopts a peer's full document wholesale, ONLY when this side has no
   * document of its own yet (the common "join and get the existing note"
   * flow). Deliberately does not attempt to merge two independently-
   * created, already-diverged documents together on first contact — that
   * requires reconciling two entirely different id spaces with no shared
   * history, which is a fundamentally different (and unsolved here)
   * problem from merging concurrent edits to the *same* document that
   * both peers already agree is the same document. If both sides already
   * have real, different content when they connect, this is a no-op and
   * the two documents simply stay unsynced until one side is cleared.
   */
  _adoptSnapshotIfEmpty(doc) {
    const rootId = this._store.getRootId();
    if (rootId && this._store.getBlock(rootId)) return;
    this._store.blocks = new Map((doc.blocks ?? []).map((b) => [b.id, b]));
    this._store.runs = new Map((doc.runs ?? []).map((r) => [r.id, r]));
    this._store.rootId = doc.rootId ?? null;
    this._store._orders = new Map(); // reseed lazily from the newly-adopted contentIds, same as a fresh EditorStore(doc) would
    this._store._notify([...this._store.blocks.keys(), ...this._store.runs.keys()]);
  }

  disconnect(remotePeerId) {
    this._peers.get(remotePeerId)?.close();
    this._peers.delete(remotePeerId);
  }

  destroy() {
    this._unsubscribeLocal();
    for (const peer of this._peers.values()) peer.close();
    this._peers.clear();
  }
}
