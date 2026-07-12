import { useEffect, useRef, useState } from 'react';
import { useVirtualKeyboardInset } from '../react/useVirtualKeyboardInset.js';

// Rough worst-case menu height (max-height in .be-slash-menu's own CSS is
// 320px, plus a little padding) — used only to decide *which side* of the
// caret to open on, not as an exact pixel budget, so an approximation here
// is fine either way.
const ESTIMATED_MENU_HEIGHT = 340;

/**
 * Focus deliberately stays in the run's contentEditable (moving it into the
 * menu would exit typing) — so this follows the ARIA "listbox with
 * aria-activedescendant" pattern: the actively-selected option lives in
 * `aria-activedescendant` on whatever *does* have focus (the triggering run
 * element), not on the listbox itself. `runId` is what identifies that
 * element; its `aria-expanded`/`aria-activedescendant` are set/cleared here
 * rather than threaded through every block type, since only this component
 * knows the listbox's ids and open/active state.
 */
function useActiveDescendantWiring(isOpen, runId, activeOptionId, menuId) {
  useEffect(() => {
    if (!isOpen || !runId) return undefined;
    const runEl = document.querySelector(`[data-run-id="${runId}"]`);
    if (!runEl) return undefined;

    runEl.setAttribute('aria-expanded', 'true');
    runEl.setAttribute('aria-haspopup', 'listbox');
    runEl.setAttribute('aria-controls', menuId);
    if (activeOptionId) runEl.setAttribute('aria-activedescendant', activeOptionId);

    return () => {
      runEl.removeAttribute('aria-expanded');
      runEl.removeAttribute('aria-haspopup');
      runEl.removeAttribute('aria-controls');
      runEl.removeAttribute('aria-activedescendant');
    };
  }, [isOpen, runId, activeOptionId, menuId]);
}

/**
 * Generic filterable command popover — not slash-specific despite the name
 * (kept for backward compatibility), also used as-is for the ":" emoji menu
 * (see useEmojiMenuTrigger). Pass a distinct `menuId`/`ariaLabel` for a
 * second simultaneously-mounted instance so DOM ids and
 * aria-controls/aria-activedescendant wiring never collide between them.
 */
export function SlashMenu({
  isOpen,
  rect,
  commands,
  runId,
  onSelect,
  onClose,
  menuId = 'be-slash-menu',
  ariaLabel = 'Slash commands',
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItemRef = useRef(null);
  const keyboardInset = useVirtualKeyboardInset();

  useEffect(() => {
    setActiveIndex(0);
  }, [commands.length]);

  // Keeps the keyboard-active item visible as Arrow Up/Down moves it past
  // the edge of the scrollable list — without this, arrowing past the
  // bottom (or top) leaves the highlighted item scrolled out of view with
  // nothing on screen showing which one is currently selected.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((i) => Math.min(i + 1, Math.max(commands.length - 1, 0)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (commands[activeIndex]) onSelect(commands[activeIndex]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    // capture phase: must win over EditableBlockContent's own onKeyDown (Enter/etc.)
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, commands, activeIndex, onSelect, onClose]);

  const activeCommand = commands[activeIndex];
  const activeOptionId = activeCommand ? `${menuId}-option-${activeIndex}` : null;
  useActiveDescendantWiring(isOpen, runId, activeOptionId, menuId);

  if (!isOpen || commands.length === 0 || !rect) return null;

  // Flip to open above the caret instead of below it once there isn't
  // enough room left under it before the keyboard (or the bottom of the
  // screen) starts — without this, the popover can render partly or
  // entirely underneath the on-screen keyboard, invisible.
  const availableBottom = window.innerHeight - keyboardInset;
  const openAbove = rect.bottom + ESTIMATED_MENU_HEIGHT > availableBottom;
  const positionStyle = openAbove
    ? { bottom: window.innerHeight - rect.top + 4 }
    : { top: rect.bottom + 4 };

  return (
    <div
      id={menuId}
      role="listbox"
      aria-label={ariaLabel}
      className="be-slash-menu"
      style={{ position: 'fixed', left: rect.left, zIndex: 1000, ...positionStyle }}
    >
      {commands.map((command, i) => {
        const Icon = command.icon;
        return (
          <div
            key={command.label}
            ref={i === activeIndex ? activeItemRef : undefined}
            id={`${menuId}-option-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            className={`be-slash-menu-item${i === activeIndex ? ' be-slash-menu-item-active' : ''}`}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(command);
            }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            {Icon && (
              <span className="be-slash-menu-item-icon">
                <Icon size={16} />
              </span>
            )}
            <span className="be-slash-menu-item-label">{command.label}</span>
          </div>
        );
      })}
    </div>
  );
}
