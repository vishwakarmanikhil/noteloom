// noteloom/starter-kit — the built-in block + inline set as an `extensions`
// array, so `useEditor({ extensions: [...starterKit(), myBlock] })` is the
// recommended way to say "the usual editor, plus my own thing". Calling
// `useEditor()` with no args still registers exactly this same set.
//
// Also re-exported from the main `noteloom` entry.

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

// Each built-in is already a defineBlock()/defineInline() result (see its own
// src/blocks|inlineTypes/*/index.js), so `starterKit()` is just "all of them,
// minus anything excluded". `emoji` is the one marker-only entry — no
// component, tagged by hand in its own file.
const ALL = [
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
  selectInlineType,
  dateInlineType,
  checkboxInlineType,
  tableSelectInlineType,
  emojiInlineType,
];

/**
 * Returns a fresh array of `defineBlock()` / `defineInline()` results for every
 * built-in type. `exclude` drops types by name — `starterKit({ exclude:
 * ['canvas'] })` for the usual editor minus the heavy drawing block.
 */
export function starterKit({ exclude = [] } = {}) {
  const drop = new Set(exclude);
  return ALL.filter((def) => !drop.has(def.name));
}
