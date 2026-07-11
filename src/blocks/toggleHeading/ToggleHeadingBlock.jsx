import { useCallback } from 'react';
import { useBlock } from '../../react/useBlock.js';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useEditorStore, useSelectedBlock, useBlockClassName } from '../../react/EditorProvider.jsx';
import { insertSiblingSplitAtCaretAndFocus, insertFirstChildSplitAtCaretAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { mergeToggleHeadingOrNoop } from './mergeCommands.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusAfterMerge } from '../shared/focusAfterMerge.js';
import { updateBlockProps, insertBlock } from '../../store/operations.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';
import { focusRunEnd } from '../../react/focusRun.js';
import { ChevronRightIcon, ChevronDownIcon } from '../../react/icons.jsx';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * A heading whose section can be collapsed — same title+children split as
 * ListItemBlock (own text in props.titleRunIds, nested content in
 * contentIds), so collapsing is a purely local re-render (this component
 * conditionally skips <BlockChildren>) rather than needing any sibling-
 * range computation. Deliberately a distinct block type from `heading`
 * (not a retrofit) to avoid touching that type's existing leaf shape
 * (contentIds = its own runs) — heading is used throughout the merge/
 * split/serialize code as a plain leaf, and changing that shape would
 * ripple into all of it.
 */
export function ToggleHeadingBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const { setSelectedBlockId } = useSelectedBlock();

  const handleEnter = useCallback(() => {
    const titleRunIds = block?.props?.titleRunIds ?? [];
    const hasNestedChildren = (block?.contentIds?.length ?? 0) > 0;
    const factory = createTextLeafBlock('paragraph');
    if (hasNestedChildren) {
      insertFirstChildSplitAtCaretAndFocus(store, id, titleRunIds, factory);
    } else {
      insertSiblingSplitAtCaretAndFocus(store, id, titleRunIds, factory);
    }
  }, [store, id, block]);

  const handleBackspaceAtStart = useCallback(() => {
    const result = mergeToggleHeadingOrNoop(store, id);
    if (!result || !result.needsRefocus) return;
    focusAfterMerge(store, result.focusBlockId, id, setSelectedBlockId);
  }, [store, id, setSelectedBlockId]);

  const handleArrowUp = useCallback(() => focusAdjacentBlock(store, id, 'up'), [store, id]);
  const handleArrowDown = useCallback(() => focusAdjacentBlock(store, id, 'down'), [store, id]);

  const toggleCollapsed = useCallback(() => {
    const hasChildren = (block?.contentIds?.length ?? 0) > 0;
    if (!hasChildren) {
      // A childless toggle heading has nothing to expand/collapse yet —
      // this was previously a disabled dead end. Clicking now bootstraps
      // the first (empty) child and expands, same fix as the toggle list
      // item's own marker.
      const { block: childBlock, runs } = createTextLeafBlock('paragraph')(id);
      applyOps(store, [
        insertBlock(childBlock, id, 0, { blocks: [childBlock], runs }),
        updateBlockProps(id, { collapsed: false }),
      ]);
      focusRunEnd(childBlock.contentIds[0]);
      return;
    }
    store.applyOperation(updateBlockProps(id, { collapsed: !block?.props?.collapsed }));
  }, [store, id, block?.contentIds, block?.props?.collapsed]);

  const className = useBlockClassName('be-toggle-heading', block);

  if (!block) return null;
  const { level = 2, collapsed, titleRunIds = [] } = block.props;
  const hasNestedChildren = block.contentIds.length > 0;
  const Tag = `h${level}`;

  return (
    <div className={className} data-block-id={id}>
      <div className="be-toggle-heading-row">
        <button
          type="button"
          className="be-toggle-heading-marker"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={!hasNestedChildren ? 'Add content to section' : collapsed ? 'Expand section' : 'Collapse section'}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </button>
        <Tag
          className={`be-heading be-heading-${level} be-toggle-heading-title`}
          data-empty={isRunsEmpty(store, titleRunIds) ? '' : undefined}
          data-placeholder={`Toggle heading ${level}`}
        >
          <EditableBlockContent
            blockId={id}
            runIds={titleRunIds}
            onEnter={handleEnter}
            onBackspaceAtStart={handleBackspaceAtStart}
            onArrowUp={handleArrowUp}
            onArrowDown={handleArrowDown}
          />
        </Tag>
      </div>
      {!collapsed && (
        <div className="be-toggle-heading-children">
          <BlockChildren parentId={id} />
        </div>
      )}
    </div>
  );
}
