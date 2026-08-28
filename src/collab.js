// noteloom/collab — real-time collaborative editing (a custom block-tree CRDT
// over WebRTC) plus the merge primitives underneath it. Opt-in entry point:
// none of this is in the default `noteloom` bundle. Bring your own
// SignalingChannel (see sync/signaling.js) to bootstrap peer connections.
//
// Everything here is also still re-exported from the main `noteloom` entry
// for backward compatibility; that will be removed in 2.0 (see
// docs/repackaging-plan.md).

export { HLC, genPeerId } from './crdt/clock.js';
export { ListCrdtState } from './crdt/listCrdt.js';
export { FieldClockRegistry } from './crdt/fieldRegistry.js';
export { createPeriodicTombstoneGC } from './crdt/gc.js';

export { CollabSession } from './sync/CollabSession.js';
export { PeerConnection } from './sync/peerConnection.js';
export { MESSAGE_TYPE, encodeMessage, decodeMessage } from './sync/syncProtocol.js';
export { createWebSocketSignaling } from './sync/websocketSignaling.js';
