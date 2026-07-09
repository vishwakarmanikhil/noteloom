import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from './icons.jsx';
import { useOutsideClickAndEscape } from './useOutsideClickAndEscape.js';

function matchesQuery(option, query) {
  if (!query) return true;
  return option.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * A lightweight, dependency-free "searchable select" (Ant Design Select-
 * style combobox) used everywhere this editor previously used a native
 * `<select>`: a trigger button showing the current value, opening a
 * fixed-position popover with a search input and a filtered, keyboard-
 * navigable option list on click. A native `<select>`'s own dropdown can't
 * be styled or searched, which is the whole reason this exists — visually
 * and behaviorally consistent across every dropdown in the editor instead
 * of each one looking like the browser's own chrome.
 *
 * `options` is `[{ value, label }]`; `onChange(value, option)` fires on
 * pick (both are passed since several call sites want the option's label
 * too, e.g. to store alongside its id). Deliberately does NOT support
 * creating new options inline — that's each call site's own concern (e.g.
 * a table's "select" column options are managed via TableHeaderRow's own
 * add/rename/remove UI) — this component only ever picks one of the
 * options it's given.
 *
 * The popover (search input + option list) is rendered via a portal to
 * `document.body` — same as SlashMenu/FloatingToolbar, which are also
 * mounted as siblings of the contentEditable tree, never nested inside it.
 * Several call sites mount this *trigger* deep inside an atomic
 * contentEditable=false inline chip (select/mention/table-select), which
 * itself lives inside a contentEditable=true paragraph. A real, focusable
 * `<input>` — unlike a native `<select>`'s own OS-level dropdown, which
 * never actually hands page focus to anything — left nested that deep
 * fights the surrounding contentEditable region for focus in ways real
 * browsers resolve inconsistently (and jsdom doesn't reproduce at all):
 * the very first character typed could land back in the paragraph instead
 * of the search box, since a real native `<input>` there is a genuinely new
 * DOM subtree fighting for focus a native `<select>` never had to. Portaling
 * the popover out to `document.body` sidesteps the whole problem — it's a
 * true DOM sibling of the editor surface, not a descendant, so it can never
 * lose that tug-of-war.
 */
export function Select({ value, options, onChange, placeholder = 'Select…', ariaLabel, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const inputRef = useRef(null);
  const outsideRefs = useMemo(() => [rootRef, popoverRef], []);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => options.filter((o) => matchesQuery(o, query)), [options, query]);

  const close = useCallback(() => setIsOpen(false), []);

  useOutsideClickAndEscape(outsideRefs, isOpen, close);

  const open = useCallback(() => {
    setRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setQuery('');
    setActiveIndex(0);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const selectOption = useCallback(
    (option) => {
      onChange(option.value, option);
      close();
      buttonRef.current?.focus();
    },
    [onChange, close],
  );

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (filtered[activeIndex]) selectOption(filtered[activeIndex]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
        buttonRef.current?.focus();
      }
    },
    [filtered, activeIndex, selectOption, close],
  );

  return (
    <span className={`be-select ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="be-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => (isOpen ? close() : open())}
      >
        <span className="be-select-value">{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon size={14} className="be-select-chevron" />
      </button>
      {isOpen &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            className="be-select-popover"
            style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, minWidth: rect.width }}
          >
            <input
              ref={inputRef}
              type="text"
              className="be-select-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search…"
              aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search options'}
            />
            <div className="be-select-options" role="listbox">
              {filtered.length === 0 && <div className="be-select-empty">No results</div>}
              {filtered.map((option, i) => (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  className={`be-select-option${i === activeIndex ? ' be-select-option-active' : ''}${
                    option.value === value ? ' be-select-option-selected' : ''
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault(); // keep focus in the search input until a real selection commits
                    selectOption(option);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {option.label}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
