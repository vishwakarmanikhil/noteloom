// Minimal fake RTCPeerConnection/RTCDataChannel pair, used only to exercise
// src/sync/peerConnection.js + CollabSession.js under Vitest/jsdom, which
// has no real WebRTC implementation. Deliberately NOT a spec-accurate
// WebRTC simulation (no real SDP/ICE semantics) -- it only needs to
// satisfy the exact surface PeerConnection.js touches, and to actually
// link two peers' data channels together so messages sent on one side
// arrive on the other, proving the real production message-handling code
// (CollabSession) behaves correctly end to end.

class FakeDataChannel {
  constructor(label) {
    this.label = label;
    this.readyState = 'connecting';
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    // Real fields, simulated: bufferedAmount rises on send() and drains
    // (asynchronously, like a real network) back down, firing
    // 'bufferedamountlow' once it crosses the threshold going down --
    // lets PeerConnection's flow-control logic be exercised for real
    // rather than assumed to work from manual browser testing alone.
    this.bufferedAmount = 0;
    this.bufferedAmountLowThreshold = 0;
    this._peer = null;
    this._listeners = new Map(); // eventType -> Set<callback>
  }

  addEventListener(type, cb) {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(cb);
  }

  removeEventListener(type, cb) {
    this._listeners.get(type)?.delete(cb);
  }

  _emit(type) {
    for (const cb of [...(this._listeners.get(type) ?? [])]) cb();
  }

  _open() {
    if (this.readyState === 'open') return;
    this.readyState = 'open';
    this.onopen?.();
  }

  send(data) {
    if (this.readyState !== 'open') return;
    this.bufferedAmount += data.length;
    queueMicrotask(() => {
      this._peer?.onmessage?.({ data });
      this.bufferedAmount = Math.max(0, this.bufferedAmount - data.length);
      if (this.bufferedAmount <= this.bufferedAmountLowThreshold) this._emit('bufferedamountlow');
    });
  }

  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
    // A real data channel closing is observed by BOTH ends once the
    // underlying connection tears down -- propagate to the linked peer's
    // channel too, so tests can exercise "the other side noticed I
    // disconnected", not just "I noticed I closed my own connection".
    if (this._peer && this._peer.readyState !== 'closed') {
      queueMicrotask(() => this._peer?.close());
    }
  }
}

function linkChannels(a, b) {
  a._peer = b;
  b._peer = a;
  a._open();
  b._open();
}

export class FakeRTCPeerConnection {
  constructor() {
    this.onicecandidate = null;
    this.ondatachannel = null;
    this._localChannel = null;
  }

  createDataChannel(label) {
    this._localChannel = new FakeDataChannel(label);
    return this._localChannel;
  }

  // eslint-disable-next-line class-methods-use-this
  async createOffer() {
    // Carries a reference to the initiator's channel so the answering
    // side can link to it -- opaque to real SDP, just a test fixture.
    return { type: 'offer', _channel: this._localChannel };
  }

  // eslint-disable-next-line class-methods-use-this
  async createAnswer() {
    return { type: 'answer' };
  }

  // eslint-disable-next-line class-methods-use-this
  async setLocalDescription() {}

  async setRemoteDescription(desc) {
    if (desc?.type === 'offer' && desc._channel) {
      const localChannel = new FakeDataChannel(desc._channel.label);
      this._localChannel = localChannel;
      // Fire ondatachannel (which wires onopen/onmessage/onclose) BEFORE
      // linking/opening the channel -- otherwise _open() below fires
      // before anything is listening, and the open event is lost.
      this.ondatachannel?.({ channel: localChannel });
      linkChannels(localChannel, desc._channel);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async addIceCandidate() {}

  close() {
    this._localChannel?.close();
  }
}

/** An in-memory fan-out "network" of SignalingChannel instances, one per peer id, all wired to each other. */
export function makeFakeSignalingNetwork() {
  const handlers = new Map(); // peerId -> Set<callback>
  return {
    makeChannelFor(peerId) {
      return {
        localPeerId: peerId,
        send(toPeerId, message) {
          const set = handlers.get(toPeerId);
          if (!set) return;
          queueMicrotask(() => {
            for (const cb of [...set]) cb(peerId, message);
          });
        },
        onMessage(cb) {
          let set = handlers.get(peerId);
          if (!set) {
            set = new Set();
            handlers.set(peerId, set);
          }
          set.add(cb);
          return () => set.delete(cb);
        },
      };
    },
  };
}
