import { CanvasBlock } from './CanvasBlock.jsx';
import { createCanvasBlock, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT } from './createCanvasBlock.js';
import { buildCanvasSVGMarkup } from './exportSvg.js';
import { insertSiblingAfter, insertSiblingAfterAndFocus } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { updateRun } from '../../store/operations.js';
import { ScribbleIcon } from '../../react/icons.jsx';

/**
 * Bakes a self-contained inline `<svg>` (see exportSvg.js's own doc
 * comment for why that logic lives in its own module rather than here).
 * Mirrors embed's own `if (!src) return '<p></p>';` convention for
 * "nothing meaningful here yet" (see embed/index.js's toHTML).
 */
function toHTML(block) {
  const { strokes = [], shapes = [] } = block.props;
  if (!strokes.length && !shapes.length) return '<p></p>';
  return buildCanvasSVGMarkup(block);
}

// A drawing has no meaningful plain-text representation (unlike embed,
// which at least has a filename, or divider's decorative "---") — this is a
// deliberate, permanent v1 limitation: no OCR/description generation.
function toPlainText() {
  return '';
}

// No paste-round-trip import of arbitrary pasted <svg> markup back into
// stroke data in v1 — reverse-parsing arbitrary path `d` data back into a
// normalized-space point array is a non-trivial, out-of-scope problem. A
// canvas block can only be created via its own slash command for now;
// pasting exported HTML back in falls through to whatever the paste
// pipeline does for an unrecognized node.
function fromHTML() {
  return null;
}

/** Same pattern as divider's/embed's slash command: a canvas has no run of its own to focus into, so seed and focus a following paragraph. */
function insertCanvasCommand(store, { blockId, runId, sliceStart, sliceEnd }) {
  const run = store.getRun(runId);
  const value = run?.value ?? '';
  store.applyOperation(updateRun(runId, { value: value.slice(0, sliceStart) + value.slice(sliceEnd) }));
  const canvasId = insertSiblingAfter(store, blockId, createCanvasBlock());
  insertSiblingAfterAndFocus(store, canvasId, createTextLeafBlock('paragraph'));
  return canvasId;
}

export const canvasBlockType = {
  component: CanvasBlock,
  isLeaf: true, // contentIds always [] — a pure widget, same convention as divider/embed
  defaultProps: { strokes: [], shapes: [], width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT },
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Canvas',
    icon: ScribbleIcon,
    keywords: ['canvas', 'draw', 'drawing', 'sketch', 'freehand'],
    run: insertCanvasCommand,
  },
};
