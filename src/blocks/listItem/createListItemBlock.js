import { genId } from '../../utils/idGen.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

/**
 * factory(parentId, initialRuns?) -> {block, runs, subtreeBlocks} for a
 * list item. `checked` left undefined (default) renders a bullet/number
 * marker; passing a boolean turns it into a to-do item with a checkbox
 * marker. `collapsed` left undefined (default) is the same plain bullet/
 * number/todo marker; passing a boolean turns it into a "toggle" item
 * instead — a disclosure triangle marker whose nested children (contentIds)
 * render only while `collapsed` is false. `checked` and `collapsed` are
 * mutually exclusive markers in the UI (whichever is set decides which
 * marker renders; see ListItemBlock) — passing both is not a supported
 * combination, matches Notion's own "one marker style per item".
 * `initialRuns`, when given (Enter-to-split), seeds the title with the runs
 * that landed after the caret instead of a single blank run.
 *
 * A toggle is seeded with one empty paragraph child right away (same
 * convention as callout/toggleHeading) — without this, a toggle created
 * with no children at all has nothing to expand: its own disclosure
 * marker has nothing to reveal, and there was no other way to get content
 * into it (this was a real dead end for exactly this reason before the
 * seeding was added).
 */
export function createListItemBlock({ ordered = false, checked, collapsed } = {}) {
  return function factory(parentId, initialRuns) {
    const blockId = genId();
    const runs = initialRuns?.length ? initialRuns : [{ id: genId(), type: 'text', value: '', marks: {} }];
    const props = { ordered, titleRunIds: runs.map((r) => r.id) };
    if (checked !== undefined) props.checked = checked;

    let contentIds = [];
    let subtreeBlocks = [];
    let allRuns = runs;
    if (collapsed !== undefined) {
      props.collapsed = collapsed;
      const { block: childBlock, runs: childRuns } = createTextLeafBlock('paragraph')(blockId);
      contentIds = [childBlock.id];
      subtreeBlocks = [childBlock];
      allRuns = [...runs, ...childRuns];
    }

    return {
      block: { id: blockId, type: 'listItem', parentId, contentIds, props },
      runs: allRuns,
      subtreeBlocks,
    };
  };
}
