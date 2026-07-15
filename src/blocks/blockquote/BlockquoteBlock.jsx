import { useCallback } from 'react';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useSelectedBlock, useBlockClassName } from '../../react/EditorProvider.jsx';
import { insertSiblingSplitAtCaretAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { mergeWithPreviousOrDelete } from '../shared/mergeCommands.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusAfterMerge } from '../shared/focusAfterMerge.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';
import { resolveBlockDir } from '../shared/resolveBlockDir.js';

/**
 * A leaf block, exactly like ParagraphBlock/HeadingBlock (contentIds are
 * its own run ids, not child blocks) — the only difference is presentation
 * (a <blockquote> tag with a left border). Enter exits the quote into a
 * plain paragraph sibling, matching heading's own convention (and Notion/
 * TipTap's actual quote behavior) — a quote is a single formatted block,
 * not a container you keep typing new lines into via Enter.
 */
export function BlockquoteBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const { setSelectedBlockId } = useSelectedBlock();

  const handleEnter = useCallback(() => {
    insertSiblingSplitAtCaretAndFocus(store, id, block?.contentIds ?? [], createTextLeafBlock('paragraph'));
  }, [store, id, block]);

  const handleBackspaceAtStart = useCallback(() => {
    const focusBlockId = mergeWithPreviousOrDelete(store, id);
    focusAfterMerge(store, focusBlockId, id, setSelectedBlockId);
  }, [store, id, setSelectedBlockId]);

  const handleArrowUp = useCallback(() => focusAdjacentBlock(store, id, 'up'), [store, id]);
  const handleArrowDown = useCallback(() => focusAdjacentBlock(store, id, 'down'), [store, id]);

  const className = useBlockClassName('be-blockquote', block);

  if (!block) return null;
  const isEmpty = isRunsEmpty(store, block.contentIds);
  const dir = resolveBlockDir(store, block);

  return (
    <blockquote
      className={className}
      data-block-id={id}
      data-empty={isEmpty ? '' : undefined}
      data-placeholder="Empty quote"
      dir={dir}
    >
      <EditableBlockContent
        blockId={id}
        runIds={block.contentIds}
        dir={dir}
        onEnter={handleEnter}
        onBackspaceAtStart={handleBackspaceAtStart}
        onArrowUp={handleArrowUp}
        onArrowDown={handleArrowDown}
      />
    </blockquote>
  );
}
