import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useOutsideClickAndEscape } from '../../src/react/useOutsideClickAndEscape.js';

function Harness({ onClose }) {
  const ref = useRef(null);
  useOutsideClickAndEscape(ref, true, onClose);
  return (
    <div ref={ref} data-testid="inside">
      inside
    </div>
  );
}

describe('useOutsideClickAndEscape', () => {
  it('calls onClose on a real outside click', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on a click inside the given ref', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<Harness onClose={onClose} />);

    getByTestId('inside').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('regression: does not call onClose on a click inside a nested Select popover, even though it is portaled outside every given ref (a plain DOM .contains() check alone cannot see it)', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    // Simulate a Select popover portaled to document.body -- a real
    // descendant of <body>, NOT of the harness's own ref'd element, same
    // as Select.jsx's actual createPortal(..., document.body) output.
    const popover = document.createElement('div');
    popover.className = 'be-select-popover';
    const option = document.createElement('div');
    option.className = 'be-select-option';
    popover.appendChild(option);
    document.body.appendChild(popover);

    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
    document.body.removeChild(popover);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
