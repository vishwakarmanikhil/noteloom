import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useMenuKeyboardNav } from '../../src/react/useMenuKeyboardNav.js';

function Harness({ withExtraInput = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const close = () => setIsOpen(false);
  useMenuKeyboardNav(menuRef, isOpen, close, triggerRef);

  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen(true)}>
        Open menu
      </button>
      {isOpen && (
        <div ref={menuRef} role="menu" aria-label="Test menu">
          {withExtraInput && <input type="text" aria-label="Some field" />}
          <button type="button" role="menuitem">
            First
          </button>
          <button type="button" role="menuitem">
            Second
          </button>
          <button type="button" role="menuitem">
            Third
          </button>
        </div>
      )}
    </div>
  );
}

describe('useMenuKeyboardNav', () => {
  it('focuses the first menuitem when the menu opens', () => {
    const { getByText } = render(<Harness />);
    fireEvent.click(getByText('Open menu'));
    expect(document.activeElement).toBe(getByText('First'));
  });

  it('ArrowDown/ArrowUp move focus between menuitems, wrapping at each end', () => {
    const { getByText, container } = render(<Harness />);
    fireEvent.click(getByText('Open menu'));

    const menu = container.querySelector('[role="menu"]');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(getByText('Second'));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(getByText('Third'));

    // wraps back to the first
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(getByText('First'));

    // ArrowUp from the first wraps to the last
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(getByText('Third'));
  });

  it('Home/End jump to the first/last menuitem', () => {
    const { getByText, container } = render(<Harness />);
    fireEvent.click(getByText('Open menu'));
    const menu = container.querySelector('[role="menu"]');

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(getByText('Third'));

    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(getByText('First'));
  });

  it('Escape closes the menu and returns focus to the trigger', () => {
    const { getByText, container } = render(<Harness />);
    fireEvent.click(getByText('Open menu'));
    const menu = container.querySelector('[role="menu"]');

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(getByText('Open menu'));
  });

  it('does not steal focus on mount before the menu has ever been opened', () => {
    const { getByText } = render(<Harness />);
    expect(document.activeElement).not.toBe(getByText('Open menu'));
  });

  it('does not hijack arrow keys while focus is on a non-menuitem field inside the menu', () => {
    const { getByText, getByLabelText, container } = render(<Harness withExtraInput />);
    fireEvent.click(getByText('Open menu'));

    const input = getByLabelText('Some field');
    input.focus();
    expect(document.activeElement).toBe(input);

    const menu = container.querySelector('[role="menu"]');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    // focus stays on the input — arrow keys inside a text field must not be
    // hijacked into menu navigation (see the table column menu's Type
    // <Select> and rename <input>, which share this same menu component)
    expect(document.activeElement).toBe(input);
  });
});
