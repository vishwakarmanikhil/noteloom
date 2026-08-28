// noteloom/starter-kit — the built-in block + inline set as an `extensions`
// array, so `useEditor({ extensions: [...starterKit(), myBlock] })` is the
// recommended way to say "the usual editor, plus my own thing". Calling
// `useEditor()` with no args still registers exactly this same set.
//
// Also re-exported from the main `noteloom` entry.

import { defineBlock, defineInline } from './registry/define.js';

// Re-exported so the whole extension-authoring workflow is one import.
export {
  defineBlock,
  defineInline,
  defineExtension,
  registerExtensions,
} from './registry/define.js';
import {
  paragraphBlockType,
  headingBlockType,
  listItemBlockType,
  tableBlockType,
  tableRowBlockType,
  tableCellBlockType,
  layoutBlockType,
  layoutColumnBlockType,
  dividerBlockType,
  calloutBlockType,
  blockquoteBlockType,
  codeBlockType,
  toggleHeadingBlockType,
  buttonBlockType,
  embedBlockType,
  canvasBlockType,
} from './blocks/index.js';
import {
  selectInlineType,
  dateInlineType,
  checkboxInlineType,
  tableSelectInlineType,
  emojiInlineType,
} from './inlineTypes/index.js';

const BUILT_IN_BLOCKS = {
  paragraph: paragraphBlockType,
  heading: headingBlockType,
  listItem: listItemBlockType,
  table: tableBlockType,
  tableRow: tableRowBlockType,
  tableCell: tableCellBlockType,
  layout: layoutBlockType,
  layoutColumn: layoutColumnBlockType,
  divider: dividerBlockType,
  callout: calloutBlockType,
  blockquote: blockquoteBlockType,
  code: codeBlockType,
  toggleHeading: toggleHeadingBlockType,
  button: buttonBlockType,
  embed: embedBlockType,
  canvas: canvasBlockType,
};

const BUILT_IN_INLINE_TYPES = {
  select: selectInlineType,
  date: dateInlineType,
  checkbox: checkboxInlineType,
  tableSelect: tableSelectInlineType,
};

// `emoji` is a marker-only entry (no component — an emoji is inserted as
// literal text via its own ":" trigger; the registry entry exists purely so
// host code enumerating the inline registry sees it). defineInline() requires
// a real component, so this one is assembled directly.
const emojiDefinition = { ...emojiInlineType, name: 'emoji', kind: 'inline' };

/**
 * Returns a fresh array of `defineBlock()` / `defineInline()` results for every
 * built-in type. `exclude` drops types by name — `starterKit({ exclude:
 * ['canvas'] })` for the usual editor minus the heavy drawing block.
 */
export function starterKit({ exclude = [] } = {}) {
  const drop = new Set(exclude);
  return [
    ...Object.entries(BUILT_IN_BLOCKS)
      .filter(([name]) => !drop.has(name))
      .map(([name, entry]) => defineBlock({ name, ...entry })),
    ...Object.entries(BUILT_IN_INLINE_TYPES)
      .filter(([name]) => !drop.has(name))
      .map(([name, entry]) => defineInline({ name, ...entry })),
    ...(drop.has('emoji') ? [] : [emojiDefinition]),
  ];
}
