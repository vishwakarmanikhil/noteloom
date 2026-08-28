// noteloom/canvas — the freehand-drawing block type. The single heaviest
// component in the package, so it's an opt-in entry point rather than part of
// the default block set. Register it like any other block:
//
//   import { canvasBlockType } from 'noteloom/canvas';
//   registerBlocks(registry, { canvas: canvasBlockType });
//
// Also still re-exported from the main `noteloom` entry for backward
// compatibility (removed in 2.0 — see docs/repackaging-plan.md).

export { canvasBlockType } from './blocks/canvas/index.js';
