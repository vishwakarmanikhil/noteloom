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
npm run test:e2e                # Playwright: comments flow + golden-document regression gate
npm run typecheck               # tsc --noEmit against src/index.d.ts
npm run lint                    # eslint (warnings allowed; errors block CI)
npm run format                  # prettier --write .
npm run size                    # build + size-limit bundle budget
npm run changeset               # record a release note for your change
npm run build                   # library build -> dist/ (ESM + CJS + index.d.ts + style.css)
```

See `examples/README.md` for what each example teaches, in order.

If you're working on the collaboration/sync layer (`src/sync/`, `src/crdt/`), the relevant examples under `examples/` are the fastest way to see a change actually working — prefer driving one of them over reasoning from the code alone, especially for anything touching WebRTC, since a lot of real bugs in this codebase were only caught by opening two real browser tabs.

## Before opening a PR

- **Run `npm test`.** CI runs the full suite on Node 18/20/22 on every push and PR (`.github/workflows/ci.yml`) — a red CI check is expected to be fixed before merge, not ignored.
- **Add or update tests for behavior changes.** `test/` mirrors `src/`'s structure — find the sibling test file for whatever you touched.
- **If you change the public API** (add/remove/rename an export in `src/index.js`), update `src/index.d.ts` to match and run `npm run typecheck` — it's hand-written, not generated, so nothing enforces this automatically. `test/publicApi.test.js` also holds a frozen list of every exported name; it will fail until you update that list in the same commit, which is the intended review signal for an API-surface change.
- **`npm run test:e2e`** runs the Playwright suite: the comments flow, plus a golden-document regression gate (`test-e2e/golden-document.spec.js`) that renders a deterministic fixture and snapshots every serialization export + the editor DOM. If a change to rendering or export output is intentional, refresh the snapshots in the same commit with `npx playwright test golden-document --update-snapshots` — a snapshot diff you didn't expect is a regression.
- **If you're touching `src/sync/` or `src/crdt/`, verify against a real scenario**, not just unit tests — the fake WebRTC/IndexedDB test harnesses (`test/sync/fakeWebrtc.js`, `fake-indexeddb`) are good for fast feedback, but this codebase's history includes several bugs (message chunking, backpressure, undo/remote-edit races) that only showed up under real browser + real network conditions.
- **Keep the zero-runtime-dependency constraint intact.** Nothing in `src/` should end up requiring a new npm package at runtime for a consuming app — devDependencies (test tooling, example build tooling) are fine; runtime `dependencies` are not.
- **Run `npm run lint`.** CI's `lint` job fails on ESLint _errors_ (warnings are fine for now). If your change grows the bundle past the `.size-limit.json` budget, that job fails too — justify the increase or trim it.
- **Add a changeset** (`npm run changeset`) for anything user-facing — it becomes the release note.

## Code style

ESLint (`eslint.config.js`) and Prettier (`.prettierrc.json`) are configured. `npm run lint` currently allows warnings; beyond that, these conventions still apply:

- Default to **no comments**. Add one only when it explains a non-obvious _why_ — a hidden constraint, a workaround, a subtle invariant — not what the code visibly does.
- Prefer editing/extending existing patterns over introducing a new one for the same problem (there's usually already a block/hook/utility doing something structurally similar — look for it first).
- Small, focused PRs. A bug fix doesn't need a refactor riding along with it.

## Where things live

- `src/store/` — the core `EditorStore`/`History`/operations.
- `src/blocks/`, `src/inlineTypes/` — built-in block and inline widget types.
- `src/crdt/` — the collaboration merge engine (pure, no transport knowledge).
- `src/sync/` — WebRTC transport + signaling (no merge-algorithm knowledge).
- `src/persistence/` — IndexedDB-backed local persistence.
- `src/react/` and `src/commands/` — the two React-coupled zones. **Everything else under `src/` is framework-free and a lint rule (`no-restricted-imports`) enforces that no `.js` outside these two folders imports `react`/`react-dom`.** If you're writing a hook or anything that touches React, it goes in `src/react/` (or `src/commands/` for slash/toolbar trigger hooks), even if the feature it serves lives elsewhere.
- `src/index.js` + `src/<feature>.js` (`collab`, `persistence`, `comments`, `versions`, `voice`, `canvas`) — the published entry points. `src/index.js` re-exports everything; the feature files re-export a hand-picked slice for the `noteloom/<feature>` subpaths. Each has a sibling hand-written `src/<name>.d.ts`. Adding/renaming a public export means updating the relevant entry file, its `.d.ts`, **and** the frozen list in `test/publicApi.test.js` (the build's `exports` map in `package.json` and `vite.config.js`'s `lib.entry` only change when a whole new subpath is added).
- `examples/` — runnable demo apps, not part of the published npm package.
- `tools/` — reference tooling (e.g. the LAN signaling relay) that's Node-only and also not part of the published package.
- `scripts/` — build helpers (`copy-dist-assets.mjs`).

## Questions / bugs

Open an issue: https://github.com/vishwakarmanikhil/noteloom/issues
