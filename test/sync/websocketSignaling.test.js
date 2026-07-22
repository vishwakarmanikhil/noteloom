import { describe, it, expect, beforeEach } from 'vitest';
import { createWebSocketSignaling } from '../../src/sync/websocketSignaling.js';

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this._listeners = { open: [], message: [], close: [] };
    this.sentMessages = [];
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, cb) {
    this._listeners[type]?.push(cb);
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    for (const cb of this._listeners.close) cb();
  }

  // test-only helpers, not part of the real WebSocket surface
  _open() {
    this.readyState = FakeWebSocket.OPEN;
    for (const cb of this._listeners.open) cb();
  }

  _receiveRaw(raw) {
    for (const cb of this._listeners.message) cb({ data: raw });
  }

  _receive(message) {
    this._receiveRaw(JSON.stringify(message));
  }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSED = 3;

beforeEach(() => {
  FakeWebSocket.instances = [];
});

function lastSocket() {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

describe('createWebSocketSignaling', () => {
  it('connects with room and peerId encoded as URL query params', () => {
    createWebSocketSignaling({ url: 'ws://192.168.1.5:8080', roomId: 'doc-1', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const socket = lastSocket();
    expect(socket.url).toBe('ws://192.168.1.5:8080?room=doc-1&peerId=peer-a');
  });

  it('appends query params correctly when the url already has one', () => {
    createWebSocketSignaling({ url: 'ws://host:8080/path?token=abc', roomId: 'doc-1', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    expect(lastSocket().url).toBe('ws://host:8080/path?token=abc&room=doc-1&peerId=peer-a');
  });

  it('exposes localPeerId as the peerId supplied', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    expect(signaling.localPeerId).toBe('peer-a');
  });

  it('queues send() calls made before the socket opens, and flushes them in order once it does', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const socket = lastSocket();

    signaling.send('peer-b', { kind: 'offer', sdp: 'x' });
    signaling.send('peer-c', { kind: 'ice', candidate: 'y' });
    expect(socket.sentMessages).toEqual([]); // not open yet -- nothing sent

    socket._open();
    expect(socket.sentMessages).toEqual([
      JSON.stringify({ type: 'signal', toPeerId: 'peer-b', payload: { kind: 'offer', sdp: 'x' } }),
      JSON.stringify({ type: 'signal', toPeerId: 'peer-c', payload: { kind: 'ice', candidate: 'y' } }),
    ]);
  });

  it('sends immediately once already open', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const socket = lastSocket();
    socket._open();

    signaling.send('peer-b', { kind: 'answer', sdp: 'z' });
    expect(socket.sentMessages).toEqual([JSON.stringify({ type: 'signal', toPeerId: 'peer-b', payload: { kind: 'answer', sdp: 'z' } })]);
  });

  it('delivers a roster on connect as peer-discovered events for every existing peer', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const discovered = [];
    signaling.onPeerDiscovered((id) => discovered.push(id));

    lastSocket()._receive({ type: 'roster', peerIds: ['peer-b', 'peer-c'] });
    expect(discovered).toEqual(['peer-b', 'peer-c']);
  });

  it('reports a peer joining later via peer-discovered too', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const discovered = [];
    signaling.onPeerDiscovered((id) => discovered.push(id));

    lastSocket()._receive({ type: 'peer-joined', peerId: 'peer-d' });
    expect(discovered).toEqual(['peer-d']);
  });

  it('reports a peer leaving via onPeerLeft', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const left = [];
    signaling.onPeerLeft((id) => left.push(id));

    lastSocket()._receive({ type: 'peer-left', peerId: 'peer-b' });
    expect(left).toEqual(['peer-b']);
  });

  it('delivers a relayed signal via onMessage with the originating peer id', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const received = [];
    signaling.onMessage((fromPeerId, payload) => received.push({ fromPeerId, payload }));

    lastSocket()._receive({ type: 'signal', fromPeerId: 'peer-b', payload: { kind: 'offer', sdp: 'abc' } });
    expect(received).toEqual([{ fromPeerId: 'peer-b', payload: { kind: 'offer', sdp: 'abc' } }]);
  });

  it('ignores a malformed (non-JSON) frame from the relay instead of throwing', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    signaling.onMessage(() => {});
    expect(() => lastSocket()._receiveRaw('not json')).not.toThrow();
  });

  it('close() closes the underlying socket', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const socket = lastSocket();
    signaling.close();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('unsubscribing a handler stops it from receiving further events', () => {
    const signaling = createWebSocketSignaling({ url: 'ws://host', roomId: 'r', peerId: 'peer-a', WebSocketImpl: FakeWebSocket });
    const received = [];
    const unsubscribe = signaling.onMessage((fromPeerId) => received.push(fromPeerId));
    lastSocket()._receive({ type: 'signal', fromPeerId: 'peer-b', payload: {} });
    unsubscribe();
    lastSocket()._receive({ type: 'signal', fromPeerId: 'peer-c', payload: {} });
    expect(received).toEqual(['peer-b']);
  });
});
