import { useEffect, useState } from 'react';

const MENU_ID = 'be-slash-menu';

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
function useActiveDescendantWiring(isOpen, runId, activeOptionId) {
  useEffect(() => {
    if (!isOpen || !runId) return undefined;
    const runEl = document.querySelector(`[data-run-id="${runId}"]`);
    if (!runEl) return undefined;

    runEl.setAttribute('aria-expanded', 'true');
    runEl.setAttribute('aria-haspopup', 'listbox');
    runEl.setAttribute('aria-controls', MENU_ID);
    if (activeOptionId) runEl.setAttribute('aria-activedescendant', activeOptionId);

    return () => {
      runEl.removeAttribute('aria-expanded');
      runEl.removeAttribute('aria-haspopup');
      runEl.removeAttribute('aria-controls');
      runEl.removeAttribute('aria-activedescendant');
    };
  }, [isOpen, runId, activeOptionId]);
}

export function SlashMenu({ isOpen, rect, commands, runId, onSelect, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [commands.length]);

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
  const activeOptionId = activeCommand ? `${MENU_ID}-option-${activeIndex}` : null;
  useActiveDescendantWiring(isOpen, runId, activeOptionId);

  if (!isOpen || commands.length === 0 || !rect) return null;

  return (
    <div
      id={MENU_ID}
      role="listbox"
      aria-label="Slash commands"
      className="be-slash-menu"
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 1000 }}
    >
      {commands.map((command, i) => (
        <div
          key={command.label}
          id={`${MENU_ID}-option-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          className={`be-slash-menu-item${i === activeIndex ? ' be-slash-menu-item-active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(command);
          }}
        >
          {command.label}
        </div>
      ))}
    </div>
  );
}
