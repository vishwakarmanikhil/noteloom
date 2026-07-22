import { genPeerId } from 'noteloom';

/**
 * A `SignalingChannel` (see src/sync/signaling.js) backed by the browser's
 * native `BroadcastChannel` API — every tab on the same origin with the
 * same `roomName` open can reach every other one, with zero server. This
 * is the simplest possible signaling backend, good for a same-machine,
 * same-browser demo; a real deployment (peers on different machines)
 * would swap this for a WebSocket relay, Firebase/Supabase realtime, etc.
 * — CollabSession never knows or cares which one it's talking to.
 *
 * Layered on top of the plain send/onMessage contract: a lightweight
 * presence announcement, so tabs can discover each other and call
 * `session.connect(...)` automatically instead of requiring the peer id
 * to be typed in by hand.
 */
export function createBroadcastChannelSignaling(roomName = 'noteloom-collab-demo') {
  const channel = new BroadcastChannel(roomName);
  const localPeerId = genPeerId();
  const messageHandlers = new Set();
  const presenceHandlers = new Set();

  channel.onmessage = (event) => {
    const data = event.data;
    if (!data || data.fromPeerId === localPeerId) return; // ignore our own broadcasts
    if (data.kind === 'presence') {
      for (const cb of presenceHandlers) cb(data.fromPeerId);
    } else if (data.kind === 'signal' && data.toPeerId === localPeerId) {
      for (const cb of messageHandlers) cb(data.fromPeerId, data.payload);
    }
  };

  const signaling = {
    localPeerId,
    send(toPeerId, payload) {
      channel.postMessage({ kind: 'signal', fromPeerId: localPeerId, toPeerId, payload });
    },
    onMessage(cb) {
      messageHandlers.add(cb);
      return () => messageHandlers.delete(cb);
    },
    /** Not part of the SignalingChannel contract itself — a convenience this particular backend adds for auto-discovering peers in the same room. */
    onPeerDiscovered(cb) {
      presenceHandlers.add(cb);
      return () => presenceHandlers.delete(cb);
    },
    announcePresence() {
      channel.postMessage({ kind: 'presence', fromPeerId: localPeerId });
    },
    close() {
      channel.close();
    },
  };

  return signaling;
}
