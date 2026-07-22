const SYNC_LABEL = 'noteloom-sync';
const DEFAULT_RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// RTCDataChannel enforces a max-message-size that `send()` throws past --
// it varies by browser/OS/negotiation (commonly reported anywhere from
// ~64KB to 256KB) and isn't queryable in advance, so any single logical
// message (an op envelope carrying an embedded file's data: URL, or a
// full-document syncResponse snapshot, both of which can easily exceed
// that) needs to be fragmented rather than assumed to fit. 16KB is
// conservative -- comfortably under every browser's limit -- in exchange
// for more individual send() calls on the rare oversized message.
const MAX_CHUNK_PAYLOAD = 16000;

// The data channel's OWN outgoing buffer (bufferedAmount) is a separate
// limit from max-message-size: even correctly-sized individual chunks can
// overflow the channel's internal send queue if too many are fired
// synchronously back to back (a large embedded video easily needs
// thousands of 16KB chunks) -- send() then throws "send queue is full".
// These thresholds pace sending: once bufferedAmount crosses HIGH, further
// chunks wait for the channel's 'bufferedamountlow' event (fired once it
// drains back under LOW) before continuing, so outgoing data is throttled
// to roughly what the channel can actually keep up with.
const BUFFERED_AMOUNT_HIGH_WATERMARK = 1_000_000;
const BUFFERED_AMOUNT_LOW_WATERMARK = 256_000;

function genMessageId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Wraps one WebRTC connection to a single remote peer, using a caller-
 * supplied `SignalingChannel` (see signaling.js) purely to exchange the
 * SDP offer/answer and ICE candidates needed to establish it. Once the
 * data channel opens, no further traffic goes through signaling — the
 * rest of the sync protocol flows directly peer-to-peer over the channel.
 *
 * `initiator` must be true on exactly one side of each pair (whichever
 * peer starts the connection creates the data channel and the offer; the
 * other side waits for both to arrive).
 */
export class PeerConnection {
  constructor({ signaling, remotePeerId, initiator, rtcConfig = DEFAULT_RTC_CONFIG }) {
    this.remotePeerId = remotePeerId;
    this._signaling = signaling;
    this._pc = new RTCPeerConnection(rtcConfig);
    this._channel = null;
    this._openListeners = new Set();
    this._closeListeners = new Set();
    this._messageListeners = new Set();
    this._chunkBuffers = new Map(); // messageId -> { total, received: Map<index, string> }
    this._sendQueue = []; // frame strings waiting to go out, drained by _pumpSendQueue
    this._pumping = false;

    this._pc.onicecandidate = (event) => {
      // event.candidate is an RTCIceCandidate class instance, not a plain
      // object -- signaling implementations may serialize `message` (JSON
      // over a WebSocket, structured-clone over a BroadcastChannel, etc.),
      // and neither survives a class instance. .toJSON() is the plain,
      // serializable RTCIceCandidateInit shape that addIceCandidate also
      // accepts directly, so no reconstruction is needed on the other end.
      if (event.candidate) this._signaling.send(remotePeerId, { kind: 'ice', candidate: event.candidate.toJSON() });
    };

    if (initiator) {
      this._wireChannel(this._pc.createDataChannel(SYNC_LABEL));
      this._pc
        .createOffer()
        .then((offer) => this._pc.setLocalDescription(offer).then(() => offer))
        .then((offer) => this._signaling.send(remotePeerId, { kind: 'offer', sdp: offer }));
    } else {
      this._pc.ondatachannel = (event) => this._wireChannel(event.channel);
    }

    this._unsubscribeSignaling = signaling.onMessage((fromPeerId, message) => {
      if (fromPeerId !== remotePeerId) return;
      this._handleSignal(message);
    });
  }

  async _handleSignal(message) {
    if (message.kind === 'offer') {
      await this._pc.setRemoteDescription(message.sdp);
      const answer = await this._pc.createAnswer();
      await this._pc.setLocalDescription(answer);
      this._signaling.send(this.remotePeerId, { kind: 'answer', sdp: answer });
    } else if (message.kind === 'answer') {
      await this._pc.setRemoteDescription(message.sdp);
    } else if (message.kind === 'ice') {
      try {
        await this._pc.addIceCandidate(message.candidate);
      } catch {
        // A candidate arriving after the connection is already
        // closed/failed is safe to drop rather than surfacing an error.
      }
    }
  }

  _wireChannel(channel) {
    this._channel = channel;
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_WATERMARK;
    channel.onopen = () => {
      for (const cb of this._openListeners) cb();
    };
    channel.onclose = () => {
      for (const cb of this._closeListeners) cb();
    };
    channel.onmessage = (event) => this._handleRawMessage(event.data);
  }

