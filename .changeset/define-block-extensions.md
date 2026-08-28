---
'noteloom': minor
---

Add `defineBlock()` / `defineInline()` — validating factories for authoring a
block or inline type — plus `registerExtensions()` and a new
`useEditor({ extensions: [...] })` option. `noteloom/starter-kit` exports
`starterKit()` (every built-in type as an `extensions` array; `{ exclude }` drops
some) alongside the factories.

These sit next to the existing `registerBlocks` / `registerBuiltInBlocks` /
`registerInlineTypes` callbacks, which are unchanged. A `defineBlock()` result is
still a plain registry entry, and `useEditor({ extensions: starterKit() })`
registers the identical set as `useEditor()` — verified by the golden-document
e2e fixture, which now renders through that path with byte-identical output.
