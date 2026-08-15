import { useEffect } from 'react';

/**
 * Closes whatever `isOpen` gates when the user clicks outside every ref in
 * `refs`, or presses Escape — the same ~15-line pattern this codebase
 * previously copy-pasted independently in FloatingToolbar, TableHeaderRow's
 * column menu, and Modal. Extracted here so a new consumer (Select) doesn't
 * need a fourth copy; the existing three call sites are left as-is (their
 * own small variations — e.g. Modal's backdrop-click check — aren't worth
 * disturbing for this).
 *
 * `refs` accepts either a single ref or an array of refs — a consumer whose
 * popover is portaled somewhere else in the DOM (e.g. Select's popover,
 * portaled to document.body so it isn't nested inside a contentEditable
 * region) needs a second ref for that portaled element, since it's no
 * longer a DOM descendant of the trigger's own root.
 *
 * Also always treats a click landing inside ANY currently-open `Select`
 * popover as "inside," regardless of whose refs were passed — a `Select`
 * nested inside this hook's OWN gated popover (the table column menu's
 * "Column type"/field-type pickers, a menu's own filter dropdown, ...) is
 * ALSO portaled to `document.body`, so a plain `ref.current.contains()`
 * check can never see it as a descendant either, and picking an option in
 * it would otherwise close the outer popover as an unwanted side effect —
 * confirmed as a real, pre-existing bug (not hypothetical) doing exactly
 * that to the table column menu's own type selector before this fix.
 */
export function useOutsideClickAndEscape(refs, isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const refList = Array.isArray(refs) ? refs : [refs];
    const handlePointerDown = (event) => {
      const inside =
        refList.some((ref) => ref.current && ref.current.contains(event.target)) ||
        event.target.closest?.('.be-select-popover') != null;
      if (!inside) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, refs]);
}
