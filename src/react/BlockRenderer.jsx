import { memo } from 'react';
import { useBlock } from './useBlock.js';
import { useBlockRegistry } from './EditorProvider.jsx';
import { BlockErrorBoundary } from './BlockErrorBoundary.jsx';

/**
 * Recursive entry point: given a block id, looks up its type in the
 * registry and renders that type's component. Every block component (leaf
 * or container) receives only `id` — never the whole document — and is
 * memoized here so unrelated blocks skip re-rendering when a sibling's
 * data changes elsewhere in the tree.
 */
export const BlockRenderer = memo(function BlockRenderer({ id }) {
  const block = useBlock(id);
  const registry = useBlockRegistry();

  if (!block) return null; // about to be removed this frame; render nothing

  const entry = registry.get(block.type);
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[block-editor] No block type registered for "${block.type}" (id: ${id})`);
    }
    return null;
  }

  const Component = entry.component;
  return (
    <BlockErrorBoundary>
      <Component id={id} />
    </BlockErrorBoundary>
  );
});
