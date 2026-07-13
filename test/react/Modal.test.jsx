import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from '../../src/react/Modal.jsx';

function Harness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open
      </button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Test dialog">
        <input type="text" aria-label="Name" />
        <button type="button" onClick={() => setIsOpen(false)}>
          Save
        </button>
      </Modal>
    </div>
  );
}

describe('Modal: focus in/out', () => {
  it('moves focus to the first focusable element inside the panel on open', () => {
    const { getByText, getByLabelText } = render(<Harness />);
    fireEvent.click(getByText('Open'));
    expect(document.activeElement).toBe(getByLabelText('Name'));
  });

  it('restores focus to whatever opened it once closed', () => {
    const { getByText } = render(<Harness />);
    const openButton = getByText('Open');
    // fireEvent.click alone doesn't simulate the browser's own
    // click-focuses-the-target behavior the way a real click does — focus
    // it explicitly first, matching what actually happens when a user
    // clicks (or Tabs to, then presses Enter on) a real button.
    openButton.focus();
    fireEvent.click(openButton);
    fireEvent.click(getByText('Save'));
    expect(document.activeElement).toBe(openButton);
  });

  it('falls back to focusing the panel itself when there is nothing focusable inside', () => {
    function EmptyHarness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open
          </button>
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Nothing focusable here">
            <p>Just some text, no inputs or buttons.</p>
          </Modal>
        </div>
      );
    }
    const { getByText, container } = render(<EmptyHarness />);
    fireEvent.click(getByText('Open'));
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'));
  });

  it('does not steal focus on mount before ever being opened', () => {
    const { getByText } = render(<Harness />);
    expect(document.activeElement).not.toBe(getByText('Open'));
  });
});
