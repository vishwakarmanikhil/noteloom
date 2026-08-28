---
'noteloom': minor
---

Add opt-in subpath entry points so heavy optional features can be dropped from a
bundle that doesn't use them:

- `noteloom/collab` — real-time collaboration + CRDT primitives
- `noteloom/persistence` — IndexedDB persistence + service-worker update hook
- `noteloom/comments` — comment threads + the built-in comment UI
- `noteloom/versions` — automatic version history + `<VersionHistory>`
- `noteloom/voice` — voice typing
- `noteloom/canvas` — the freehand-drawing block (the heaviest single component)
- `noteloom/theme` — the default theme stylesheet (alias of `noteloom/style.css`)

Every name in these entries is still exported from the main `noteloom` entry, so
existing imports are unaffected. The build is now multi-entry with shared code in
`dist/shared/*` chunks; the built file for the main entry is `dist/index.js` /
`dist/index.cjs` (was `dist/noteloom.es.js` / `dist/noteloom.cjs`), reachable
only through the package `exports` map.
