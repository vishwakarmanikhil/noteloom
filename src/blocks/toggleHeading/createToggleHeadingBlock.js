import { genId } from '../../utils/idGen.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';

/**
 * factory(parentId, initialRuns?) -> {block, runs, subtreeBlocks} for a
 * toggle heading — its own text lives in props.titleRunIds (same
 * title+children split as listItem), while contentIds holds the section's
 * nested content, rendered only while props.collapsed is false. Seeded
 * with one empty paragraph child (same convention as callout/layout's
 * columns) so there's always at least one place to type into right away —
 * critical here specifically, since Enter on the title only ever inserts a
 * *first child* when the toggle heading already has children (see
 * ToggleHeadingBlock's handleEnter); without a seeded child, there'd be no
 * way to get content under a brand-new toggle heading at all.
 */
export function createToggleHeadingBlock({ level = 2, collapsed = false } = {}) {
  return function factory(parentId, initialRuns) {
    const blockId = genId();
    const runs = initialRuns?.length ? initialRuns : [{ id: genId(), type: 'text', value: '', marks: {} }];
    const { block: childBlock, runs: childRuns } = createTextLeafBlock('paragraph')(blockId);
    return {
      block: {
        id: blockId,
        type: 'toggleHeading',
        parentId,
        contentIds: [childBlock.id],
        props: { level, collapsed, titleRunIds: runs.map((r) => r.id) },
      },
      runs: [...runs, ...childRuns],
      subtreeBlocks: [childBlock],
    };
  };
}
