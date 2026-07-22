# Contributing to noteloom

Thanks for considering it. This is a small, opinionated project — a few
notes to make a contribution land smoothly.

## Getting set up

```bash
git clone https://github.com/vishwakarmanikhil/noteloom.git
cd noteloom
npm install
npm test
```

That's it — no build step is needed to run the tests.

## Running things

```bash
npm run dev                     # examples/basic — the general-purpose demo, built from the granular API
npm run dev:quickstart          # examples/01-quickstart — useEditor()/<NoteloomEditor>
npm run dev:custom-block        # examples/02-custom-block — + a custom block type
npm run dev:custom-field-type   # examples/03-custom-field-type — + a custom dropdown/mention field type
npm run dev:styling             # examples/04-styling — + retheming
npm run dev:collab              # examples/collab — real-time collaboration (BroadcastChannel signaling, open two tabs)
npm run dev:lan-collab          # examples/lan-collab — collaboration over a WebSocket relay (see tools/lan-relay-server/)
npm run dev:offline-persist     # examples/offline-persist — IndexedDB persistence + PWA
npm test                        # vitest (jsdom + @testing-library/react)
npm run typecheck               # tsc --noEmit against src/index.d.ts
npm run build                   # library build -> dist/ (ESM + CJS + index.d.ts + style.css)
```

See `examples/README.md` for what each example teaches, in order.

If you're working on the collaboration/sync layer (`src/sync/`, `src/crdt/`), the relevant examples under `examples/` are the fastest way to see a change actually working — prefer driving one of them over reasoning from the code alone, especially for anything touching WebRTC, since a lot of real bugs in this codebase were only caught by opening two real browser tabs.

## Before opening a PR

- **Run `npm test`.** CI runs the full suite on Node 18/20/22 on every push and PR (`.github/workflows/ci.yml`) — a red CI check is expected to be fixed before merge, not ignored.
- **Add or update tests for behavior changes.** `test/` mirrors `src/`'s structure — find the sibling test file for whatever you touched.
- **If you change the public API** (add/remove/rename an export in `src/index.js`), update `src/index.d.ts` to match and run `npm run typecheck` — it's hand-written, not generated, so nothing enforces this automatically.
- **If you're touching `src/sync/` or `src/crdt/`, verify against a real scenario**, not just unit tests — the fake WebRTC/IndexedDB test harnesses (`test/sync/fakeWebrtc.js`, `fake-indexeddb`) are good for fast feedback, but this codebase's history includes several bugs (message chunking, backpressure, undo/remote-edit races) that only showed up under real browser + real network conditions.
- **Keep the zero-runtime-dependency constraint intact.** Nothing in `src/` should end up requiring a new npm package at runtime for a consuming app — devDependencies (test tooling, example build tooling) are fine; runtime `dependencies` are not.

## Code style

There's no linter configured yet, so these are conventions, not enforced rules:

- Default to **no comments**. Add one only when it explains a non-obvious *why* — a hidden constraint, a workaround, a subtle invariant — not what the code visibly does.
- Prefer editing/extending existing patterns over introducing a new one for the same problem (there's usually already a block/hook/utility doing something structurally similar — look for it first).
- Small, focused PRs. A bug fix doesn't need a refactor riding along with it.

## Where things live

- `src/store/` — the core `EditorStore`/`History`/operations.
- `src/blocks/`, `src/inlineTypes/` — built-in block and inline widget types.
- `src/crdt/` — the collaboration merge engine (pure, no transport knowledge).
- `src/sync/` — WebRTC transport + signaling (no merge-algorithm knowledge).
- `src/persistence/` — IndexedDB-backed local persistence.
- `src/react/` — React hooks/components (the public-facing surface for most of the above).
- `examples/` — runnable demo apps, not part of the published npm package.
- `tools/` — reference tooling (e.g. the LAN signaling relay) that's Node-only and also not part of the published package.

## Questions / bugs

Open an issue: https://github.com/vishwakarmanikhil/noteloom/issues
