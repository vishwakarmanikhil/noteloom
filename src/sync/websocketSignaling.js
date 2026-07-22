/**
 * A `SignalingChannel` (see signaling.js) backed by a plain WebSocket
 * connection to a relay server — usable for any manual/shared-rendezvous
 * setup: a relay running on the same LAN (no internet needed once peers
 * and the relay share a network), one running on a normal cloud host, or
 * anything in between. Uses only the browser's native `WebSocket`, so
 * this adds no runtime dependency to the package.
 *
 * This is a generic tool, not a specific app feature — it doesn't know or
 * care whether the relay is reachable over the internet or only a LAN;
 * that's entirely a property of the `url` the host app supplies. A
 * minimal reference relay server implementing the wire protocol this
 * expects lives in `tools/lan-relay-server/` (Node-only, not part of
 * this package's browser bundle).
 *
 * Wire protocol (JSON messages over the WebSocket):
 *   client -> server, on connect: nothing extra needed -- `roomId` and
 *     `peerId` are passed as URL query params so the server knows the
 *     room/identity before the first message.
 *   server -> client: {type: 'roster', peerIds: [...]}      -- once, right after connecting: who else is already in the room
 *   server -> client: {type: 'peer-joined', peerId}          -- another peer joined the same room later
 *   server -> client: {type: 'peer-left', peerId}             -- a peer disconnected
 *   client -> server: {type: 'signal', toPeerId, payload}     -- relay this to one specific peer in the same room
 *   server -> client: {type: 'signal', fromPeerId, payload}   -- a relayed signal addressed to us
 */
export function createWebSocketSignaling({ url, roomId, peerId, WebSocketImpl = WebSocket }) {
  const messageHandlers = new Set();
  const peerJoinedHandlers = new Set();
  const peerLeftHandlers = new Set();
  const pendingSends = []; // queued {toPeerId, payload} while the socket is still connecting

  const connectUrl = `${url}${url.includes('?') ? '&' : '?'}room=${encodeURIComponent(roomId)}&peerId=${encodeURIComponent(peerId)}`;
  const socket = new WebSocketImpl(connectUrl);

  socket.addEventListener('open', () => {
    for (const { toPeerId, payload } of pendingSends) sendSignal(toPeerId, payload);
    pendingSends.length = 0;
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return; // malformed frame from an incompatible/misbehaving relay -- ignore rather than crash
    }
    if (message.type === 'roster') {
      for (const otherId of message.peerIds ?? []) {
        for (const cb of peerJoinedHandlers) cb(otherId);
      }
    } else if (message.type === 'peer-joined') {
      for (const cb of peerJoinedHandlers) cb(message.peerId);
    } else if (message.type === 'peer-left') {
      for (const cb of peerLeftHandlers) cb(message.peerId);
    } else if (message.type === 'signal') {
      for (const cb of messageHandlers) cb(message.fromPeerId, message.payload);
    }
  });

  function sendSignal(toPeerId, payload) {
    if (socket.readyState !== WebSocketImpl.OPEN) {
      pendingSends.push({ toPeerId, payload });
      return;
    }
    socket.send(JSON.stringify({ type: 'signal', toPeerId, payload }));
  }

  return {
    localPeerId: peerId,

    send(toPeerId, payload) {
      sendSignal(toPeerId, payload);
    },

    onMessage(cb) {
      messageHandlers.add(cb);
      return () => messageHandlers.delete(cb);
    },

    /** Not part of the base SignalingChannel contract -- a relay-backed signaling implementation can tell you who's already here (the initial roster) and who joins afterward, unlike the peer-to-peer-only BroadcastChannel backend, which can only hear a live announcement. */
    onPeerDiscovered(cb) {
      peerJoinedHandlers.add(cb);
      return () => peerJoinedHandlers.delete(cb);
    },

    /** Not part of the base SignalingChannel contract -- the relay knows when a peer's connection drops, so it can tell everyone else, which a pure BroadcastChannel backend has no way to do. */
    onPeerLeft(cb) {
      peerLeftHandlers.add(cb);
      return () => peerLeftHandlers.delete(cb);
    },

    close() {
      pendingSends.length = 0;
      socket.close();
    },
  };
}
