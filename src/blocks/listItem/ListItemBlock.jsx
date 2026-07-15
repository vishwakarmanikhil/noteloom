import { useCallback } from 'react';
import { useBlock } from '../../react/useBlock.js';
import { useBlockChildren } from '../../react/useBlockChildren.js';
import { EditableBlockContent } from '../../react/EditableBlockContent.jsx';
import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useEditorStore, useSelectedBlock, useBlockClassName } from '../../react/EditorProvider.jsx';
import { listItemDepth, orderedItemIndex, orderedMarkerText, bulletMarkerText } from './listMarkers.js';
import { ChevronRightIcon, ChevronDownIcon } from '../../react/icons.jsx';
import { insertSiblingSplitAtCaretAndFocus, insertFirstChildSplitAtCaretAndFocus } from '../shared/blockCommands.js';
import { createListItemBlock } from './createListItemBlock.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { indentListItem, outdentListItem } from './indentCommands.js';
import { mergeListItemOrOutdent, isBlankTitle } from './mergeCommands.js';
import { exitListItemToParagraph } from './exitListItem.js';
import { isRunsEmpty } from '../shared/blockEmpty.js';
import { focusAfterMerge } from '../shared/focusAfterMerge.js';
import { updateBlockProps, insertBlock } from '../../store/operations.js';
import { focusAdjacentBlock } from '../shared/navigationCommands.js';
import { resolveBlockDir } from '../shared/resolveBlockDir.js';
import { focusRunEnd } from '../../react/focusRun.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

/**
 * Indentation/nesting is modeled the same way as every other container
 * block (parentId + contentIds referencing child block ids) — a list item's
 * own text lives in props.titleRunIds (run ids) rather than contentIds,
 * since a list item needs both an inline title *and* nested child blocks at
 * once, unlike a pure leaf (paragraph/heading) or pure container (page).
 *
 * When `props.checked` is not undefined, this doubles as a to-do item: the
 * marker becomes a checkbox instead of a bullet/number.
 */
