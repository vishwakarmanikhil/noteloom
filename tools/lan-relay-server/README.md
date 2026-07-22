# noteloom LAN relay server (reference implementation)

A minimal signaling relay for `createWebSocketSignaling` (see
`src/sync/websocketSignaling.js`). This is **not** part of the noteloom
npm package — it's a small standalone Node script you run yourself,
anywhere the peers who want to collaborate can reach it. Run it on a
laptop on the same WiFi/LAN and no internet connection is needed by
anyone at all; run it on a normal cloud host instead if you want
internet-wide rendezvous — the client code doesn't know or care which.

The relay only ever sees WebRTC connection-setup messages (SDP
offers/answers, ICE candidates) to get two peers' data channel open. It
never sees document content — once the data channel opens, sync traffic
goes directly peer-to-peer and this process is no longer involved.

## Run it

```bash
cd tools/lan-relay-server
npm install
npm start
# noteloom LAN relay listening on ws://0.0.0.0:8080
```

Find the host machine's LAN IP (e.g. `ipconfig` on Windows, `ifconfig`/`ip
addr` on macOS/Linux — usually something like `192.168.1.x`) and share
`ws://<that-ip>:8080` with whoever should connect.

## Wire it up in the app

```js
import { createWebSocketSignaling, CollabSession } from 'noteloom';

const signaling = createWebSocketSignaling({
  url: 'ws://192.168.1.5:8080', // the relay's address
  roomId: 'my-document-id',     // anyone using the same roomId ends up in the same room
  peerId: crypto.randomUUID(),
});

const session = new CollabSession({ history, signaling });

signaling.onPeerDiscovered((remotePeerId) => {
  // deterministic tie-break so exactly one side initiates, same idea as the BroadcastChannel example
  const initiator = signaling.localPeerId > remotePeerId;
  session.connect(remotePeerId, { initiator });
});
```

## Protocol

Plain JSON messages over the WebSocket. `room` and `peerId` are passed as
URL query params on connect (`ws://host:8080?room=...&peerId=...`).

| Direction | Message | Meaning |
|---|---|---|
| server → client | `{type:'roster', peerIds:[...]}` | sent once on connect — who else is already in this room |
| server → client | `{type:'peer-joined', peerId}` | another peer joined the room |
| server → client | `{type:'peer-left', peerId}` | a peer disconnected |
| client → server | `{type:'signal', toPeerId, payload}` | relay `payload` to one specific peer in the same room |
| server → client | `{type:'signal', fromPeerId, payload}` | a relayed message addressed to you |

## Not handled here

- **No persistence.** The relay holds no document state — if every peer
  disconnects, whatever they were editing only survives in whoever still
  has it open (or wherever the host app separately saves it).
- **No auth.** Anyone who can reach the relay and knows (or guesses) a
  `roomId` can join it. Put it behind your own auth/network boundary if
  that matters for your use case (a LAN is often boundary enough by
  itself; the open internet is not).
- **No TLS.** `ws://`, not `wss://`. Fine on a trusted LAN; add TLS
  (or run behind a reverse proxy that terminates it) before exposing this
  beyond one.
