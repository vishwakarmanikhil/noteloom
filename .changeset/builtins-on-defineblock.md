---
'noteloom': patch
---

Internal: every built-in block and inline type is now authored with
`defineBlock()` / `defineInline()` in its own module (`isLeaf` → `contentModel`).
`starterKit()` returns those definitions directly instead of wrapping them.
Behavior-neutral — no public API change, golden-document snapshots unchanged.