export function ListItemBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  const { setSelectedBlockId } = useSelectedBlock();
  // Subscribed purely so this item re-renders when a SIBLING is inserted,
  // removed, or reordered at this level — needed to keep its own marker
  // (numbered position, or depth-based bullet/number style) correct, since
  // BlockRenderer's memo would otherwise skip re-rendering this item on a
  // sibling-only structural change (its own block data didn't change).
  // Cheap and scoped to exactly this list level, unlike the parent
  // (BlockChildren) re-rendering, which is unaffected either way.
  const siblingIds = useBlockChildren(block?.parentId);

  const handleEnter = useCallback(() => {
    // Enter on an empty item that's nested under another list item pops it
    // out one level instead of creating yet another empty nested item —
    // this is how the caret "comes out" of a list, matching every other
    // list-editor's convention (Notion, Workflowy, Word, etc.).
    const titleRunIds = block?.props?.titleRunIds ?? [];
    const parent = store.getBlock(block?.parentId);
    const empty = isBlankTitle(store, titleRunIds);

    if (empty && parent?.type === 'listItem') {
      outdentListItem(store, id); // refocuses itself (reparenting remounts the DOM)
      return;
    }

    // Enter on an empty, top-level, childless item exits the list
    // altogether (becomes a paragraph) — matches the same convention every
    // other list editor uses for "Enter on the last empty bullet".
    const hasNestedChildren = (block?.contentIds?.length ?? 0) > 0;
    if (empty && parent?.type !== 'listItem' && !hasNestedChildren) {
      exitListItemToParagraph(store, id);
      return;
    }

    const isTodo = block?.props?.checked !== undefined;
    const isToggle = block?.props?.collapsed !== undefined;
    const factory = createListItemBlock({
      ordered: block?.props?.ordered,
      checked: isTodo ? false : undefined,
      collapsed: isToggle ? false : undefined,
    });

    // If this item already has nested children, the new item belongs at
    // the SAME indent level as those children, positioned before them —
    // not as this item's own sibling, which would render below the entire
    // nested list instead of right after the line the caret is on. This
    // does NOT apply to a toggle: its contentIds are the collapsible body,
    // not "the next line of a continued list" — Enter on a toggle's own
    // title always creates a new sibling toggle at the same level,
    // matching Notion (Tab is the only way to nest something under it).
    if (hasNestedChildren && !isToggle) {
      insertFirstChildSplitAtCaretAndFocus(store, id, titleRunIds, factory);
    } else {
      insertSiblingSplitAtCaretAndFocus(store, id, titleRunIds, factory);
    }
  }, [store, id, block]);

  const handleTab = useCallback(() => indentListItem(store, id), [store, id]);
  const handleShiftTab = useCallback(() => outdentListItem(store, id), [store, id]);

  const handleBackspaceAtStart = useCallback(() => {
    const result = mergeListItemOrOutdent(store, id);
    if (!result || !result.needsRefocus) return; // no-op, or stayed in place with no remount
    focusAfterMerge(store, result.focusBlockId, id, setSelectedBlockId);
  }, [store, id, setSelectedBlockId]);

  const handleArrowUp = useCallback(() => focusAdjacentBlock(store, id, 'up'), [store, id]);
  const handleArrowDown = useCallback(() => focusAdjacentBlock(store, id, 'down'), [store, id]);

  const toggleChecked = useCallback(() => {
    store.applyOperation(updateBlockProps(id, { checked: !block?.props?.checked }));
  }, [store, id, block?.props?.checked]);

  const toggleCollapsed = useCallback(() => {
    const hasChildren = (block?.contentIds?.length ?? 0) > 0;
    if (!hasChildren) {
      // A childless toggle has nothing to expand/collapse yet — this was
      // previously a disabled dead end (no way to ever get content into a
      // toggle that didn't happen to be seeded with a child already, e.g.
      // one created before the seeding in createListItemBlock existed, or
      // one whose only child was removed by some other action). Clicking
      // now bootstraps the first (empty) child and expands, the same
      // seeded shape callout/toggleHeading start with.
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

  const className = useBlockClassName('be-list-item', block);

  if (!block) return null;
  const { ordered, checked, collapsed, titleRunIds = [] } = block.props;
  const isTodo = checked !== undefined;
  const isToggle = !isTodo && collapsed !== undefined;
  const hasNestedChildren = block.contentIds.length > 0;
  // Best-effort accessible name for the checkbox: a native checkbox with no
  // name reads to a screen reader as just "checkbox, checked/not checked",
  // with no indication of *which* to-do it's for. Atomic (non-text) runs
  // contribute nothing here — this is a plain-text summary, not a full
  // serialization.
  const titleText = titleRunIds
    .map((runId) => store.getRun(runId))
    .filter((run) => run?.type === 'text')
    .map((run) => run.value)
    .join('')
    .trim();
  const dir = resolveBlockDir(store, block);

  return (
    <div className={className} data-block-id={id} dir={dir}>
      <div className="be-list-item-row">
        {isTodo ? (
          <input
            type="checkbox"
            className="be-list-checkbox"
            checked={Boolean(checked)}
            onChange={toggleChecked}
            aria-label={titleText || 'To-do item'}
          />
        ) : isToggle ? (
          // A real button (not decorative, unlike the plain bullet/number
          // marker below): it's the only way to reveal/hide this item's
          // children, so assistive tech needs to know it's interactive and
          // what state it's in.
          <button
            type="button"
            className="be-list-toggle-marker"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={!hasNestedChildren ? 'Add content to toggle' : collapsed ? 'Expand toggle' : 'Collapse toggle'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </button>
        ) : (
          // Decorative: list structure/position is conveyed by the DOM
          // order itself, not by this glyph, so it's hidden from assistive
          // tech. The glyph itself cycles with nesting depth (1,2,3 ->
          // a,b,c -> i,ii,iii for numbered; disc -> circle -> square for
          // bulleted, repeating every 3 levels), matching Notion/Word's
          // convention — see listMarkers.js.
          <span className="be-list-marker" aria-hidden="true">
            {ordered
              ? orderedMarkerText(listItemDepth(store, block), orderedItemIndex(store, block, siblingIds))
              : bulletMarkerText(listItemDepth(store, block))}
          </span>
        )}
        <div
          className="be-list-item-title"
          data-empty={isRunsEmpty(store, titleRunIds) ? '' : undefined}
          data-placeholder={isTodo ? 'To-do' : isToggle ? 'Toggle' : 'List item'}
          style={checked ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
        >
          <EditableBlockContent
            blockId={id}
            runIds={titleRunIds}
            dir={dir}
            onEnter={handleEnter}
            onTab={handleTab}
            onShiftTab={handleShiftTab}
            onBackspaceAtStart={handleBackspaceAtStart}
            onArrowUp={handleArrowUp}
            onArrowDown={handleArrowDown}
          />
        </div>
      </div>
      {/*
        A toggle's children stay in the store (contentIds unchanged) while
        collapsed — only the DOM for them is skipped. Copy/cut/paste,
        select-all, and serialization all walk contentIds directly and have
        no notion of "collapsed" at all, so a collapsed toggle's hidden
        content still copies/serializes/undoes correctly for free; this is
        the only place collapsed state has any effect.
      */}
      {(!isToggle || !collapsed) && (
        <div className="be-list-item-children">
          <BlockChildren parentId={id} />
        </div>
      )}
    </div>
  );
}
