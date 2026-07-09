import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Select } from '../../src/react/Select.jsx';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

describe('Select: trigger and popover basics', () => {
  it('shows the placeholder when nothing is selected, and the option label when it is', () => {
    const { container, rerender } = render(<Select value="" options={OPTIONS} onChange={() => {}} placeholder="Pick one" />);
    expect(container.querySelector('.be-select-value').textContent).toBe('Pick one');

    rerender(<Select value="b" options={OPTIONS} onChange={() => {}} placeholder="Pick one" />);
    expect(container.querySelector('.be-select-value').textContent).toBe('Bravo');
  });

  it('opens a popover portaled to document.body listing every option; clicking the trigger again closes it', () => {
    // Portaled (not a container.querySelector descendant) so it always
    // escapes the contentEditable tree it may be triggered from — see
    // Select.jsx's doc comment. Verified via `document`, not `container`.
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    expect(document.querySelector('.be-select-popover')).toBeNull();
    expect(container.querySelector('.be-select-popover')).toBeNull();

    fireEvent.click(container.querySelector('.be-select-trigger'));
    expect(document.querySelector('.be-select-popover')).not.toBeNull();
    expect(container.querySelector('.be-select-popover')).toBeNull(); // confirms it's NOT nested in container
    expect(document.querySelectorAll('.be-select-option')).toHaveLength(3);

    fireEvent.click(container.querySelector('.be-select-trigger'));
    expect(document.querySelector('.be-select-popover')).toBeNull();
  });

  it('clicking outside closes the popover without selecting anything', () => {
    const onChange = vi.fn();
    const { container } = render(
      <div>
        <div data-testid="outside" />
        <Select value="" options={OPTIONS} onChange={onChange} />
      </div>,
    );
    fireEvent.click(container.querySelector('.be-select-trigger'));
    expect(document.querySelector('.be-select-popover')).not.toBeNull();

    fireEvent.mouseDown(container.querySelector('[data-testid="outside"]'));
    expect(document.querySelector('.be-select-popover')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking inside the (portaled) popover itself is NOT treated as an outside click', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    fireEvent.mouseDown(document.querySelector('.be-select-search'));
    expect(document.querySelector('.be-select-popover')).not.toBeNull(); // still open
  });

  it('Escape closes the popover', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    fireEvent.keyDown(document.querySelector('.be-select-search'), { key: 'Escape' });
    expect(document.querySelector('.be-select-popover')).toBeNull();
  });
});

describe('Select: searching filters options', () => {
  it('typing narrows the option list by label (case-insensitive substring)', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    fireEvent.change(document.querySelector('.be-select-search'), { target: { value: 'bra' } });
    const items = [...document.querySelectorAll('.be-select-option')];
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('Bravo');
  });

  it('shows "No results" when nothing matches', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    fireEvent.change(document.querySelector('.be-select-search'), { target: { value: 'zzz' } });
    expect(document.querySelector('.be-select-empty')).not.toBeNull();
    expect(document.querySelectorAll('.be-select-option')).toHaveLength(0);
  });
});

describe('Select: choosing an option', () => {
  it('clicking an option calls onChange with (value, option) and closes the popover', () => {
    const onChange = vi.fn();
    const { container } = render(<Select value="" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    const options = [...document.querySelectorAll('.be-select-option')];
    fireEvent.mouseDown(options[1]); // Bravo

    expect(onChange).toHaveBeenCalledWith('b', OPTIONS[1]);
    expect(document.querySelector('.be-select-popover')).toBeNull();
  });

  it('ArrowDown/ArrowUp move the active option, and Enter selects the active one', () => {
    const onChange = vi.fn();
    const { container } = render(<Select value="" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    const search = document.querySelector('.be-select-search');

    fireEvent.keyDown(search, { key: 'ArrowDown' }); // 0 -> 1 (Bravo)
    fireEvent.keyDown(search, { key: 'ArrowDown' }); // 1 -> 2 (Charlie)
    fireEvent.keyDown(search, { key: 'ArrowUp' }); // 2 -> 1 (Bravo)
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('b', OPTIONS[1]);
  });

  it('re-opening resets the search query and active index', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    fireEvent.change(document.querySelector('.be-select-search'), { target: { value: 'char' } });
    fireEvent.click(container.querySelector('.be-select-trigger')); // close
    fireEvent.click(container.querySelector('.be-select-trigger')); // reopen

    expect(document.querySelector('.be-select-search').value).toBe('');
    expect(document.querySelectorAll('.be-select-option')).toHaveLength(3);
  });

  it('marks the currently selected option with aria-selected and a distinguishing class', () => {
    const { container } = render(<Select value="c" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    const options = [...document.querySelectorAll('.be-select-option')];
    expect(options[2].getAttribute('aria-selected')).toBe('true');
    expect(options[2].classList.contains('be-select-option-selected')).toBe(true);
    expect(options[0].getAttribute('aria-selected')).toBe('false');
  });
});
