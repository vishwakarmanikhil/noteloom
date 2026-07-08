/**
 * True when `run` contributes no real content: absent, or a text run whose
 * value is ''. An atomic (non-text) run — a date/select/checkbox/mention
 * chip — is never blank even without a "value", since there's a real chip
 * sitting there for the user to see/interact with.
 */
export function isRunBlank(run) {
  if (!run) return true;
  if (run.type !== 'text') return false;
  return (run.value ?? '') === '';
}

/**
 * True when every run in `runIds` is blank — used to decide whether to show
 * a placeholder hint (e.g. "Type '/' for commands") for a block that has
 * nothing in it yet. Same semantics as isCurrentBlockEmpty in
 * react/selectAllCommand.js (which needs a live caret to find the block
 * first); this version just takes run ids directly, since callers here
 * already have the block in hand from useBlock.
 */
export function isRunsEmpty(store, runIds) {
  if (!runIds || runIds.length === 0) return true;
  return runIds.every((id) => isRunBlank(store.getRun(id)));
}
