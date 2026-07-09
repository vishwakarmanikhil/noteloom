import { useBlockChildren } from './useBlockChildren.js';
import { useEditorStore, usePreviewMode } from './EditorProvider.jsx';
import { BlockRenderer } from './BlockRenderer.jsx';
import { BlockGutterRow } from './BlockGutterRow.jsx';

/**
 * Renders the child blocks of any container block. This is the single piece
 * of tree-walking logic shared by every container type (page, list item,
 * table row, table cell-as-container, layout column) — none of them need
 * their own child-rendering loop.
 *
 * `isTopLevel` opts into wrapping each child with the per-block hover
 * gutter (+/duplicate/move/delete/hide — see BlockGutterRow) — pass it only
 * for the ONE call site rendering the document's actual top-level blocks
 * (the page root), never for a nested container's own children: Notion/
 * TipTap/editor.js all restrict this affordance to the outermost level
 * only, and showing it for a table cell's or list item's own content would
 * be visually cramped and semantically confusing (e.g. "delete" there
 * could read as deleting the cell/item itself or just its content).
 *
 * In preview mode (see usePreviewMode), the gutter never renders at all —
 * a preview isn't something you edit — and any block whose own
 * `props.hidden` is true is skipped entirely, at every level (not just
 * top-level), rather than rendered dimmed the way edit mode shows it: the
 * whole point of "hidden" is that it disappears from what a reader
 * eventually sees.
 */
export function BlockChildren({ parentId, isTopLevel = false }) {
  const contentIds = useBlockChildren(parentId);
  const store = useEditorStore();
  const [isPreviewMode] = usePreviewMode();

  const visibleIds = isPreviewMode ? contentIds.filter((childId) => !store.getBlock(childId)?.props?.hidden) : contentIds;

  if (isTopLevel && !isPreviewMode) {
    return visibleIds.map((childId) => <BlockGutterRow key={childId} id={childId} />);
  }
  return visibleIds.map((childId) => <BlockRenderer key={childId} id={childId} />);
}
