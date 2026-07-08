/** True for a block with nothing to merge/focus into (e.g. a divider): no run-bearing contentIds and no titleRunIds. */
export function isContentlessBlock(store, block) {
  if (!block) return false;
  const hasRuns = block.contentIds.length > 0;
  const hasTitleRuns = (block.props?.titleRunIds?.length ?? 0) > 0;
  return !hasRuns && !hasTitleRuns;
}
