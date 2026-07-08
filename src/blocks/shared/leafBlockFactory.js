import { genId } from '../../utils/idGen.js';

/**
 * Builds a factory(parentId, initialRuns?) -> {block, runs} for a text leaf
 * block. Most callers (slash commands) omit `initialRuns` and get a single
 * blank run; Enter-to-split passes the runs that landed after the caret so
 * the new block starts with that text instead of empty.
 */
export function createTextLeafBlock(type, props = {}) {
  return function factory(parentId, initialRuns) {
    const blockId = genId();
    const runs = initialRuns?.length ? initialRuns : [{ id: genId(), type: 'text', value: '', marks: {} }];
    return {
      block: { id: blockId, type, parentId, contentIds: runs.map((r) => r.id), props },
      runs,
    };
  };
}
