---
'noteloom': minor
---

Fixed a cluster of code block paste/editing bugs and added opt-in syntax highlighting.

Paste fixes: pasting inside a code block now lands inside it as literal text (line breaks preserved) instead of spilling out as new paragraphs next to it. Pasting a formatted single-block snippet (inline code/link marks) no longer silently strips its formatting and merges the plain text into whatever run already sat at the caret. A multi-block paste now lands real browser focus/selection at the end of the pasted content, so an immediate Backspace/Delete can merge blocks without needing an unrelated keystroke first to "wake up" the selection. "Copy code" HTML from VS Code/GitHub/doc sites — a `<pre>` wrapped in container elements, or one `<div>`/`<br>` per line with no literal newlines at all — is now detected and reconstructed into a real code block instead of one squished, unformatted paragraph.

Editing fix: a code block run ending in a literal `"\n"` no longer hits the browser's ambiguous trailing-newline caret position (every major browser's own contentEditable quirk) — previously, typing right after pressing Enter inside a code block could insert the new text before the line break instead of after it.

`EditorProvider`/`NoteloomEditor` gain an optional `highlightCode(code, language) -> string` prop — wire in Prism/Shiki/highlight.js/anything else to get syntax-colored code blocks, rendered as a read-only overlay behind the real editable text. No highlighter ships with this package (it stays zero-runtime-dependency); omit the prop and a code block renders as plain monochrome text, same as before. See `useHighlightCode`'s doc comment for the full contract.

The floating format toolbar and Ctrl+B/I/U no longer activate for text selected inside a code block, which never renders marks there anyway.
