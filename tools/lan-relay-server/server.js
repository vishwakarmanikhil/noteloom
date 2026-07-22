import { WebSocketServer } from 'ws';

/**
 * Minimal reference signaling relay for noteloom's `createWebSocketSignaling`
 * (see src/sync/websocketSignaling.js). Not part of the noteloom npm
 * package — this is Node-only server code a host app runs separately,
 * anywhere reachable by the peers who want to collaborate: on a LAN
 * machine (no internet involved at all once peers can reach it), or on
 * any normal cloud host if you want internet-wide rendezvous instead.
 *
 * The relay only ever sees connection-setup metadata (SDP offers/answers,
 * ICE candidates) — never document content. Once two peers' WebRTC data
 * channel opens, all further sync traffic goes directly between them;
 * this process is completely uninvolved in it from that point on.
 *
 * Wire protocol — see the matching comment in websocketSignaling.js for
 * the exact message shapes this implements.
 */

const PORT = Number(process.env.PORT ?? 8080);

const rooms = new Map(); // roomId -> Map<peerId, WebSocket>

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcastToRoom(room, message, exceptPeerId) {
  for (const [peerId, ws] of room) {
    if (peerId !== exceptPeerId) send(ws, message);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomId = url.searchParams.get('room');
  const peerId = url.searchParams.get('peerId');

  if (!roomId || !peerId) {
    ws.close(1008, 'room and peerId query params are required');
    return;
  }

  let room = rooms.get(roomId);
  if (!room) {
    room = new Map();
    rooms.set(roomId, room);
  }

  // A reconnecting peer (same id rejoining, e.g. after a page reload)
  // replaces its own stale prior connection rather than co-existing with it.
  room.get(peerId)?.close();
  room.set(peerId, ws);

  send(ws, { type: 'roster', peerIds: [...room.keys()].filter((id) => id !== peerId) });
  broadcastToRoom(room, { type: 'peer-joined', peerId }, peerId);

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return; // malformed frame from a misbehaving client -- ignore rather than crash the relay
    }
    if (message.type !== 'signal' || !message.toPeerId) return;
    const targetWs = room.get(message.toPeerId);
    if (targetWs) send(targetWs, { type: 'signal', fromPeerId: peerId, payload: message.payload });
  });

  ws.on('close', () => {
    // Only remove this exact connection -- if `peerId` already got
    // replaced by a reconnect (see above), this stale close() firing
    // later must not evict the NEW connection.
    if (room.get(peerId) === ws) {
      room.delete(peerId);
      broadcastToRoom(room, { type: 'peer-left', peerId });
      if (room.size === 0) rooms.delete(roomId);
    }
  });
});

// eslint-disable-next-line no-console
console.log(`noteloom LAN relay listening on ws://0.0.0.0:${PORT}`);
