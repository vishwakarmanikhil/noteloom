---
'noteloom': minor
---

Deprecate default-theme auto-injection. `<NoteloomEditor>` / `<EditorProvider>`
still inject the default theme automatically, but now emit a one-time, dev-only
`console.warn` when they do (suppressed under `NODE_ENV` `production` / `test`).
A future major version will stop auto-injecting.

To silence it and be future-proof: `import 'noteloom/theme'` once (keep the
default theme), or pass `theme="none"` (you style the editor yourself). Nothing
breaks in this release. `injectDefaultStyles()` now takes an optional
`{ auto }` flag (internal use).
