---
'noteloom': minor
---

Make the simple JSON format (`{ version, blocks: [{ id, type, data, children? }] }`)
the canonical one:

- `useEditor({ doc })` now accepts **either** the simple format or the internal
  `{ rootId, blocks, runs }` shape — auto-detected. New export `isSimpleDocument()`.
- `editor.toJSON({ format })` reads the live document out — `'simple'` (default)
  or `'internal'`.
- `docs/document.schema.json` is a versioned JSON Schema for the format; a test
  validates every export against it and checks `simple → store → simple` is
  byte-stable.

No change to `exportDocumentSimpleJSON` / `importDocumentSimpleJSON` /
`exportDocumentJSON` behavior; internal-shape docs load exactly as before.
