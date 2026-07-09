import { useTriggerMenu } from './useTriggerMenu.js';
import { EMOJI_COMMANDS } from '../inlineTypes/emoji/emojiCommands.js';

// Matches a ":" at the very start of the text, or right after whitespace,
// followed by any word characters — same shape as the slash trigger, just a
// different character, so ":fire" narrows to 🔥 without colliding with "/"
// commands typed in the same run.
const EMOJI_RE = /(^|\s):(\w*)$/;

const getEmojiCommands = () => EMOJI_COMMANDS;

/**
 * Watches for ":" typed anywhere inside a run within `containerRef` and
 * tracks the query typed after it, resolving against the built-in emoji
 * list — its own dedicated trigger, deliberately separate from "/" (see
 * useSlashMenuTrigger's doc comment), so emoji don't crowd out every other
 * slash command. Render the SAME `SlashMenu` component against this hook's
 * return value (it's a generic filterable command popover, not slash-
 * specific) — pass distinct `menuId`/`ariaLabel` props so the two popovers
 * (this one and the "/" one) never collide if both happen to be mounted at
 * once.
 */
export function useEmojiMenuTrigger(containerRef) {
  return useTriggerMenu(containerRef, EMOJI_RE, getEmojiCommands);
}
