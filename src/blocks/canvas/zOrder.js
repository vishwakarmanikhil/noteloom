/**
 * Strokes and shapes are stored as two separate arrays (`props.strokes`/
 * `props.shapes`) for backward compatibility, but visually they share ONE
 * stacking order — a pen stroke drawn after a filled shape needs to render
 * on top of it, and vice versa, the same way every layer-based drawing tool
 * (this package included, as of this module) behaves. Before this module
 * existed, the two arrays had a hard-coded stacking instead: every shape
 * rendered above every stroke, regardless of which was actually drawn more
 * recently -- there was no way to draw on top of an already-placed shape.
 *
 * Documents from before this existed have no `z` on their strokes/shapes at
 * all. `LEGACY_Z_BASE` is a value comfortably larger than any realistic
 * shape/stroke count, so an item WITHOUT an explicit `z` keeps exactly that
 * old two-layer ordering (strokes 0..n-1, shapes LEGACY_Z_BASE..+m-1) when
 * merged into one list here -- no migration needed, nothing visually
 * changes for an already-drawn document until something new is added to it.
 * Items WITH an explicit `z` (everything created going forward, via
 * `nextZIndex` below) interleave by real creation order instead, and always
 * sort after every legacy item since their `z` starts above `LEGACY_Z_BASE`
 * too (see `nextZIndex`).
 */
const LEGACY_Z_BASE = 1e6;

function effectiveZ(item, isShape, index) {
  return typeof item.z === 'number' ? item.z : isShape ? LEGACY_Z_BASE + index : index;
}

/** Merges strokes+shapes into one bottom-to-top render/hit-test order. Each entry is `{ kind: 'stroke' | 'shape', item, z }`. */
export function orderedDrawables(strokes, shapes) {
  const items = [
    ...strokes.map((item, i) => ({ kind: 'stroke', item, z: effectiveZ(item, false, i) })),
    ...shapes.map((item, i) => ({ kind: 'shape', item, z: effectiveZ(item, true, i) })),
  ];
  items.sort((a, b) => a.z - b.z);
  return items;
}

/** The z to stamp on a brand-new stroke/shape so it renders above everything already on the canvas (legacy or not). */
export function nextZIndex(strokes, shapes) {
  let maxZ = -1;
  strokes.forEach((item, i) => {
    maxZ = Math.max(maxZ, effectiveZ(item, false, i));
  });
  shapes.forEach((item, i) => {
    maxZ = Math.max(maxZ, effectiveZ(item, true, i));
  });
  return maxZ + 1;
}

/** The z one below everything already on the canvas — "send to back"'s own counterpart to `nextZIndex`. */
export function minZIndex(strokes, shapes) {
  let minZ = Infinity;
  strokes.forEach((item, i) => {
    minZ = Math.min(minZ, effectiveZ(item, false, i));
  });
  shapes.forEach((item, i) => {
    minZ = Math.min(minZ, effectiveZ(item, true, i));
  });
  return minZ === Infinity ? 0 : minZ - 1;
}
