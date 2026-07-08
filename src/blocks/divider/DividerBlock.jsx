// tabIndex={-1}: not in the normal Tab order, but focusable via .focus() —
// needed so setSelectedBlockId (EditorProvider) can actually move DOM focus
// here when it selects this block, keeping the surface's own keydown
// listener capturing the next Backspace/Delete even after whatever
// previously had focus (e.g. an adjacent empty paragraph) has just been
// removed from the DOM entirely.
export function DividerBlock({ id }) {
  return <hr className="be-divider" data-block-id={id} contentEditable={false} tabIndex={-1} />;
}
