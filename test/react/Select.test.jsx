import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Select } from '../../src/react/Select.jsx';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

const TAG_OPTIONS = [
  { value: 'a', label: 'Alpha', color: { bg: '#111', text: '#222' } },
  { value: 'b', label: 'Bravo', color: { bg: '#333', text: '#444' } },
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

describe('Select: variant="tag" (colored pill, no dropdown-box chrome)', () => {
  it('shows the placeholder as plain text (no border/chevron) when nothing is selected', () => {
    const { container } = render(
      <Select value="" options={TAG_OPTIONS} onChange={() => {}} placeholder="Empty" variant="tag" />,
    );
    const trigger = container.querySelector('.be-select-trigger');
    expect(trigger.classList.contains('be-select-trigger-tag')).toBe(true);
    expect(container.querySelector('.be-select-chevron')).toBeNull();
    expect(container.querySelector('.be-select-value-placeholder').textContent).toBe('Empty');
    expect(container.querySelector('.be-select-tag')).toBeNull();
  });

  it('renders the selected value as a colored pill using the option\'s color', () => {
    const { container } = render(<Select value="a" options={TAG_OPTIONS} onChange={() => {}} variant="tag" />);
    const tag = container.querySelector('.be-select-tag');
    expect(tag).not.toBeNull();
    expect(tag.textContent).toBe('Alpha');
    expect(tag.style.background).toBe('rgb(17, 17, 17)'); // '#111'
    expect(tag.style.color).toBe('rgb(34, 34, 34)'); // '#222'
    expect(container.querySelector('.be-select-chevron')).toBeNull();
  });

  it('renders each option in the popover as its own colored pill', () => {
    const { container } = render(<Select value="" options={TAG_OPTIONS} onChange={() => {}} variant="tag" />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    const tags = [...document.querySelectorAll('.be-select-option .be-select-tag')];
    expect(tags).toHaveLength(2);
    expect(tags[0].textContent).toBe('Alpha');
    expect(tags[1].style.background).toBe('rgb(51, 51, 51)'); // '#333'
  });

  it('picking a tag option still calls onChange with (value, option) as usual', () => {
    const onChange = vi.fn();
    const { container } = render(<Select value="" options={TAG_OPTIONS} onChange={onChange} variant="tag" />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    fireEvent.mouseDown(document.querySelector('.be-select-option'));
    expect(onChange).toHaveBeenCalledWith('a', TAG_OPTIONS[0]);
  });
});

describe('Select: keeps the active option in view while navigating with arrow keys (windowed/virtualized list)', () => {
  // jsdom has no real layout, so clientHeight is always 0 unless mocked —
  // pin it to something small enough that moving a couple of rows down
  // (at the un-measured ROW_HEIGHT_FALLBACK of 32px) actually pushes the
  // active option below the visible window, exercising the scrollTop math.
  // clientHeight is defined on Element.prototype in jsdom, not
  // HTMLElement.prototype — shadow it there with an own property instead
  // of trying to save/restore a descriptor that doesn't exist at this
  // level, then just delete the shadow afterward to fall back to the real
  // (inherited) getter again.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 40 });
  });
  afterEach(() => {
    delete HTMLElement.prototype.clientHeight;
  });

  it('scrolls the option list container (not a per-item scrollIntoView) as the active index moves past the visible window', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    const search = document.querySelector('.be-select-search');
    const list = document.querySelector('.be-select-options');
    expect(list.scrollTop).toBe(0); // nothing to do yet at the top of the list

    fireEvent.keyDown(search, { key: 'ArrowDown' }); // -> Bravo (index 1)
    fireEvent.keyDown(search, { key: 'ArrowDown' }); // -> Charlie (index 2)
    expect(list.scrollTop).toBeGreaterThan(0); // scrolled down to keep Charlie in view

    const scrolledDown = list.scrollTop;
    fireEvent.keyDown(search, { key: 'ArrowUp' }); // -> Bravo (index 1) again
    // Moving back up doesn't need to scroll further (Bravo's already above the bottom edge).
    expect(list.scrollTop).toBeLessThanOrEqual(scrolledDown);
  });
});

