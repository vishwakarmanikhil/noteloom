/**
 * @typedef {Object} SignalingChannel
 * A minimal, transport-agnostic interface Noteloom needs just to exchange
 * WebRTC connection setup messages (SDP offer/answer, ICE candidates)
 * between two peers before their data channel exists — Noteloom does not
 * ship a signaling server or client of its own. Back this with whatever
 * out-of-band channel the host app already has: a WebSocket relay,
 * Firebase/Supabase realtime, or even a manual copy-paste UI for an
 * offline demo. Once the data channel opens, this interface is never used
 * again for that peer — all further document sync traffic flows directly
 * peer-to-peer.
 *
 * @property {(toPeerId: string, message: object) => void} send
 *   Delivers `message` to the peer identified by `toPeerId`. The message
 *   shape is opaque to the signaling layer — just forward it as-is (e.g.
 *   JSON.stringify over a WebSocket).
 * @property {(callback: (fromPeerId: string, message: object) => void) => (() => void)} onMessage
 *   Registers a handler for messages addressed to this peer, arriving
 *   from any other peer. Returns an unsubscribe function.
 * @property {string} localPeerId
 *   This peer's own stable id, as known to the signaling layer — used to
 *   identify this session in the `hello` handshake.
 */
export {};
