---
'noteloom': minor
---

Add a zero-dependency CLI (published in the package's `bin`):
`npx noteloom new block <name>` / `npx noteloom new inline <name>` scaffolds a
`<name>/` folder with a `defineBlock()` / `defineInline()` starting point, a
component, and a test.

`examples/02-custom-block/` is rewritten to author its block with `defineBlock()`
and register it via `extensions: [...starterKit(), ratingBlock]`.
