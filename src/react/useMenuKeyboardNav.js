import { useEffect, useRef } from 'react';

/**
 * Makes a portaled `role="menu"` popover keyboard-operable: on open, moves
 * real DOM focus onto its first `[role="menuitem"]`; ArrowDown/ArrowUp move
 * focus between items (wrapping), Home/End jump to the first/last, and
 * Escape calls `onClose()` and returns focus to `triggerRef.current`.
 * Activating an item (Enter/Space) is already handled by each item being a
 * real `<button>` — no extra wiring needed for that part.
 *
 * Modeled on Select.jsx's own already-working real-focus-move pattern
 * (not SlashMenu's activedescendant one) — these are standalone action
 * menus, not inline-typeahead where staying in the surrounding text
 * matters, so moving real focus into the menu is the right (and simpler)
 * choice here. Needed because these menus are portaled to `document.body`
 * (escaping ancestor `overflow` clipping, same reason Select's popover is
 * portaled) — being disconnected from the trigger in DOM order means a
 * keyboard user tabbing forward from the trigger would never reach the
 * menu at all without this.
 *
 * Each caller keeps its own `useOutsideClickAndEscape` for outside-click
 * dismissal — this hook only owns the *keyboard* half (arrow nav + this
 * menu's own Escape-with-focus-restore), which outside-click handling
 * doesn't provide on its own.
 */
export function useMenuKeyboardNav(menuRef, isOpen, onClose, triggerRef) {
  const wasOpenRef = useRef(false);
  const didFocusRef = useRef(false);

  // Deliberately no dependency array: some menus (BlockRangeActionMenu, in
  // particular) compute their portal position via a separate effect that
  // runs *after* `isOpen` flips true, so `menuRef.current` is still null on
  // the render where `isOpen` first becomes true — the menu only mounts on
  // a follow-up render once that position state lands. Re-checking after
  // every render (instead of only when `isOpen` changes) means this hook
  // picks the menu up on that follow-up render too, without caring whether
  // the caller mounts the menu synchronously or a tick later. `didFocusRef`
  // keeps first-item focus a one-time-per-open-session thing rather than
  // re-stealing focus back to item 0 on every subsequent re-render while
  // still open (e.g. BlockRangeActionMenu's own rect recompute on scroll).
  useEffect(() => {
    if (!isOpen) {
      didFocusRef.current = false;
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        triggerRef?.current?.focus?.();
      }
      return undefined;
    }
    wasOpenRef.current = true;

    const menu = menuRef.current;
    if (!menu) return undefined;

    const items = () => Array.from(menu.querySelectorAll('[role="menuitem"]'));

    const focusItem = (index) => {
      const list = items();
      if (list.length === 0) return;
      const clamped = ((index % list.length) + list.length) % list.length;
      list[clamped]?.focus();
    };

    if (!didFocusRef.current) {
      didFocusRef.current = true;
      focusItem(0);
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      // Some menus (the table column menu, in particular) mix real
      // menuitems with other interactive content (a type <Select>, a
      // rename <input>) — only hijack arrow/Home/End when focus is
      // actually ON one of the tracked menuitems, so typing in an input
      // or arrowing through a Select's own popover elsewhere in the same
      // menu is never interrupted.
      const list = items();
      const currentIndex = list.indexOf(document.activeElement);
      if (currentIndex === -1) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusItem(currentIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusItem(currentIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusItem(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusItem(list.length - 1);
      }
    };

    menu.addEventListener('keydown', handleKeyDown);
    return () => menu.removeEventListener('keydown', handleKeyDown);
  });
}
