export const MESSAGE_TYPE = {
  HELLO: 'hello',
  OP: 'op',
  SYNC_REQUEST: 'syncRequest',
  SYNC_RESPONSE: 'syncResponse',
};

export function encodeMessage(message) {
  return JSON.stringify(message);
}

export function decodeMessage(raw) {
  const message = JSON.parse(raw);
  if (!message || typeof message.type !== 'string') throw new Error('Invalid sync message: missing type');
  return message;
}

/** Sent once right after a data channel opens, so the receiving side knows who it's talking to. Carries no required action yet — reserved for future presence/awareness use. */
export function helloMessage(peerId) {
  return { type: MESSAGE_TYPE.HELLO, peerId };
}

/** Relays one CRDT-native change envelope, as produced by `EditorStore.getLastEnvelope()`. */
export function opMessage(envelope) {
  return { type: MESSAGE_TYPE.OP, envelope };
}

/** "Send me your full document state" — sent on first connecting to a peer, and again on every reconnect (no attempt to track/replay only what was missed). */
export function syncRequestMessage() {
  return { type: MESSAGE_TYPE.SYNC_REQUEST };
}

/** A full document snapshot, as produced by `EditorStore.toJSON()`. */
export function syncResponseMessage(doc) {
  return { type: MESSAGE_TYPE.SYNC_RESPONSE, doc };
}
