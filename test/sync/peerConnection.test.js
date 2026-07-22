import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PeerConnection } from '../../src/sync/peerConnection.js';
import { FakeRTCPeerConnection, makeFakeSignalingNetwork } from './fakeWebrtc.js';

function waitForOpen(peerConnection) {
  return new Promise((resolve) => peerConnection.onOpen(resolve));
}

function waitForMessage(peerConnection) {
  return new Promise((resolve) => {
    const unsubscribe = peerConnection.onMessage((raw) => {
      unsubscribe();
      resolve(raw);
    });
  });
}

describe('PeerConnection — large message fragmentation', () => {
  let originalRTCPeerConnection;

  beforeEach(() => {
    originalRTCPeerConnection = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = FakeRTCPeerConnection;
  });

  afterEach(() => {
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  });

  async function connectPair() {
    const network = makeFakeSignalingNetwork();
    const peerA = new PeerConnection({ signaling: network.makeChannelFor('peer-a'), remotePeerId: 'peer-b', initiator: true });
    const peerB = new PeerConnection({ signaling: network.makeChannelFor('peer-b'), remotePeerId: 'peer-a', initiator: false });
    await Promise.all([waitForOpen(peerA), waitForOpen(peerB)]);
    return { peerA, peerB };
  }

  it('a small message (under the chunk threshold) arrives intact, unfragmented', async () => {
    const { peerA, peerB } = await connectPair();
    const message = JSON.stringify({ type: 'op', envelope: { kind: 'fieldWrite', id: 'r1' } });

    const received = waitForMessage(peerB);
    peerA.send(message);
    expect(await received).toBe(message);

    peerA.close();
    peerB.close();
  });

  it('a message far larger than one data-channel frame is fragmented and reassembled correctly on the other side', async () => {
    const { peerA, peerB } = await connectPair();
    // ~1MB, well past MAX_CHUNK_PAYLOAD (16000) -- simulates a large
    // embedded file's data: URL riding inside an op envelope.
    const largePayload = 'x'.repeat(1_000_000);
    const message = JSON.stringify({ type: 'op', envelope: { kind: 'fieldWrite', id: 'embed1', patch: { src: largePayload } } });

    const received = waitForMessage(peerB);
    peerA.send(message);
    const result = await received;

    expect(result).toBe(message);
    expect(result.length).toBe(message.length);

    peerA.close();
    peerB.close();
  });

  it('a message large enough to trigger backpressure (crossing the channel bufferedAmount watermark mid-send) still arrives complete', async () => {
    // ~3MB -- comfortably past BUFFERED_AMOUNT_HIGH_WATERMARK (1MB) partway
    // through sending, so this exercises the actual wait-for-drain path in
    // _pumpSendQueue, not just plain chunking. Regression coverage for a
    // real bug: sending many chunks with no flow control at all overflowed
    // the (real) data channel's send queue for large embeds like video.
    const { peerA, peerB } = await connectPair();
    const hugePayload = 'y'.repeat(3_000_000);
    const message = JSON.stringify({ type: 'op', envelope: { kind: 'fieldWrite', id: 'video1', patch: { src: hugePayload } } });

    const received = waitForMessage(peerB);
    peerA.send(message);
    const result = await received;

    expect(result).toBe(message);

    peerA.close();
    peerB.close();
  });

  it('two large messages sent back-to-back both arrive complete and uncorrupted, not interleaved with each other', async () => {
    const { peerA, peerB } = await connectPair();
    const messageOne = JSON.stringify({ id: 'one', data: 'a'.repeat(50000) });
    const messageTwo = JSON.stringify({ id: 'two', data: 'b'.repeat(50000) });

    const receivedMessages = [];
    const allReceived = new Promise((resolve) => {
      peerB.onMessage((raw) => {
        receivedMessages.push(raw);
        if (receivedMessages.length === 2) resolve();
      });
    });

    peerA.send(messageOne);
    peerA.send(messageTwo);
    await allReceived;

    expect(receivedMessages).toContain(messageOne);
    expect(receivedMessages).toContain(messageTwo);
    // each message's own content must be internally uncorrupted regardless of arrival order
    for (const raw of receivedMessages) {
      expect(() => JSON.parse(raw)).not.toThrow();
    }

    peerA.close();
    peerB.close();
  });
});
