import { useMemo } from 'react';
import { Modal } from './Modal.jsx';
import { useBlockRegistry, useInlineRegistry } from './EditorProvider.jsx';

/**
 * The "+" button's target in MobileActionBar — a bottom sheet listing every
 * insertable block/inline command, tap-friendly instead of the small
 * hover-oriented SlashMenu popover. Lists the exact same union
 * useSlashMenuTrigger.js builds (registry + inlineRegistry's own
 * listSlashCommands()) so this is never a second, drifting copy of "what
 * can be inserted" — it's the discoverable, always-reachable mobile
 * entry point to insertion, coexisting with (not replacing) typing "/" or
 * "@" directly, which still works via the existing trigger hooks.
 *
 * `onSelectCommand(command)` is called with the raw command object;
 * MobileActionBar resolves the current caret position itself (via
 * resolveCollapsedCaret, same as this sheet has no live selection of its
 * own once it's open — tapping into the sheet doesn't move the editor's
 * caret) and calls `command.run(store, {...})`.
 */
export function MobileBlockPickerSheet({ isOpen, onClose, onSelectCommand }) {
  const registry = useBlockRegistry();
  const inlineRegistry = useInlineRegistry();

  const commands = useMemo(
    () => [...(registry?.listSlashCommands() ?? []), ...(inlineRegistry?.listSlashCommands() ?? [])],
    [registry, inlineRegistry],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add a block" variant="sheet">
      <div className="be-mobile-picker-list" role="listbox" aria-label="Insertable blocks">
        {commands.map((command) => {
          const Icon = command.icon;
          return (
            <button
              key={command.label}
              type="button"
              role="option"
              className="be-mobile-picker-item"
              onClick={() => onSelectCommand(command)}
            >
              {Icon && (
                <span className="be-mobile-picker-item-icon">
                  <Icon size={18} />
                </span>
              )}
              <span className="be-mobile-picker-item-label">{command.label}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
