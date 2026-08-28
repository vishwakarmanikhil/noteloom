// noteloom/canvas — the freehand-drawing block type. The single heaviest
// component in the package, so it's an opt-in entry point rather than part of
// the default block set. Register it like any other block:
//
//   import { canvasBlockType } from 'noteloom/canvas';
//   registerBlocks(registry, { canvas: canvasBlockType });
//
// `canvasBlockType` is also (deprecated) on the main `noteloom` entry, to be
// removed in a future major.

export { canvasBlockType } from './blocks/canvas/index.js';
