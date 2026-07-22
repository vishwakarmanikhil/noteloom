import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EditorStore,
  History,
  EditorProvider,
  BlockChildren,
  createBlockRegistry,
  registerBuiltInBlocks,
  createInlineRegistry,
  registerBuiltInInlineTypes,
  useClipboardHandlers,
  useSlashMenuTrigger,
  useEditorKeyboardShortcuts,
  useHistory,
  SlashMenu,
  CollabSession,
  createWebSocketSignaling,
  genPeerId,
} from 'noteloom';
import './style.css';

function makeStarterDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['title', 'body'], props: {} },
      { id: 'title', type: 'heading', parentId: 'root', contentIds: ['rTitle'], props: { level: 2 } },
      { id: 'body', type: 'paragraph', parentId: 'root', contentIds: ['rBody'], props: {} },
    ],
    runs: [
      { id: 'rTitle', type: 'text', value: 'LAN collaboration (WebSocket relay)', marks: {} },
      { id: 'rBody', type: 'text', value: 'Type here — edits sync live to every other peer in this room.', marks: {} },
    ],
  };
}

const params = new URLSearchParams(window.location.search);
const RELAY_URL = params.get('relay') ?? 'ws://localhost:8080';
const ROOM_ID = params.get('room') ?? 'demo-room';

function ConnectionStatus({ localPeerId, connectedPeerIds, connectionError }) {
  return (
    <div className="collab-status">
      <span>
        You are <code>{localPeerId.slice(0, 8)}</code> in room <code>{ROOM_ID}</code>
      </span>
      <span>
        {connectionError
          ? `Relay error: ${connectionError}`
          : connectedPeerIds.length === 0
            ? 'Waiting for another peer to join this room…'
            : `Connected to ${connectedPeerIds.length} peer${connectedPeerIds.length === 1 ? '' : 's'}: ${connectedPeerIds
                .map((id) => id.slice(0, 8))
                .join(', ')}`}
      </span>
    </div>
  );
}

function Toolbar() {
  const history = useHistory();
  if (!history) return null;
  return (
    <div className="collab-toolbar">
      <button type="button" disabled={!history.canUndo} onClick={history.undo}>
        Undo
      </button>
      <button type="button" disabled={!history.canRedo} onClick={history.redo}>
        Redo
      </button>
      <span className="collab-toolbar-note">Undo only ever affects your own edits — never a peer's.</span>
    </div>
  );
}

function EditorSurface() {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);

  return (
    <div ref={containerRef} className="collab-surface" onCopy={onCopy} onCut={onCut} onPaste={onPaste}>
      <Toolbar />
      <BlockChildren parentId="root" />
      <SlashMenu
        isOpen={slashMenu.isOpen}
        rect={slashMenu.rect}
        commands={slashMenu.commands}
        runId={slashMenu.runId}
        onSelect={slashMenu.selectCommand}
        onClose={slashMenu.close}
      />
    </div>
  );
}

export function App() {
  const [connectedPeerIds, setConnectedPeerIds] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const { store, registry, inlineRegistry, localPeerId } = useMemo(() => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    const store = new History(new EditorStore({ rootId: null, blocks: [], runs: [] }));
    return { store, registry, inlineRegistry, localPeerId: genPeerId() };
  }, []);

  useEffect(() => {
    const signaling = createWebSocketSignaling({ url: RELAY_URL, roomId: ROOM_ID, peerId: localPeerId });
    const session = new CollabSession({ history: store, signaling });
    const knownPeerIds = new Set();

    function connectTo(remotePeerId) {
      if (knownPeerIds.has(remotePeerId)) return;
      knownPeerIds.add(remotePeerId);
      // Deterministic tie-break, same idea as the BroadcastChannel example:
      // exactly one side of each pair must be the WebRTC offer-maker.
      const initiator = localPeerId > remotePeerId;
      const peerConnection = session.connect(remotePeerId, { initiator });
      peerConnection.onOpen(() => setConnectedPeerIds((ids) => [...new Set([...ids, remotePeerId])]));
      peerConnection.onClose(() => {
        knownPeerIds.delete(remotePeerId);
        setConnectedPeerIds((ids) => ids.filter((id) => id !== remotePeerId));
      });
    }

    const unsubscribeDiscovered = signaling.onPeerDiscovered(connectTo);
    const unsubscribeLeft = signaling.onPeerLeft((remotePeerId) => {
      knownPeerIds.delete(remotePeerId);
      session.disconnect(remotePeerId);
      setConnectedPeerIds((ids) => ids.filter((id) => id !== remotePeerId));
    });

    function hasContent() {
      const rootId = store.getRootId();
      return Boolean(rootId && store.getBlock(rootId));
    }

    // The relay's roster (see websocketSignaling.js) tells us definitively,
    // right on connect, whether anyone else is already in this room --
    // unlike the BroadcastChannel example, there's no need to guess via a
    // timeout: an EMPTY roster means we know for certain we're first, so
    // seed immediately; any peer in the roster means real content is
    // coming, so just wait for it (however long that takes -- never fall
    // back to seeding once a peer is known, or it can overwrite their
    // actual document, which is exactly the bug the timeout-based version
    // of this had before it was fixed the same way).
    let sawRoster = false;
    const unsubscribeRosterCheck = signaling.onPeerDiscovered(() => {
      sawRoster = true;
    });
    const rosterFallback = setTimeout(() => {
      if (hasContent() || sawRoster) return;
      const doc = makeStarterDoc();
      store.store.blocks = new Map(doc.blocks.map((b) => [b.id, b]));
      store.store.runs = new Map(doc.runs.map((r) => [r.id, r]));
      store.store.rootId = doc.rootId;
      store.store._notify([...store.store.blocks.keys(), ...store.store.runs.keys()]);
    }, 500); // just long enough for the relay's roster message to arrive -- not a "give up" timeout, since it never fires once a peer is known

    const readyPoll = setInterval(() => {
      if (hasContent()) {
        setIsReady(true);
        clearInterval(readyPoll);
      }
    }, 100);

    // createWebSocketSignaling doesn't expose the raw socket, so surface
    // connection problems generically via a short grace period instead.
    const noConnectionTimeout = setTimeout(() => {
      if (!hasContent() && !sawRoster) setConnectionError((prev) => prev ?? 'no response from the relay yet — check it is running and reachable');
    }, 4000);

    return () => {
      unsubscribeDiscovered();
      unsubscribeLeft();
      unsubscribeRosterCheck();
      clearTimeout(rosterFallback);
      clearTimeout(noConnectionTimeout);
      clearInterval(readyPoll);
      session.destroy();
      signaling.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry} history={store}>
      <div className="collab-page">
        <ConnectionStatus localPeerId={localPeerId} connectedPeerIds={connectedPeerIds} connectionError={connectionError} />
        {isReady ? <EditorSurface /> : <p className="collab-loading">Joining room…</p>}
      </div>
    </EditorProvider>
  );
}
