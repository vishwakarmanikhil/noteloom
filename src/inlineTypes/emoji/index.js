import { EMOJI_LIST } from './emojiList.js';
import { insertPlainTextAtCursor } from '../shared/insertPlainText.js';

/**
 * Not an atomic run type at all — an emoji is inserted as plain text (the
 * literal unicode character), exactly as selectable/deletable/editable as
 * anything else typed there, not a persistent chip. So there's no
 * `component`/`toHTML`/`fromHTML` here (nothing ever needs to render or
 * serialize an "emoji run" specially — it's just a text run once inserted);
 * this entry exists purely to contribute its `slashCommands`. Works equally
 * well on an empty line (inserts as that line's only content) or mid-text.
 *
 * One command per emoji (not one generic "Emoji" command that then opens
 * its own picker UI) reuses the existing slash-menu's search-by-keyword
 * matching for free: typing "/fire" jumps straight to 🔥, and typing
 * "/emoji" lists all of them, since every entry shares that keyword.
 */
export const emojiInlineType = {
  slashCommands: EMOJI_LIST.map(({ char, name, keywords }) => ({
    label: `${char} ${name}`,
    keywords: ['emoji', ...keywords],
    run: (store, ctx) => insertPlainTextAtCursor(store, ctx, char),
  })),
};
