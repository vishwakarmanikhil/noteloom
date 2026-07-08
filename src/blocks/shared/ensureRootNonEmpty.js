import { insertBlock } from '../../store/operations.js';
import { createTextLeafBlock } from './leafBlockFactory.js';

/**
 * Call after any operation that might have deleted the *last* block under
 * the document root. Every real editor keeps at least one empty paragraph
 * rather than allowing a genuinely blank document — a page with zero
 * children isn't just a UX dead end (nothing to click into), it also
 * breaks caret placement entirely, since there's no contentEditable region
 * left anywhere for the browser to anchor a click or keystroke in.
 *
 * No-op (returns null) if the root already has content. `store` may be a
 * plain EditorStore or a History wrapper — either way this issues its own
 * `applyOperation` call, so call it *after* whatever batch removed the
 * block, not folded into that same batch (the fallback should only ever
 * fire if the removal actually emptied the root, which isn't knowable
 * until after it's applied).
 */
export function ensureRootNonEmpty(store) {
  const rootId = store.getRootId();
  const root = store.getBlock(rootId);
  if (!root || root.contentIds.length > 0) return null;

  const { block, runs } = createTextLeafBlock('paragraph')(rootId);
  store.applyOperation(insertBlock(block, rootId, 0, { blocks: [block], runs }));
  return block.id;
}
