import { convertBlockType } from './convertBlockType.js';
import { updateRun } from '../../store/operations.js';
import { DEFAULT_CALLOUT_ICON } from '../callout/createCalloutBlock.js';
import {
  TextIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  BulletedListIcon,
  NumberedListIcon,
  CheckboxIcon,
  ChevronRightIcon,
  QuoteIcon,
  CalloutIcon,
  CodeIcon,
} from '../../react/icons.jsx';

/**
 * The "text family" — every block type this codebase's own R&D pass (see
 * README/commit history) settled on as freely inter-convertible, matching
 * the same boundary Notion/Editor.js/TipTap each independently draw:
 * blocks holding rich/plain text content. Deliberately excludes the
 * "structural" group (table, layout/layoutColumn, embed, divider, button)
 * — none of the reference editors offer generic type-conversion for those
 * either; they keep their own dedicated creation/management UI instead.
 *
 * Each entry's `props` matches the exact shape that type's own slash
 * command already inserts with (see e.g. `markdownShortcuts.js`'s RULES,
 * or each block type's own `index.js` `slashCommand(s)`) — this is data,
 * not new conversion logic.
 */
export const TEXT_FAMILY_TARGETS = [
  { type: 'paragraph', props: {}, label: 'Text', icon: TextIcon },
  { type: 'heading', props: { level: 1 }, label: 'Heading 1', icon: Heading1Icon },
  { type: 'heading', props: { level: 2 }, label: 'Heading 2', icon: Heading2Icon },
  { type: 'heading', props: { level: 3 }, label: 'Heading 3', icon: Heading3Icon },
  { type: 'listItem', props: { ordered: false, titleRunIds: [] }, label: 'Bulleted list', icon: BulletedListIcon },
  { type: 'listItem', props: { ordered: true, titleRunIds: [] }, label: 'Numbered list', icon: NumberedListIcon },
  {
    type: 'listItem',
    props: { ordered: false, checked: false, titleRunIds: [] },
    label: 'To-do list',
    icon: CheckboxIcon,
  },
  {
    type: 'listItem',
    props: { ordered: false, collapsed: false, titleRunIds: [] },
    label: 'Toggle list',
    icon: ChevronRightIcon,
  },
  {
    type: 'toggleHeading',
    props: { level: 2, collapsed: false, titleRunIds: [] },
    label: 'Toggle heading',
    icon: ChevronRightIcon,
  },
  { type: 'blockquote', props: {}, label: 'Quote', icon: QuoteIcon },
  { type: 'callout', props: { icon: DEFAULT_CALLOUT_ICON }, label: 'Callout', icon: CalloutIcon },
  { type: 'code', props: { language: 'plaintext' }, label: 'Code', icon: CodeIcon },
];

const TEXT_FAMILY_TYPES = new Set(TEXT_FAMILY_TARGETS.map((t) => t.type));

/** Single source of truth for "is this block type offered by Turn into at all" — menu visibility and range-selection filtering both key off this. */
export function isTurnIntoEligible(type) {
  return TEXT_FAMILY_TYPES.has(type);
}

function getOwnRunIds(block) {
  return block?.props?.titleRunIds ?? block?.contentIds ?? [];
}

/**
 * Converts one block to `target` ({ type, props }), reusing
 * `convertBlockType` — this is the one shared place `getOwnRunIds` and the
 * "strip marks when converting into code" rule live, rather than
 * duplicating either per call site (gutter menu vs. range menu).
 *
 * Marks are stripped only when the target is `code` — code shouldn't carry
 * bold/italic/etc (its own `toHTML` never emits mark tags either) — via
 * plain `updateRun` ops folded into the same batch, so it's still one
 * atomic undo step. This is scoped entirely to this new call path; it
 * never touches `convertBlockType` itself or its two original callers.
 *
 * Returns `{ ops, newBlockId }`, same contract as `convertBlockType` — the
 * caller applies `ops` as one batch (directly, or concatenated with other
 * blocks' ops for a multi-block conversion).
 */
export function turnBlockInto(store, registry, blockId, target) {
  const block = store.getBlock(blockId);
  const runIds = getOwnRunIds(block);

  const ops = [];
  if (target.type === 'code') {
    for (const runId of runIds) {
      const run = store.getRun(runId);
      if (run?.marks && Object.keys(run.marks).length > 0) ops.push(updateRun(runId, { marks: {} }));
    }
  }

  // Cloned, not passed by reference — TEXT_FAMILY_TARGETS entries are
  // shared module-level objects reused across every conversion; convertBlockType
  // hands `props` straight to the new block as-is, so a raw shared reference
  // here would mean every block converted via the same menu entry ends up
  // pointing at the exact same props object.
  const props = { ...target.props };
  const { ops: convertOps, newBlockId } = convertBlockType(store, blockId, target.type, props, runIds, registry);
  return { ops: [...ops, ...convertOps], newBlockId };
}
