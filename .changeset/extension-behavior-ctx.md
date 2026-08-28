---
'noteloom': minor
---

`defineExtension()` gains a behavior half: `keymap`, `onBeforeInput`, `onPaste`,
and `setup(ctx)`. When such an extension is passed to `useEditor({ extensions })`
and rendered by `<NoteloomEditor>`, the handlers run against a stable `ctx`
facade (`store`, `registry`, `inlineRegistry`, `container`, `getBlock/getRun`,
`applyOperation` (flushSync-wrapped), `getSelection/getCaret/setCaret`,
`subscribe`, …). Returning truthy marks the event handled — the editor then
prevents it and stops built-in handlers on the same element from also firing.

New exports `smartQuotes()` and `autoPairBrackets()` are the older
`useSmartQuotes` / `useAutoPairBrackets` behaviors in this new form (the hooks
still work). Markdown-style block-conversion input rules are not part of this
yet. Entirely inert for an editor with no behavior extensions.
