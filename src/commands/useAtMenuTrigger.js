import { useCallback } from 'react';
import { useInlineRegistry } from '../react/EditorProvider.jsx';
import { useTriggerMenu } from './useTriggerMenu.js';

// Same shape as SLASH_RE/EMOJI_RE (see useSlashMenuTrigger/useEmojiMenuTrigger)
// with "@" as the trigger character instead.
const AT_RE = /(^|\s)@(\w*)$/;

/**
 * Watches for "@" typed anywhere inside a run within `containerRef` and
 * tracks the query typed after it, resolving against every inline type
 * that opted into `atCommand`/`atCommands` (see InlineRegistry's doc
 * comment) — its own dedicated trigger, deliberately separate from "/"
 * (same rationale as useEmojiMenuTrigger's own ":" trigger: doesn't crowd
 * out every other slash command, and "@" carries its own well-understood
 * meaning elsewhere that "/" doesn't).
 *
 * Not every inline type shows up here — only ones that asked to (e.g. a
 * host-defined "Assignee" field type registered with
 * `createSelectFieldType({ ..., triggers: ['slash', 'at'] })`). A generic
 * "Priority"/"Status" dropdown, for instance, would usually stay slash-only
 * since "@Priority" doesn't read naturally the way "@Assignee" does.
 *
 * Render the SAME `SlashMenu` component against this hook's return value
 * (it's a generic filterable command popover, not slash-specific) — pass a
 * distinct `menuId`/`ariaLabel`, same as the emoji menu, so the popovers
 * never collide if more than one happens to be mounted at once.
 */
export function useAtMenuTrigger(containerRef) {
  const inlineRegistry = useInlineRegistry();
  const getAtCommands = useCallback(() => inlineRegistry?.listAtCommands() ?? [], [inlineRegistry]);
  return useTriggerMenu(containerRef, AT_RE, getAtCommands);
}
