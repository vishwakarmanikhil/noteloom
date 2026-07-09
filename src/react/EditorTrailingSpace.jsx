import { useCallback } from 'react';
import { useEditorStore, usePreviewMode } from './EditorProvider.jsx';
import { insertSiblingAfterAndFocus } from '../blocks/shared/blockCommands.js';
import { createTextLeafBlock } from '../blocks/shared/leafBlockFactory.js';
import { focusBlockEnd } from '../blocks/shared/navigationCommands.js';
import { ensureRootNonEmpty } from '../blocks/shared/ensureRootNonEmpty.js';

/**
 * Matches every real editor's "click below the last block to keep writing"
 * affordance (Notion, Google Docs, ...): a plain clickable strip below the
 * document's own content, sized so there's always somewhere to click even
 * when the last block fills the viewport. If the last top-level block is
 * already a paragraph, clicking here just moves the caret to its end —
 * clicking below your own last paragraph shouldn't create a new empty one
 * under it. For anything else (a heading, list, table, embed, ...), there's
 * nothing to place a text caret in at that position, so a fresh paragraph
 * is inserted after it and focused instead.
 *
 * A no-op in preview mode (see usePreviewMode) — a preview isn't something
 * you edit, so clicking below its content shouldn't create a new block.
 */
export function EditorTrailingSpace({ minHeight = 180, className = 'be-trailing-space' }) {
  const store = useEditorStore();
  const [isPreviewMode] = usePreviewMode();

  const handleClick = useCallback(() => {
    if (isPreviewMode) return;
    const rootId = store.getRootId();
    const root = store.getBlock(rootId);
    const lastId = root?.contentIds?.[root.contentIds.length - 1];

    if (!lastId) {
      const fallbackId = ensureRootNonEmpty(store);
      if (fallbackId) focusBlockEnd(store, fallbackId);
      return;
    }

    const lastBlock = store.getBlock(lastId);
    if (lastBlock?.type === 'paragraph') {
      focusBlockEnd(store, lastId);
    } else {
      insertSiblingAfterAndFocus(store, lastId, createTextLeafBlock('paragraph'));
    }
  }, [store, isPreviewMode]);

  return <div className={className} style={{ minHeight }} onClick={handleClick} />;
}
