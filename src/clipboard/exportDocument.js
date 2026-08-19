import { captureSubtree } from './serialize.js';
import { serializeBlockRange } from './serialize.js';

/**
 * Whole-document JSON export — the exact `{ rootId, blocks, runs }` shape
 * `new EditorStore({...})` itself accepts, so this round-trips: export a
 * document, and the result can be handed straight back into a fresh
 * EditorStore to reconstruct it. Wraps captureSubtree (already used for
 * duplicate/copy) starting from the document's own root rather than one
 * top-level block, so it walks the *entire* tree in one pass.
 */
export function exportDocumentJSON(store, { pretty = true } = {}) {
  const rootId = store.getRootId();
  const { blocks, runs } = captureSubtree(store, rootId);
  const payload = { version: 1, rootId, blocks, runs };
  return JSON.stringify(payload, null, pretty ? 2 : 0);
}

/** Whole-document HTML export — every top-level block's own toHTML, joined (see serializeBlockRange). */
export function exportDocumentHTML(store, registry, inlineRegistry) {
  const root = store.getBlock(store.getRootId());
  if (!root) return '';
  return serializeBlockRange(store, registry, root.contentIds, inlineRegistry).html;
}

/** Whole-document plain-text export — every top-level block's own toPlainText, joined (see serializeBlockRange). */
export function exportDocumentText(store, registry, inlineRegistry) {
  const root = store.getBlock(store.getRootId());
  if (!root) return '';
  return serializeBlockRange(store, registry, root.contentIds, inlineRegistry).text;
}

/**
 * Whole-document HTML wrapped for Microsoft Word — the well-known trick of
 * giving Word-flavored HTML (an `xmlns:w="urn:schemas-microsoft-com:office:
 * word"` namespace + a small `<!--[if gte mso 9]>` block) a `.doc`
 * extension, which Word opens directly via MIME sniffing without needing a
 * real `.docx` (OOXML zip) writer — no runtime dependency needed for
 * either the zip container or the XML schema a genuine `.docx` would
 * require, staying true to this package's zero-dependency design. The
 * `<body>` content is exactly `exportDocumentHTML`'s own output — nothing
 * about the per-block HTML changes for Word specifically.
 */
export function exportDocumentWordHTML(store, registry, inlineRegistry) {
  const body = exportDocumentHTML(store, registry, inlineRegistry);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Document</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
</head>
<body>${body}</body>
</html>`;
}

/**
 * Whole-document Markdown (CommonMark/GFM) export. Each top-level block
 * calls its own `toMarkdown(block, ctx)`; a block type with no
 * `toMarkdown` of its own (a custom host-registered block type, or one of
 * this package's own types with no meaningful Markdown form — canvas
 * drawings, in particular) falls back to its required `toPlainText`
 * instead, same graceful-degradation choice every per-block `toMarkdown`
 * above makes for ITS OWN children.
 *
 * Consecutive sibling blocks are joined with a blank line EXCEPT between
 * two list items of the same kind (both `listItem`, both `ordered` or both
 * not) or two consecutive `blockquote` lines — those need to stay
 * adjacent, with no blank line between them, or Markdown parses them as
 * separate lists/quotes instead of one continuous one. Mirrors
 * `serializeHTML`'s own consecutive-sibling grouping in `serialize.js`,
 * just without an actual wrapping tag to emit (Markdown lists/quotes need
 * no container syntax, only adjacency).
 */
export function exportDocumentMarkdown(store, registry, inlineRegistry) {
  const root = store.getBlock(store.getRootId());
  if (!root) return '';
  const ctx = { store, registry, inlineRegistry };
  const ids = root.contentIds;

  let markdown = '';
  let prevBlock = null;
  for (const id of ids) {
    const block = store.getBlock(id);
    const entry = registry.get(block.type);
    const blockMarkdown = (entry.toMarkdown ?? entry.toPlainText)(block, ctx);

    if (prevBlock) {
      const sameList =
        block.type === 'listItem' &&
        prevBlock.type === 'listItem' &&
        Boolean(block.props.ordered) === Boolean(prevBlock.props.ordered);
      const sameQuote = block.type === 'blockquote' && prevBlock.type === 'blockquote';
      markdown += sameList || sameQuote ? '\n' : '\n\n';
    }
    markdown += blockMarkdown;
    prevBlock = block;
  }
  return markdown;
}
