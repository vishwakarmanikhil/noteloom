import { describe, it, expect } from 'vitest';
import {
  MESSAGE_TYPE,
  encodeMessage,
  decodeMessage,
  helloMessage,
  opMessage,
  syncRequestMessage,
  syncResponseMessage,
} from '../../src/sync/syncProtocol.js';

describe('syncProtocol', () => {
  it('round-trips a hello message', () => {
    const message = helloMessage('peer-a');
    expect(message).toEqual({ type: MESSAGE_TYPE.HELLO, peerId: 'peer-a' });
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('round-trips an op message carrying an arbitrary envelope', () => {
    const envelope = { kind: 'insertSlot', parentId: 'root', blockId: 'p1', slot: { id: 'p1', originId: null, peerId: 'a', clock: { wallTime: 1, counter: 0, peerId: 'a' }, deleted: false }, subtree: { blocks: [], runs: [] } };
    const message = opMessage(envelope);
    expect(message).toEqual({ type: MESSAGE_TYPE.OP, envelope });
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('round-trips syncRequest/syncResponse', () => {
    expect(decodeMessage(encodeMessage(syncRequestMessage()))).toEqual({ type: MESSAGE_TYPE.SYNC_REQUEST });
    const doc = { blocks: [], runs: [], rootId: 'root', fieldTypes: [] };
    expect(decodeMessage(encodeMessage(syncResponseMessage(doc)))).toEqual({ type: MESSAGE_TYPE.SYNC_RESPONSE, doc });
  });

  it('rejects a message with no type', () => {
    expect(() => decodeMessage(JSON.stringify({ foo: 'bar' }))).toThrow(/missing type/);
  });

  it('rejects malformed JSON', () => {
    expect(() => decodeMessage('not json')).toThrow();
  });
});
