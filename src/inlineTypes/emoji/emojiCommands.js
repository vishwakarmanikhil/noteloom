import { EMOJI_LIST } from './emojiList.js';
import { insertPlainTextAtCursor } from '../shared/insertPlainText.js';

/**
 * One command per emoji, shared between however many trigger surfaces want
 * it (currently just the ":" emoji menu — see useEmojiMenuTrigger). Kept as
 * its own module, separate from emojiList.js's raw data and index.js's
 * (now-empty) inline-type registration, so it's reusable without pulling in
 * anything registry-specific.
 */
export const EMOJI_COMMANDS = EMOJI_LIST.map(({ char, name, keywords }) => ({
  label: `${char} ${name}`,
  keywords,
  run: (store, ctx) => insertPlainTextAtCursor(store, ctx, char),
}));
