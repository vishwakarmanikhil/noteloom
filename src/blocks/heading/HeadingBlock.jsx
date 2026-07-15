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

  // A level-specific class (be-heading-1/2/3) alongside the shared
  // be-heading one — lets a host style/override each heading level
  // independently (font-size, etc.) via a real class instead of having to
  // rely on h1/h2/h3 tag-selector specificity tricks, and gives
  // getBlockClassName's own extra string a distinct per-level hook too.
  const level = block?.props?.level ?? 3;
  const className = useBlockClassName(`be-heading be-heading-${level}`, block);

  if (!block) return null;
  const Tag = `h${level}`;
  const isEmpty = isRunsEmpty(store, block.contentIds);
  const dir = resolveBlockDir(store, block);

  return (
    <Tag
      className={className}
      data-block-id={id}
      data-empty={isEmpty ? '' : undefined}
      data-placeholder={`Heading ${level}`}
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
    </Tag>
  );
}