describe('Select: option list virtualization', () => {
  // clientHeight is defined on Element.prototype in jsdom, not
  // HTMLElement.prototype — shadow it there with an own property instead
  // of trying to save/restore a descriptor that doesn't exist at this
  // level, then just delete the shadow afterward to fall back to the real
  // (inherited) getter again.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 40 });
  });
  afterEach(() => {
    delete HTMLElement.prototype.clientHeight;
  });

  function manyOptions(count) {
    return Array.from({ length: count }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
  }

  it('does not mount every option at once for a large list — only a windowed subset', () => {
    const { container } = render(<Select value="" options={manyOptions(500)} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    const rendered = document.querySelectorAll('.be-select-option').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(500); // nowhere near all 500 mounted
  });

  it('renders top/bottom spacers so the scrollbar still reflects the full (unmounted) list length', () => {
    const { container } = render(<Select value="" options={manyOptions(500)} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    const list = document.querySelector('.be-select-options');
    // First child is a top spacer (0 height at scrollTop 0); scrolling down
    // should make a nonzero-height spacer appear below the visible rows.
    list.scrollTop = 2000;
    fireEvent.scroll(list);

    const spacers = [...list.children].filter((el) => el.getAttribute('aria-hidden') === 'true');
    expect(spacers.length).toBeGreaterThan(0);
  });

  it('scrolling reveals options further down the list that were not initially mounted', () => {
    const { container } = render(<Select value="" options={manyOptions(500)} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    expect(document.body.textContent).not.toContain('Option 400');

    const list = document.querySelector('.be-select-options');
    list.scrollTop = 400 * 32; // roughly where "Option 400" should be, at the fallback row height
    fireEvent.scroll(list);

    expect(document.body.textContent).toContain('Option 400');
  });

  it('a small option list still renders and behaves exactly as before (no regression for the common case)', () => {
    const onChange = vi.fn();
    const { container } = render(<Select value="" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    expect(document.querySelectorAll('.be-select-option')).toHaveLength(3);
    fireEvent.mouseDown(document.querySelectorAll('.be-select-option')[1]);
    expect(onChange).toHaveBeenCalledWith('b', OPTIONS[1]);
  });
});

describe('Select: options as a function (dynamic/DB-backed source)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls the resolver (debounced) once the popover opens and renders what it resolves to', async () => {
    const resolver = vi.fn().mockResolvedValue([{ value: 'x', label: 'Dynamic One' }]);
    const { container } = render(<Select value="" options={resolver} onChange={() => {}} />);

    fireEvent.click(container.querySelector('.be-select-trigger'));
    expect(document.querySelector('.be-select-empty').textContent).toBe('Loading…');
    expect(resolver).not.toHaveBeenCalled(); // debounced, not called immediately

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolver).toHaveBeenCalledWith('');
    expect(document.querySelectorAll('.be-select-option')).toHaveLength(1);
    expect(document.querySelector('.be-select-option').textContent).toBe('Dynamic One');
  });

  it('debounces so fast typing only triggers one call for the final query', async () => {
    const resolver = vi.fn().mockResolvedValue([]);
    const { container } = render(<Select value="" options={resolver} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    resolver.mockClear();

    const search = document.querySelector('.be-select-search');
    fireEvent.change(search, { target: { value: 'a' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(search, { target: { value: 'al' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(search, { target: { value: 'ali' } });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith('ali');
  });

  it('shows an error state when the resolver rejects, instead of crashing', async () => {
    const resolver = vi.fn().mockRejectedValue(new Error('network down'));
    const { container } = render(<Select value="" options={resolver} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector('.be-select-error')).not.toBeNull();
    expect(document.querySelectorAll('.be-select-option')).toHaveLength(0);
  });

  it('uses selectedLabel/selectedColor (not an options.find lookup) to render the current value in the trigger', () => {
    const resolver = vi.fn().mockResolvedValue([]);
    const { container } = render(
      <Select
        value="x"
        selectedLabel="Picked Elsewhere"
        selectedColor={{ bg: '#123456', text: '#fff' }}
        options={resolver}
        onChange={() => {}}
        variant="tag"
      />,
    );
    const tag = container.querySelector('.be-select-tag');
    expect(tag.textContent).toBe('Picked Elsewhere');
  });

  it('static array options are entirely unaffected: no loading state, filters synchronously', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    expect(document.querySelector('.be-select-empty')).toBeNull();
    expect(document.querySelectorAll('.be-select-option')).toHaveLength(3);
  });
});

describe('Select: autoOpen (regression — opening on mount must actually focus the search input, not just render the popover)', () => {
  it('autoOpen actually calls .focus() on the real search input element once it mounts', () => {
    // Regression: the "focus the search input" effect used to depend on
    // isOpen alone, but the popover (and its <input>) only mounts a render
    // pass LATER, once adjustedLeft resolves from its initial null (see
    // useHorizontalAutoAdjustedLeft) — so that effect's one-and-only firing
    // could land while inputRef.current was still null, silently doing
    // nothing (optional chaining swallows it). A plain click happened to
    // dodge this by reusing an already-resolved adjustedLeft from a PRIOR
    // open, so this only ever showed up on a genuinely cold first open —
    // exactly what autoOpen always is. Spying on focus() (rather than
    // checking document.activeElement, which this jsdom setup doesn't
    // reliably reflect even for a real click) verifies the call actually
    // happens on the right element once it exists.
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
    render(<Select value="" options={OPTIONS} onChange={() => {}} autoOpen />);

    const search = document.querySelector('.be-select-search');
    expect(search).not.toBeNull();
    expect(focusSpy).toHaveBeenCalled();
    expect(focusSpy.mock.instances).toContain(search);
  });
});

describe('Select: onManageOptions footer', () => {
  it('renders a "Manage options…" entry when provided, and calls it (closing the popover) on click', () => {
    const onManageOptions = vi.fn();
    const { container } = render(
      <Select value="" options={OPTIONS} onChange={() => {}} onManageOptions={onManageOptions} manageOptionsLabel="Manage…" />,
    );
    fireEvent.click(container.querySelector('.be-select-trigger'));
    const manageBtn = document.querySelector('.be-select-manage-options');
    expect(manageBtn.textContent).toBe('Manage…');

    fireEvent.mouseDown(manageBtn);
    expect(onManageOptions).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.be-select-popover')).toBeNull();
  });

  it('does not render the footer when onManageOptions is not given', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));
    expect(document.querySelector('.be-select-manage-options')).toBeNull();
  });
});

describe('Select: popover stays inside the viewport (autoAdjustOverflow)', () => {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList?.contains('be-select-trigger')) {
        return { left: 380, right: 400, top: 0, bottom: 20, width: 20, height: 20 };
      }
      if (this.classList?.contains('be-select-popover')) {
        return { left: 380, right: 580, top: 20, bottom: 200, width: 200, height: 180 };
      }
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
  });

  it('shifts the popover left so a 200px-wide popover anchored near the right edge stays fully on-screen', () => {
    const { container } = render(<Select value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(container.querySelector('.be-select-trigger'));

    const popover = document.querySelector('.be-select-popover');
    const left = parseFloat(popover.style.left);
    expect(left).toBeLessThanOrEqual(400 - 200); // fits within the 400px-wide viewport
    expect(left).toBeGreaterThanOrEqual(0);
  });
});
