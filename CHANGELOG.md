# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `canvasBlockType` was defined and used internally (`registerBuiltInBlocks` already wired it in) but never re-exported from the package's public entry point (`src/index.js`/`src/index.d.ts`) — every other block type had an individual opt-in export, canvas didn't. Opting into a hand-picked subset of blocks that included canvas (`registerBlocks(registry, { canvas: canvasBlockType, ... })`) silently received `undefined` for it. Now exported like every other block type, both from JS and the `.d.ts` types.

## [0.2.0]

### Added

- **Real-time collaborative editing**, built as a custom block-tree CRDT (not a generic text-CRDT library) so the package stays zero-runtime-dependency:
  - `src/crdt/` — a logical clock (HLC), an ordered-list CRDT for block positions, and a last-write-wins registry for props/type/run-text fields.
  - `EditorStore` now merge-safely tracks every insert/remove/move/edit via that CRDT core, with a new `applyRemoteOperation` entry point kept structurally separate from `History` so remote edits can never enter local undo/redo.
  - `src/sync/` — a WebRTC transport (`PeerConnection`, `CollabSession`, `syncProtocol`) carrying the same CRDT envelopes, with transparent message fragmentation and real backpressure handling for large payloads (e.g. embedded video/file data URLs).
  - `createWebSocketSignaling()` — a generic `SignalingChannel` over plain WebSocket, for manual/shared-rendezvous setups (a relay on your LAN, no internet required, or any host if you want internet-wide reach). A minimal reference relay server lives in `tools/lan-relay-server/` (not part of the published package).
  - Presence/awareness — `CollabSession.setLocalPresence`/`getPresence`/`onPresenceChange` and the `usePresence` hook, for live cursors and "who's online," entirely separate from the document CRDT.
  - Opt-in tombstone garbage collection — `store.pruneTombstones()`/`getTombstoneCount()` and `createPeriodicTombstoneGC()`, safe specifically because reconnects always resync via a full document snapshot rather than replaying historical ops.
  - "Turn into" block-type conversion is now an in-place mutation (same block id) instead of delete-and-recreate, so concurrent conversions of the same block merge as one field conflict instead of producing duplicate blocks.
- **Offline-first persistence** — `usePersistedDocument`, `createAutoPersistence`, and the underlying IndexedDB primitives (`savePersistedDocument`/`loadPersistedDocument`/`deletePersistedDocument`/`listPersistedDocumentIds`). Works standalone or alongside `CollabSession`.
- **PWA / offline app-shell support** — `useServiceWorkerUpdate`, for surfacing "a new version is available" against any service worker registration (host apps bring their own service worker setup, e.g. via `vite-plugin-pwa` — see `examples/offline-persist/`).
- `EditorStore.subscribeAll` (+ `History` passthrough) — a whole-document "something changed" change hook, distinct from the existing per-id `subscribe` used for render isolation.
- New runnable examples: `examples/collab/` (BroadcastChannel signaling, same-browser demo), `examples/lan-collab/` (WebSocket relay signaling, real multi-device/LAN), `examples/offline-persist/` (IndexedDB persistence + PWA), and a numbered `examples/01-quickstart/` … `04-styling/` learning ladder for the new one-call API below (see `examples/README.md`).
- **`useEditor()` + `<NoteloomEditor>`** — a one-call path to a fully working editor (store + both registries pre-populated with every built-in type, undo/redo, clipboard, slash/emoji/@-mention menus, floating format toolbar, keyboard shortcuts, block-range drag, all wired up), replacing the ~40-line manual setup previously required for the common case. Purely additive — the granular API (`EditorStore`, `EditorProvider`, `createBlockRegistry`, individual hooks, ...) is unchanged and still the documented path for anything this doesn't cover (see README's "Advanced: the granular API" section).
- **TypeScript type definitions** (`src/index.d.ts`, hand-written, published as `dist/index.d.ts`) covering the public API — no `.js`/`.jsx` source changed to produce it. `npm run typecheck` (`tsc --noEmit` against the declaration file) now also runs in CI.

### Fixed

- A pre-existing bug where converting a `callout` (a container with no `titleRunIds` of its own) to/from a `titleRunIds`-based type (`listItem`, `toggleHeading`) corrupted the target's `titleRunIds`/`contentIds` by misreading child block ids as text run ids.
- Several bugs found only through real two-peer/real-browser testing along the way: a multi-op batch (e.g. block-type conversion) only broadcasting its last op's change to peers, not all of them; a remote edit landing mid-keystroke being silently reverted by the next local undo; large embedded files failing to sync at all (`RTCDataChannel`'s message-size limit) and then failing differently once chunked (no backpressure against the channel's own send queue); a demo bootstrap race that could reset a room's real content back to a blank starter document.

### Infrastructure

- Added a CI workflow (`.github/workflows/ci.yml`) running the full test suite and build on every push/PR, across Node 18/20/22.
- `examples/` is no longer excluded from the repository — the README's own quick-start and demo instructions now actually work for anyone who clones it.

## [0.1.7] and earlier

Pre-dates this changelog's introduction. See `git log` for the full history — notable earlier milestones include the canvas/drawing block, RTL and multi-language support, voice typing, a full accessibility pass (keyboard-operable menus, focus management, live-region announcements), mobile/touch support, and the two JSON export shapes (engine format + simplified storage format).
