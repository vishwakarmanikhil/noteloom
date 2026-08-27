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
  usePresence,
  resolveCollapsedCaret,
  SlashMenu,
  CollabSession,
  createWebSocketSignaling,
  genPeerId,
} from 'noteloom';
import './style.css';

const RETRY_INTERVAL_MS = 6000;

function makeStarterDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['title', 'body'], props: {} },
      {
        id: 'title',
        type: 'heading',
        parentId: 'root',
        contentIds: ['rTitle'],
        props: { level: 2 },
      },
      { id: 'body', type: 'paragraph', parentId: 'root', contentIds: ['rBody'], props: {} },
    ],
    runs: [
      { id: 'rTitle', type: 'text', value: 'LAN collaboration (WebSocket relay)', marks: {} },
      {
        id: 'rBody',
        type: 'text',
        value: 'Type here — edits sync live to every other peer in this room.',
        marks: {},
      },
    ],
  };
}

const params = new URLSearchParams(window.location.search);
const RELAY_URL = params.get('relay') ?? 'ws://localhost:8080';
const ROOM_ID = params.get('room') ?? 'demo-room';

// Deterministic color per peer id -- purely cosmetic, so every browser
// draws the same peer in the same color without any coordination. Same
// convention as examples/collab.
function colorForPeerId(peerId) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i += 1) hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 70%, 45%)`;
}

/**
 * Renders a thin colored caret + name tag at each peer's reported cursor
 * position -- resolves {runId, offset} to an on-screen rect by finding the
 * run's actual DOM text node, the same [data-run-id] convention the
 * editor's own selection-resolution code already relies on. Purely
 * demo/host-app rendering: the package only carries the {runId, offset}
 * data (via CollabSession.setLocalPresence/usePresence), it has no
 * opinion on how -- or whether -- you visualize it.
 */
function PeerCursors({ session }) {
  const presence = usePresence(session);
  const [, forceRerender] = useState(0);

  // Presence positions are relative to text that itself just re-rendered
  // (a peer moved their cursor because they typed) -- recompute rects
  // after each render rather than only when the presence Map identity
  // changes, so a cursor doesn't lag behind text reflowing under it.
  useEffect(() => {
    const id = requestAnimationFrame(() => forceRerender((n) => n + 1));
    return () => cancelAnimationFrame(id);
  }, [presence]);

  // getBoundingClientRect() is viewport-relative, and these cursors are
  // position: fixed (also viewport-relative) -- so the rect is never
  // stale from scrolling alone. What WAS stale is this component: nothing
  // re-rendered on scroll, so a cursor stayed glued to its old on-screen
  // spot while the real text moved underneath it, until the next
  // presence-driven re-render (above) happened to catch it back up.
  useEffect(() => {
    function handleScrollOrResize() {
      forceRerender((n) => n + 1);
    }
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, []);

  return (
    <>
      {[...presence.entries()].map(([peerId, data]) => {
        if (!data?.runId) return null;
        const host = document.querySelector(`[data-run-id="${data.runId}"]`);
        const textNode = host?.firstChild;
        if (!textNode) return null;
        const safeOffset = Math.max(
          0,
          Math.min(data.offset ?? 0, textNode.textContent?.length ?? 0),
        );
        const range = document.createRange();
        try {
          range.setStart(textNode, safeOffset);
          range.setEnd(textNode, safeOffset);
        } catch {
          return null; // stale offset from text that changed shape since -- skip this frame rather than throw
        }
        const rect = range.getBoundingClientRect();
        if (rect.top === 0 && rect.left === 0 && rect.height === 0) return null; // not laid out or off-screen
        const color = colorForPeerId(peerId);
        return (
          <div
            key={peerId}
            className="collab-peer-cursor"
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              height: rect.height || '1em',
              background: color,
            }}
          >
            <span className="collab-peer-cursor-label" style={{ background: color }}>
              {peerId.slice(0, 8)}
            </span>
          </div>
        );
      })}
    </>
  );
}

/**
 * Resets a store back to the same "genuinely empty" shape `useMemo` below
 * starts it in (rootId: null, no blocks/runs) -- used only on a real
 * reconnect, and only when nothing was typed locally in the meantime (see
 * the reconnect logic's own comment). CollabSession only ever adopts a
 * peer's full snapshot when this side starts genuinely empty, so this is
 * what lets a device that was just idle (not edited) catch up on
 * everything it missed, instead of silently staying stale forever.
 */
function resetStoreToEmpty(history) {
  const rawStore = history.store ?? history;
  rawStore.blocks = new Map();
  rawStore.runs = new Map();
  rawStore.rootId = null;
  rawStore._orders = new Map();
  rawStore._notify(['root']);
}

function ConnectionStatus({ localPeerId, connectedPeerIds, connectionError, status }) {
  return (
    <div className="collab-status">
      <span>
        You are <code>{localPeerId.slice(0, 8)}</code> in room <code>{ROOM_ID}</code>
      </span>
      <span>
        {connectionError
          ? `Relay error: ${connectionError}`
          : connectedPeerIds.length > 0
            ? `Connected to ${connectedPeerIds.length} peer${connectedPeerIds.length === 1 ? '' : 's'}: ${connectedPeerIds
                .map((id) => id.slice(0, 8))
                .join(', ')}`
            : status === 'reconnecting'
              ? 'Reconnecting…'
              : 'Waiting for another peer to join this room…'}
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
      <span className="collab-toolbar-note">
        Undo only ever affects your own edits — never a peer's.
      </span>
    </div>
  );
}

function EditorSurface({ session }) {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);

  // Broadcasts our own cursor position to peers on every selection change
  // -- CollabSession.setLocalPresence is already throttled (default
  // 100ms), so this can fire freely without worrying about flooding the
  // connection. Swap in a real name/color here (e.g. from your own
  // logged-in user, or a small per-device identity you generate and
  // remember yourself) instead of leaving presence at just {runId, offset}
  // if you want PeerCursors to show more than a bare peer id -- the
  // package never inspects this data, so any extra fields ride along free.
  useEffect(() => {
    if (!session) return undefined;
    const broadcastCaret = () => {
      const caret = resolveCollapsedCaret();
      if (caret) session.setLocalPresence({ runId: caret.runId, offset: caret.offset });
    };
    document.addEventListener('selectionchange', broadcastCaret);
    return () => document.removeEventListener('selectionchange', broadcastCaret);
  }, [session]);

  return (
    <div
      ref={containerRef}
      className="collab-surface"
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
    >
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
      <PeerCursors session={session} />
    </div>
  );
}

export function App() {
  const [connectedPeerIds, setConnectedPeerIds] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'connected' | 'reconnecting'

  const { store, registry, inlineRegistry, localPeerId } = useMemo(() => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    const store = new History(new EditorStore({ rootId: null, blocks: [], runs: [] }));
    return { store, registry, inlineRegistry, localPeerId: genPeerId() };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let currentSession = null;
    let currentSignaling = null;
    let knownPeerIds = new Set();
    let hasEverConnected = false;
    let hasLocalEditsWhilePeerless = false;
    let lastAttemptAt = 0;
    let cleanupAttempt = () => {};

    function hasContent() {
      const rootId = store.getRootId();
      return Boolean(rootId && store.getBlock(rootId));
    }

    function teardownConnection() {
      cleanupAttempt();
      cleanupAttempt = () => {};
      currentSession?.destroy();
      currentSignaling?.close();
      currentSession = null;
      currentSignaling = null;
      knownPeerIds = new Set();
      setSession(null);
    }

    function startConnection() {
      if (cancelled) return;
      teardownConnection();
      lastAttemptAt = Date.now();
      setStatus(hasEverConnected ? 'reconnecting' : 'connecting');

      // On a genuine RECONNECT (never the very first attempt) where
      // nothing was typed locally in the meantime, reset to empty first --
      // this makes the "adopt whoever's already got real content" flow
      // below do the catching-up for us too. CollabSession only ever
      // adopts a peer's snapshot when this side starts genuinely empty
      // (see resetStoreToEmpty's own comment), so without this, a
      // reconnecting peer would silently keep whatever it had and miss
      // everything the room changed while it was away. If local edits
      // WERE made while disconnected, they're kept as-is -- there's no
      // safe way to both preserve them and adopt someone else's snapshot
      // without a real CRDT merge, which this package doesn't attempt for
      // two independently-diverged documents (see the README's own note).
      if (hasEverConnected && !hasLocalEditsWhilePeerless) {
        resetStoreToEmpty(store);
      }

      const signaling = createWebSocketSignaling({
        url: RELAY_URL,
        roomId: ROOM_ID,
        peerId: localPeerId,
      });
      const collabSession = new CollabSession({ history: store, signaling });
      currentSignaling = signaling;
      currentSession = collabSession;
      setSession(collabSession);

      function connectTo(remotePeerId) {
        if (knownPeerIds.has(remotePeerId)) return;
        knownPeerIds.add(remotePeerId);

        // Deadlock guard: two brand-new tabs joining the same room at
        // nearly the same moment each discover the other via the roster
        // before either's "I'm alone" seed timeout below fires -- so
        // neither ever seeds, and since both start empty, the connection
        // they're about to make has no real content to sync either way.
        // Fix: seed HERE, synchronously, before `collabSession.connect()`
        // below even starts the handshake -- its own initial syncRequest/
        // syncResponse exchange (which happens automatically once the
        // data channel opens, well after this) then just picks up real
        // content naturally instead of two empty snapshots meeting in the
        // middle. Deterministic tie-break (whichever peerId sorts lower)
        // so exactly one side seeds, never both -- same idea as
        // `initiator` below, just decided independently on each side
        // without needing to agree over the wire.
        if (!hasEverConnected && !hasContent() && localPeerId < remotePeerId) {
          const doc = makeStarterDoc();
          store.store.blocks = new Map(doc.blocks.map((b) => [b.id, b]));
          store.store.runs = new Map(doc.runs.map((r) => [r.id, r]));
          store.store.rootId = doc.rootId;
          store.store._notify([...store.store.blocks.keys(), ...store.store.runs.keys()]);
        }

        // Deterministic tie-break: exactly one side of each pair must be
        // the WebRTC offer-maker.
        const initiator = localPeerId > remotePeerId;
        const peerConnection = collabSession.connect(remotePeerId, { initiator });
        peerConnection.onOpen(() => {
          hasEverConnected = true;
          hasLocalEditsWhilePeerless = false; // caught up (or had nothing to catch up on) -- clean slate from here
          setStatus('connected');
          setConnectedPeerIds((ids) => [...new Set([...ids, remotePeerId])]);
        });
        peerConnection.onClose(() => {
          knownPeerIds.delete(remotePeerId);
          setConnectedPeerIds((ids) => {
            const next = ids.filter((id) => id !== remotePeerId);
            if (next.length === 0) setStatus('reconnecting');
            return next;
          });
        });
      }

      const unsubscribeDiscovered = signaling.onPeerDiscovered(connectTo);
      const unsubscribeLeft = signaling.onPeerLeft((remotePeerId) => {
        knownPeerIds.delete(remotePeerId);
        collabSession.disconnect(remotePeerId);
        setConnectedPeerIds((ids) => ids.filter((id) => id !== remotePeerId));
      });

      // The relay's roster (see websocketSignaling.js) tells us
      // definitively, right on connect, whether anyone else is already in
      // this room -- an empty roster means we know for certain we're
      // first, so seed immediately; any peer in the roster means real
      // content is coming, so just wait for it. Only relevant on the very
      // first-ever connection attempt: a reconnect either kept its own
      // content (local edits happened while away) or was just reset to
      // empty above, which the ordinary adopt-on-empty path already
      // handles identically to a fresh join -- seeding again here would
      // race with that.
      let unsubscribeRosterCheck = () => {};
      let rosterFallback = null;
      if (!hasEverConnected) {
        let sawRoster = false;
        unsubscribeRosterCheck = signaling.onPeerDiscovered(() => {
          sawRoster = true;
        });
        rosterFallback = setTimeout(() => {
          if (hasContent() || sawRoster) return;
          const doc = makeStarterDoc();
          store.store.blocks = new Map(doc.blocks.map((b) => [b.id, b]));
          store.store.runs = new Map(doc.runs.map((r) => [r.id, r]));
          store.store.rootId = doc.rootId;
          store.store._notify([...store.store.blocks.keys(), ...store.store.runs.keys()]);
        }, 500); // just long enough for the relay's roster message to arrive -- not a "give up" timeout, since it never fires once a peer is known
      }

      const readyPoll = setInterval(() => {
        if (hasContent()) {
          setIsReady(true);
          clearInterval(readyPoll);
        }
      }, 100);

      // createWebSocketSignaling doesn't expose the raw socket, so surface
      // connection problems generically via a short grace period instead.
      const noConnectionTimeout = setTimeout(() => {
        if (!hasContent() && knownPeerIds.size === 0) {
          setConnectionError(
            (prev) => prev ?? 'no response from the relay yet — check it is running and reachable',
          );
        }
      }, 4000);

      cleanupAttempt = () => {
        unsubscribeDiscovered();
        unsubscribeLeft();
        unsubscribeRosterCheck();
        if (rosterFallback) clearTimeout(rosterFallback);
        clearInterval(readyPoll);
        clearTimeout(noConnectionTimeout);
      };
    }

    startConnection();

    // Track LOCAL edits made while we have zero peers. History's own
    // change notifications only ever fire for local perform/performBatch/
    // undo/redo -- never for applyRemoteOperation -- so this can't
    // mistake an incoming peer's edit for our own.
    const unsubscribeLocalEdits = store.subscribeToHistory(() => {
      if (knownPeerIds.size === 0) hasLocalEditsWhilePeerless = true;
    });

    // The watchdog that makes reconnection actually automatic --
    // createWebSocketSignaling exposes no close/error event for the relay
    // connection dying silently (a sleeping laptop, a WiFi drop, the relay
    // restarting), so periodically checking "do we have zero live peers,
    // and has it been a while since we last tried" is the only reliable
    // way to notice and recover.
    const watchdog = setInterval(() => {
      if (cancelled || knownPeerIds.size > 0) return;
      if (Date.now() - lastAttemptAt < RETRY_INTERVAL_MS) return;
      startConnection();
    }, 2000);

    // An explicit "the network just came back" signal is worth reacting to
    // immediately rather than waiting for the next watchdog tick.
    function handleOnline() {
      if (!cancelled && knownPeerIds.size === 0) startConnection();
    }
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      window.removeEventListener('online', handleOnline);
      unsubscribeLocalEdits();
      teardownConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorProvider
      store={store}
      registry={registry}
      inlineRegistry={inlineRegistry}
      history={store}
    >
      <div className="collab-page">
        <ConnectionStatus
          localPeerId={localPeerId}
          connectedPeerIds={connectedPeerIds}
          connectionError={connectionError}
          status={status}
        />
        {isReady ? (
          <EditorSurface session={session} />
        ) : (
          <p className="collab-loading">Joining room…</p>
        )}
      </div>
    </EditorProvider>
  );
}
