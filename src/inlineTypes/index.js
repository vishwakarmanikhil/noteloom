import { selectInlineType } from './select/index.js';
import { dateInlineType } from './date/index.js';
import { mentionInlineType } from './mention/index.js';
import { checkboxInlineType } from './checkbox/index.js';
import { tableSelectInlineType } from './tableSelect/index.js';
import { emojiInlineType } from './emoji/index.js';

/** Registers every built-in inline type on the given inline registry. */
export function registerBuiltInInlineTypes(inlineRegistry) {
  inlineRegistry.register('select', selectInlineType);
  inlineRegistry.register('date', dateInlineType);
  inlineRegistry.register('mention', mentionInlineType);
  inlineRegistry.register('checkbox', checkboxInlineType);
  inlineRegistry.register('tableSelect', tableSelectInlineType);
  inlineRegistry.register('emoji', emojiInlineType);
}
