---
'noteloom': minor
---

Add `defineExtension({ name, blocks?, inlineTypes? })` — a named bundle of
`defineBlock()` / `defineInline()` results that drops into the
`useEditor({ extensions: [...] })` array as one item, for a plugin that ships
more than one type. `registerExtensions` unpacks bundles recursively. Also
exported from `noteloom/starter-kit`.

Behavior extensions (keymaps, input rules, paste transforms) and a `ctx` facade
are not part of this yet.
