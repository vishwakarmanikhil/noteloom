/**
 * Not an atomic run type at all — an emoji is inserted as plain text (the
 * literal unicode character), exactly as selectable/deletable/editable as
 * anything else typed there, not a persistent chip. So there's no
 * `component`/`toHTML`/`fromHTML`/`slashCommands` here — emoji has its own
 * dedicated ":" trigger (see useEmojiMenuTrigger + emojiCommands.js)
 * instead of contributing to the shared "/" slash-command list, so this
 * entry is registered only for consistency/discoverability (host code that
 * enumerates `inlineRegistry` sees an 'emoji' entry) even though it
 * currently does nothing on its own.
 */
export const emojiInlineType = {};
