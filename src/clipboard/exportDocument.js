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
