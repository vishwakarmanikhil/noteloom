import { selectInlineType } from './select/index.js';
import { dateInlineType } from './date/index.js';
import { checkboxInlineType } from './checkbox/index.js';
import { tableSelectInlineType } from './tableSelect/index.js';
import { emojiInlineType } from './emoji/index.js';

/**
 * Registers every built-in inline type on the given inline registry. Not
 * on this list: "mention"-style @-someone chips — those are now just an
 * ordinary use of createSelectFieldType with `triggers: ['slash', 'at']`
 * (see the example app's "Assignee" field type), rather than a separate
 * hardcoded built-in, since a real app's roster/search always needs to be
 * host-supplied anyway.
 */
export function registerBuiltInInlineTypes(inlineRegistry) {
  inlineRegistry.register('select', selectInlineType);
  inlineRegistry.register('date', dateInlineType);
  inlineRegistry.register('checkbox', checkboxInlineType);
  inlineRegistry.register('tableSelect', tableSelectInlineType);
  inlineRegistry.register('emoji', emojiInlineType);
}
