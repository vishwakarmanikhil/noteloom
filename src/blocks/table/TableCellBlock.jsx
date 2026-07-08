import { useCallback } from 'react';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useEditorStore } from '../../react/EditorProvider.jsx';
import { moveToAdjacentCell } from './tableNavigation.js';

// Deliberately near-identical to ParagraphBlock: a cell is a leaf block
// whose contentIds are run ids, exactly like a paragraph — it gets
// formatting/selection/serialization for free from the same run machinery.
//
// No Backspace-at-start handling: a cell merging into an adjacent cell has
// no sensible meaning (no "merge cells" in v1), so native no-op is already
// correct default behavior — not an omission.
export function TableCellBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);

  const handleTab = useCallback(() => moveToAdjacentCell(store, id, 'right'), [store, id]);
  const handleShiftTab = useCallback(() => moveToAdjacentCell(store, id, 'left'), [store, id]);
  const handleArrowUp = useCallback(() => moveToAdjacentCell(store, id, 'up'), [store, id]);
  const handleArrowDown = useCallback(() => moveToAdjacentCell(store, id, 'down'), [store, id]);
  // Enter moves down a row (spreadsheet-familiar), matching Tab's row-wrap convention.
  const handleEnter = useCallback(() => moveToAdjacentCell(store, id, 'down'), [store, id]);

  if (!block) return null;

  return (
    <td className="be-table-cell" data-block-id={id}>
      <EditableBlockContent
        blockId={id}
        runIds={block.contentIds}
        onTab={handleTab}
        onShiftTab={handleShiftTab}
        onArrowUp={handleArrowUp}
        onArrowDown={handleArrowDown}
        onEnter={handleEnter}
      />
    </td>
  );
}
