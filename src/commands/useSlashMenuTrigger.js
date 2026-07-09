import { useCallback } from 'react';
import { useBlockRegistry, useInlineRegistry } from '../react/EditorProvider.jsx';
import { useTriggerMenu } from './useTriggerMenu.js';

// Matches a "/" at the very start of the text, or right after whitespace,
// followed by any word characters, anchored to the END of the string passed
// in — the caller passes only the text *up to the caret*, which is what
// lets "/" work with content after the cursor too ("hello /table| world"),
// not just when the caret happens to be at the very end of the run.
const SLASH_RE = /(^|\s)\/(\w*)$/;

/**
 * Watches for "/" typed anywhere inside a run within `containerRef` and
 * tracks the query typed after it — works mid-block, with other text both
 * before and after the trigger in the same run, not just when the caret is
 * at the very end of otherwise-empty content. Commands come from both the
 * block registry (insert a new block after the current one) and the
 * inline-type registry (splice an atomic element in at the cursor) — see
 * each type's own `run(store, {blockId, runId})`. Only the matched
 * "/query" substring is removed on selection (preserving whatever comes
 * before *and after* it in the run), not the whole run.
 *
 * Emoji is its own separate ":" trigger (see useEmojiMenuTrigger) — not
 * merged in here — so it doesn't crowd out every other "/" command with
 * ~60 emoji entries.
 *
 * See useTriggerMenu for the shared caret-resolution/query-matching
 * machinery this and useEmojiMenuTrigger both build on.
 */
export function useSlashMenuTrigger(containerRef) {
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();

  const getCommands = useCallback(
    () => [...registry.listSlashCommands(), ...(inlineRegistry?.listSlashCommands() ?? [])],
    [registry, inlineRegistry],
  );

  return useTriggerMenu(containerRef, SLASH_RE, getCommands);
}
