import { useCallback } from 'react';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useSelectedBlock, useBlockClassName } from '../../react/EditorProvider.jsx';
import { insertSiblingSplitAtCaretAndFocus, insertSiblingAfterAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { mergeWithPreviousOrDelete } from '../shared/mergeCommands.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusAfterMerge } from '../shared/focusAfterMerge.js';
import { focusRunEnd } from '../../react/focusRun.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';
import { resolveBlockDir } from '../shared/resolveBlockDir.js';
import { applyMarkdownShortcut } from './markdownShortcuts.js';

// Container types a nested paragraph can "exit" out of on an empty last
// line — pressing Enter on a blank final paragraph inside one of these
// creates the new paragraph as a SIBLING OF THE CONTAINER ITSELF (back out
// at the outer level), instead of yet another paragraph nested inside it.
// This is how you get out of a callout/toggle heading's body to keep
// writing in the main document — there's no other affordance for it, so
// without this an empty trailing line is a dead end.
const EXITABLE_PARENT_TYPES = new Set(['callout', 'toggleHeading']);

export function ParagraphBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const { setSelectedBlockId } = useSelectedBlock();

  const handleEnter = useCallback(() => {
    const parent = store.getBlock(block?.parentId);
    const isEmpty = isRunsEmpty(store, block?.contentIds ?? []);
    const isLastChild = Boolean(parent) && parent.contentIds[parent.contentIds.length - 1] === id;

    if (isEmpty && isLastChild && EXITABLE_PARENT_TYPES.has(parent?.type)) {
      insertSiblingAfterAndFocus(store, parent.id, createTextLeafBlock('paragraph'));
      return;
    }

    insertSiblingSplitAtCaretAndFocus(store, id, block?.contentIds ?? [], createTextLeafBlock('paragraph'));
  }, [store, id, block]);

  const handleBackspaceAtStart = useCallback(() => {
    const parent = store.getBlock(block?.parentId);
    const isEmpty = isRunsEmpty(store, block?.contentIds ?? []);
    const isSoleChild = parent?.contentIds?.length === 1 && parent.contentIds[0] === id;

    if (isEmpty && isSoleChild && parent?.type === 'toggleHeading') {
      // Pop back out to the toggle heading's own title instead of deleting
      // anything here — mirrors how a nested list item's empty Backspace
      // pops out one level at a time. Backspacing *again* from the title
      // (now that focus is there) is what actually removes an entirely
      // blank toggle heading, via mergeToggleHeadingOrNoop — this is the
      // first of those two steps, not a dead end.
      const titleRunIds = parent.props?.titleRunIds ?? [];
      const lastTitleRunId = titleRunIds[titleRunIds.length - 1];
      if (lastTitleRunId) focusRunEnd(lastTitleRunId);
      return;
    }

    const focusBlockId = mergeWithPreviousOrDelete(store, id);
    focusAfterMerge(store, focusBlockId, id, setSelectedBlockId);
  }, [store, id, block, setSelectedBlockId]);

  const handleArrowUp = useCallback(() => focusAdjacentBlock(store, id, 'up'), [store, id]);
  const handleArrowDown = useCallback(() => focusAdjacentBlock(store, id, 'down'), [store, id]);

  const handleAutoformat = useCallback((runs) => applyMarkdownShortcut(store, id, runs), [store, id]);
  const className = useBlockClassName('be-paragraph', block);

  if (!block) return null;
  const isEmpty = isRunsEmpty(store, block.contentIds);
  const dir = resolveBlockDir(store, block);

  return (
    <div
      className={className}
      data-block-id={id}
      data-empty={isEmpty ? '' : undefined}
      data-placeholder="Type '/' for commands"
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
        onAutoformat={handleAutoformat}
      />
    </div>
  );
}
