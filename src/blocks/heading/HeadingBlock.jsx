import { useCallback } from 'react';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore, useSelectedBlock } from '../../react/EditorProvider.jsx';
import { insertSiblingSplitAtCaretAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { mergeWithPreviousOrDelete } from '../shared/mergeCommands.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusAfterMerge } from '../shared/focusAfterMerge.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';

export function HeadingBlock({ id }) {
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

  if (!block) return null;
  const level = block.props?.level ?? 3;
  const Tag = `h${level}`;
  const isEmpty = isRunsEmpty(store, block.contentIds);

  return (
    <Tag
      className="be-heading"
      data-block-id={id}
      data-empty={isEmpty ? '' : undefined}
      data-placeholder={`Heading ${level}`}
    >
      <EditableBlockContent
        blockId={id}
        runIds={block.contentIds}
        onEnter={handleEnter}
        onBackspaceAtStart={handleBackspaceAtStart}
        onArrowUp={handleArrowUp}
        onArrowDown={handleArrowDown}
      />
    </Tag>
  );
}
