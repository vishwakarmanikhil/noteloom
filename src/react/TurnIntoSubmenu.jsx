import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutsideClickAndEscape } from './useOutsideClickAndEscape.js';
import { useMenuKeyboardNav } from './useMenuKeyboardNav.js';
import { useAutoAdjustedPosition } from './useAutoAdjustedPosition.js';
import { TEXT_FAMILY_TARGETS } from '../blocks/shared/turnInto.js';
import { ChevronRightIcon } from './icons.jsx';

/**
 * A menu item that opens a second, nested `role="menu"` listing every
 * `TEXT_FAMILY_TARGETS` entry — the one reusable "submenu" this codebase
 * has (see turnInto.js's plan doc comment: no prior submenu pattern
 * existed here). Modeled directly on BlockGutterRow's own portaled-menu
 * convention (own `rect` off the trigger's own `getBoundingClientRect()`,
 * own `menuRef` + `useMenuKeyboardNav` + `useOutsideClickAndEscape`) rather
 * than introducing a new one.
 *
 * `onSelect(target)` is called with the chosen `{ type, props, label, icon }`
 * entry; the caller (BlockGutterRow / BlockRangeActionMenu) owns actually
 * converting the block(s) and closing its own outer menu — this component
 * only owns picking a target and closing itself, via `onClose()`, which the
 * caller passes down (its Escape/outside-click here calls `onClose` only,
 * never the outer menu's).
 *
 * `containerRef` (optional) receives the submenu's own portaled DOM node —
 * the caller (BlockGutterRow/BlockRangeActionMenu) must fold it into its
 * OWN outer menu's outside-click ref list. Without this, a click on a
 * submenu item registers as "outside" the outer menu (the submenu portal is
 * a DOM sibling of the outer menu, not a descendant of it, even though it's
 * a React child of this component) — the outer menu's own
 * useOutsideClickAndEscape closes it on `mousedown`, unmounting this
 * component and its submenu *before* the follow-up `click` event that would
 * have actually fired `onSelect` ever reaches the browser, so selecting a
 * target silently did nothing.
 */
export function TurnIntoSubmenu({ onSelect, onClose, containerRef, menuClassName = 'be-block-gutter-menu', itemClassName = 'be-block-gutter-menu-item' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const setMenuRef = useCallback(
    (el) => {
      menuRef.current = el;
      if (containerRef) containerRef.current = el;
    },
    [containerRef],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  useOutsideClickAndEscape([triggerRef, menuRef], isOpen, close);
  useMenuKeyboardNav(menuRef, isOpen, close, triggerRef);

  const position = useAutoAdjustedPosition(menuRef, isOpen, rect?.top, rect ? rect.right + 4 : null);

  const open = useCallback(() => {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setIsOpen(true);
  }, []);

  const handleSelect = useCallback(
    (target) => {
      onSelect(target);
      close();
    },
    [onSelect, close],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        className={itemClassName}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
      >
        <ChevronRightIcon size={15} /> Turn into
      </button>
      {isOpen &&
        position &&
        createPortal(
          <div
            ref={setMenuRef}
            role="menu"
            aria-label="Turn into"
            className={menuClassName}
            style={{ position: 'fixed', top: position.top, left: position.left }}
          >
            {TEXT_FAMILY_TARGETS.map((target, i) => {
              const Icon = target.icon;
              return (
                <button
                  key={`${target.type}-${i}`}
                  type="button"
                  role="menuitem"
                  className={itemClassName}
                  onClick={() => handleSelect(target)}
                >
                  <Icon size={15} /> {target.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
