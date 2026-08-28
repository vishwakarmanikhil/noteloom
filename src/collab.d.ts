// noteloom/collab — types re-exported from the main declaration file so there's
// a single source of truth while src/index.d.ts stays hand-written.
export {
  HLC,
  genPeerId,
  ListCrdtState,
  FieldClockRegistry,
  createPeriodicTombstoneGC,
  CollabSession,
  PeerConnection,
  MESSAGE_TYPE,
  encodeMessage,
  decodeMessage,
  createWebSocketSignaling,
  SignalingChannel,
  RemoteOperationEnvelope,
  HlcTimestamp,
  ListCrdtSlot,
} from './index';