  /**
   * Every wire frame carries a 1-character marker so the receiving side
   * can tell a complete message from one fragment of a larger one without
   * touching the actual payload's own framing (which is opaque to this
   * layer — see syncProtocol.js): 'S' for a single, already-small-enough
   * message; 'C' for one piece of a chunked one, reassembled once every
   * piece with the same messageId has arrived.
   */
  _handleRawMessage(raw) {
    if (typeof raw !== 'string' || raw.length === 0) return;
    const marker = raw[0];
    if (marker === 'S') {
      for (const cb of this._messageListeners) cb(raw.slice(1));
      return;
    }
    if (marker !== 'C') return; // unrecognized frame -- ignore rather than crash on a malformed/foreign message

    const rest = raw.slice(1);
    const firstColon = rest.indexOf(':');
    const secondColon = rest.indexOf(':', firstColon + 1);
    const thirdColon = rest.indexOf(':', secondColon + 1);
    if (firstColon === -1 || secondColon === -1 || thirdColon === -1) return;
    const messageId = rest.slice(0, firstColon);
    const index = Number(rest.slice(firstColon + 1, secondColon));
    const total = Number(rest.slice(secondColon + 1, thirdColon));
    const piece = rest.slice(thirdColon + 1);

    let buffer = this._chunkBuffers.get(messageId);
    if (!buffer) {
      buffer = { total, received: new Map() };
      this._chunkBuffers.set(messageId, buffer);
    }
    buffer.received.set(index, piece);
    if (buffer.received.size < buffer.total) return;

    this._chunkBuffers.delete(messageId);
    let full = '';
    for (let i = 0; i < buffer.total; i += 1) full += buffer.received.get(i);
    for (const cb of this._messageListeners) cb(full);
  }

  /**
   * Sends a raw string, transparently fragmenting it first if it's too
   * large for one data-channel message (see MAX_CHUNK_PAYLOAD). Enqueues
   * and returns immediately — the actual sending happens asynchronously
   * via _pumpSendQueue, which paces itself against the channel's own
   * backpressure (see BUFFERED_AMOUNT_HIGH/LOW_WATERMARK) so a large
   * payload's thousands of chunks don't overflow the channel's send queue
   * by firing all at once.
   */
  send(raw) {
    if (this._channel?.readyState !== 'open') return;
    if (raw.length <= MAX_CHUNK_PAYLOAD) {
      this._sendQueue.push(`S${raw}`);
    } else {
      const messageId = genMessageId();
      const total = Math.ceil(raw.length / MAX_CHUNK_PAYLOAD);
      for (let index = 0; index < total; index += 1) {
        const piece = raw.slice(index * MAX_CHUNK_PAYLOAD, (index + 1) * MAX_CHUNK_PAYLOAD);
        this._sendQueue.push(`C${messageId}:${index}:${total}:${piece}`);
      }
    }
    this._pumpSendQueue();
  }

  /** Drains _sendQueue one frame at a time, pausing whenever the channel's own outgoing buffer is too full rather than firing send() calls faster than the channel can actually flush them. Only one pump loop ever runs per connection (re-entrant calls from send() while a pump is already draining just top up the same queue). */
  async _pumpSendQueue() {
    if (this._pumping) return;
    this._pumping = true;
    try {
      while (this._sendQueue.length > 0) {
        if (!this._channel || this._channel.readyState !== 'open') {
          this._sendQueue.length = 0;
          break;
        }
        if (this._channel.bufferedAmount > BUFFERED_AMOUNT_HIGH_WATERMARK) {
          await this._waitForBufferedAmountLow();
          continue;
        }
        const frame = this._sendQueue.shift();
        try {
          this._channel.send(frame);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[noteloom] failed to send a sync message to peer', this.remotePeerId, err);
          // A send() failure here (as opposed to the backpressure this
          // loop already avoids) means the channel itself is in trouble
          // (e.g. closing mid-send) -- draining the rest of the queue
          // against it would just fail the same way, so give up on it.
          this._sendQueue.length = 0;
          break;
        }
      }
    } finally {
      this._pumping = false;
    }
  }

  _waitForBufferedAmountLow() {
    return new Promise((resolve) => {
      if (!this._channel) {
        resolve();
        return;
      }
      const handler = () => {
        this._channel.removeEventListener('bufferedamountlow', handler);
        resolve();
      };
      this._channel.addEventListener('bufferedamountlow', handler);
    });
  }

  onOpen(cb) {
    this._openListeners.add(cb);
    return () => this._openListeners.delete(cb);
  }

  onClose(cb) {
    this._closeListeners.add(cb);
    return () => this._closeListeners.delete(cb);
  }

  onMessage(cb) {
    this._messageListeners.add(cb);
    return () => this._messageListeners.delete(cb);
  }

  close() {
    this._chunkBuffers.clear();
    this._sendQueue.length = 0;
    this._unsubscribeSignaling?.();
    this._channel?.close();
    this._pc.close();
  }
}
