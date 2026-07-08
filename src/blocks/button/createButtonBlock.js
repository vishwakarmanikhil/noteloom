import { genId } from '../../utils/idGen.js';

/**
 * factory(parentId, initialRuns?) -> {block, runs} for a button — a plain
 * leaf (contentIds are its own run ids, exactly like paragraph/heading),
 * plus a `href` prop. Not in MERGEABLE_TEXT_TYPES (see mergeCommands.js):
 * concatenating a button's label into a preceding paragraph would silently
 * drop its href, so it's excluded the same way table/listItem/callout are.
 */
export function createButtonBlock({ href = '', label = 'Button', color = '', customAttrs = [] } = {}) {
  return function factory(parentId, initialRuns) {
    const blockId = genId();
    const runs = initialRuns?.length ? initialRuns : [{ id: genId(), type: 'text', value: label, marks: {} }];
    return {
      block: { id: blockId, type: 'button', parentId, contentIds: runs.map((r) => r.id), props: { href, color, customAttrs } },
      runs,
    };
  };
}
