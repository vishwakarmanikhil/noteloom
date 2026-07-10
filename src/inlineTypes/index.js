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
  registerInlineTypes(inlineRegistry, {
    select: selectInlineType,
    date: dateInlineType,
    checkbox: checkboxInlineType,
    ...TABLE_SELECT_INLINE_TYPES,
    emoji: emojiInlineType,
  });
}

/** Opt-in counterpart to `registerBuiltInInlineTypes` — see registerBlocks's own doc comment, same idea for inline types. */
export function registerInlineTypes(inlineRegistry, typesByType) {
  for (const [type, entry] of Object.entries(typesByType)) {
    inlineRegistry.register(type, entry);
  }
}

/** Only relevant alongside TABLE_BLOCKS (see blocks/index.js) — powers a table column set to "select" type. */
export const TABLE_SELECT_INLINE_TYPES = { tableSelect: tableSelectInlineType };

export { selectInlineType, dateInlineType, checkboxInlineType, tableSelectInlineType, emojiInlineType };
