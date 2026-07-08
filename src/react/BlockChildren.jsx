import { useBlockChildren } from './useBlockChildren.js';
import { BlockRenderer } from './BlockRenderer.jsx';

/**
 * Renders the child blocks of any container block. This is the single piece
 * of tree-walking logic shared by every container type (page, list item,
 * table row, table cell-as-container, layout column) — none of them need
 * their own child-rendering loop.
 */
export function BlockChildren({ parentId }) {
  const contentIds = useBlockChildren(parentId);
  return contentIds.map((childId) => <BlockRenderer key={childId} id={childId} />);
}
