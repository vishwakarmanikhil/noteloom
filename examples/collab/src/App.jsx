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
} from 'noteloom';
import { createBroadcastChannelSignaling } from './broadcastChannelSignaling.js';
import './style.css';

// Deterministic color per peer id -- purely cosmetic, so every tab draws
// the same peer in the same color without any coordination.
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

  return (
    <>
      {[...presence.entries()].map(([peerId, data]) => {
        if (!data?.runId) return null;
        const host = document.querySelector(`[data-run-id="${data.runId}"]`);
        const textNode = host?.firstChild;
        if (!textNode) return null;
        const safeOffset = Math.max(0, Math.min(data.offset ?? 0, textNode.textContent?.length ?? 0));
        const range = document.createRange();
        try {
          range.setStart(textNode, safeOffset);
          range.setEnd(textNode, safeOffset);
        } catch {
          return null; // stale offset from text that changed shape since -- skip this frame rather than throw
        }
        const rect = range.getBoundingClientRect();
        if (rect.top === 0 && rect.left === 0 && rect.height === 0) return null; // not laid out (e.g. jsdom) or off-screen
        const color = colorForPeerId(peerId);
        return (
          <div
            key={peerId}
            className="collab-peer-cursor"
            style={{ position: 'fixed', top: rect.top, left: rect.left, height: rect.height || '1em', background: color }}
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

// Deterministic ids (not genId()), used only when THIS tab turns out to be
// the first one to open the room (see the bootstrap logic in App() below) —
// sidesteps the "merge two independently-created documents" problem
// (deliberately unsolved — see CollabSession's _adoptSnapshotIfEmpty) by
// making sure at most one tab per room ever originates content; every
// later joiner adopts it via sync instead of seeding its own copy.
function makeStarterDoc() {
  return {
    rootId: 'root',
    blocks: [
      { id: 'root', type: 'page', parentId: null, contentIds: ['title', 'body'], props: {} },
      { id: 'title', type: 'heading', parentId: 'root', contentIds: ['rTitle'], props: { level: 2 } },
      { id: 'body', type: 'paragraph', parentId: 'root', contentIds: ['rBody'], props: {} },
    ],
    runs: [
      { id: 'rTitle', type: 'text', value: 'Open this page in a second tab', marks: {} },
      { id: 'rBody', type: 'text', value: 'Type here — edits sync live to every other tab connected to this room.', marks: {} },
    ],
  };
}

function ConnectionStatus({ localPeerId, connectedPeerIds }) {
  return (
    <div className="collab-status">
      <span>
        You are <code>{localPeerId.slice(0, 8)}</code>
      </span>
      <span>
        {connectedPeerIds.length === 0
          ? 'Waiting for another tab to open this page…'
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

function EditorSurface({ session }) {
  const containerRef = useRef(null);
  const { onCopy, onCut, onPaste } = useClipboardHandlers();
  const slashMenu = useSlashMenuTrigger(containerRef);
  useEditorKeyboardShortcuts(containerRef);

  // Broadcasts our own cursor position to peers on every selection change
  // -- CollabSession.setLocalPresence is already throttled (default
  // 100ms), so this can fire freely without worrying about flooding the
  // connection.
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
      <PeerCursors session={session} />
    </div>
  );
}

export function App() {
  const [connectedPeerIds, setConnectedPeerIds] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState(null);

  const { store, registry, inlineRegistry, signaling } = useMemo(() => {
    const registry = createBlockRegistry();
    registerBuiltInBlocks(registry);
    const inlineRegistry = createInlineRegistry();
    registerBuiltInInlineTypes(inlineRegistry);
    // Starts genuinely empty — see the bootstrap effect below for why.
    const store = new History(new EditorStore({ rootId: null, blocks: [], runs: [] }));
    const signaling = createBroadcastChannelSignaling();
    return { store, registry, inlineRegistry, signaling };
  }, []);

  useEffect(() => {
    const session = new CollabSession({ history: store, signaling });
    setSession(session);
    const knownPeerIds = new Set();
    let peerFound = false;

    function connectTo(remotePeerId) {
      if (knownPeerIds.has(remotePeerId)) return;
      knownPeerIds.add(remotePeerId);
      peerFound = true;
      // Deterministic tie-break: exactly one side of each pair must be the
      // WebRTC offer-maker. Comparing peer ids the same way on both sides
      // always agrees on which one that is, with no extra coordination.
      const initiator = signaling.localPeerId > remotePeerId;
      const peerConnection = session.connect(remotePeerId, { initiator });
      peerConnection.onOpen(() => setConnectedPeerIds((ids) => [...new Set([...ids, remotePeerId])]));
      peerConnection.onClose(() => {
        knownPeerIds.delete(remotePeerId);
        setConnectedPeerIds((ids) => ids.filter((id) => id !== remotePeerId));
      });
    }

    const unsubscribeDiscovery = signaling.onPeerDiscovered((remotePeerId) => {
      connectTo(remotePeerId);
      // Reply so a tab that opened AFTER our own initial announcement
      // still discovers us — its announcement is the first thing we hear
      // from it, so this is the only chance we get to answer back.
      signaling.announcePresence();
    });
    signaling.announcePresence();

    function hasContent() {
      const rootId = store.getRootId();
      return Boolean(rootId && store.getBlock(rootId));
    }

    function seedStarterDoc() {
      const doc = makeStarterDoc();
      store.store.blocks = new Map(doc.blocks.map((b) => [b.id, b]));
      store.store.runs = new Map(doc.runs.map((r) => [r.id, r]));
      store.store.rootId = doc.rootId;
      store.store._notify([...store.store.blocks.keys(), ...store.store.runs.keys()]);
    }

    // This tab starts empty on purpose: if another tab already has this
    // room open, connecting to it lets CollabSession's own syncResponse
    // handling adopt its (possibly already-edited) document — the whole
    // point being that a NEW tab always sees the room's current state,
    // never stale starter content. Content only ever gets seeded once, by
    // whichever tab turns out to be genuinely alone.
    //
    // CollabSession has no "a snapshot was just adopted" event to hook,
    // so readiness is detected by polling for a root block to appear.
    // Seeding only ever happens if NO peer answers our presence
    // announcement within SOLO_TIMEOUT_MS — a short window, since
    // presence discovery is near-instant over the same BroadcastChannel.
    //
    // Deliberately NOT a "give up and seed anyway after N seconds even if
    // a peer was found" fallback — that was tried and is actively unsafe:
    // once a peer connection is confirmed, syncing a large document (a
    // big embedded video, say) can legitimately take longer than any
    // fixed timeout, and a fallback that seeds anyway silently overwrites
    // the peer's real content with a blank starter doc instead of just
    // waiting a bit longer. If a peer is known to exist, this tab waits
    // for their content indefinitely -- worst case on a genuine failure
    // is a stuck "Joining room…" screen, which is safe (no data loss),
    // unlike the alternative.
    const SOLO_TIMEOUT_MS = 1500;

    const readyPoll = setInterval(() => {
      if (hasContent()) {
        setIsReady(true);
        clearInterval(readyPoll);
      }
    }, 100);
    const soloTimeout = setTimeout(() => {
      if (hasContent() || peerFound) return; // a peer exists -- wait for their content, however long it takes
      seedStarterDoc();
    }, SOLO_TIMEOUT_MS);

    return () => {
      unsubscribeDiscovery();
      clearInterval(readyPoll);
      clearTimeout(soloTimeout);
      session.destroy();
      signaling.close();
      setSession(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorProvider store={store} registry={registry} inlineRegistry={inlineRegistry} history={store}>
      <div className="collab-page">
        <ConnectionStatus localPeerId={signaling.localPeerId} connectedPeerIds={connectedPeerIds} />
        {isReady ? <EditorSurface session={session} /> : <p className="collab-loading">Joining room…</p>}
      </div>
    </EditorProvider>
  );
}
