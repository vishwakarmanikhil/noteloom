import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from './icons.jsx';
import { useOutsideClickAndEscape } from './useOutsideClickAndEscape.js';
import { useVirtualKeyboardInset } from './useVirtualKeyboardInset.js';
import { useHorizontalAutoAdjustedLeft } from './usePopoverEdgeClamp.js';

// Rough worst-case popover height (max-height in .be-select-options's own
// CSS is 220px, plus the search input and padding) — only used to decide
// which side of the trigger to open on, not as an exact pixel budget.
const ESTIMATED_POPOVER_HEIGHT = 280;

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
 * contentEditable=false inline chip (select/table-select/custom field type), which
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
 *
 * `variant="tag"` renders the selected value (and each option in the list)
 * as a small colored pill instead of plain text in a bordered/chevroned
 * box — a familiar Select-property look. Pass `color: { bg, text }` on
 * each option for this (see blocks/table/tagColors.js); the trigger itself
 * loses its border/background/chevron chrome entirely in this mode — just
 * the pill (or the placeholder, if nothing's chosen yet) is clickable.
 *
 * `options` may also be a function `(query) => Option[] | Promise<Option[]>`
 * instead of a plain array — this is how custom field types (see
 * createSelectFieldType) support DB/API-backed option sources (react-
 * select's `loadOptions`, essentially) alongside plain static lists,
 * through the exact same component and contract. When `options` is a
 * function it's called fresh on every query change (debounced ~250ms so
 * fast typing doesn't fire one request per keystroke) — deliberately no
 * caching layer here, so the host's own resolver is always the source of
 * truth for a given query; any caching is that function's own concern.
 * Static array callers are entirely unaffected: filtering there stays
 * synchronous and instant, exactly as before.
 *
 * Since a dynamic resolver's currently-loaded page may not contain the
 * option matching the CURRENT value (it was picked under a different
 * query, or came from elsewhere), pass `selectedLabel` to control what the
 * trigger displays for the current value directly, instead of relying on
 * an `options.find(...)` lookup that only works for static arrays.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  ariaLabel,
  className = '',
  variant = 'default',
  selectedLabel,
  selectedColor,
  onManageOptions,
  manageOptionsLabel = 'Manage options…',
  mention = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const keyboardInset = useVirtualKeyboardInset();
  const [asyncOptions, setAsyncOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const inputRef = useRef(null);
  const activeOptionRef = useRef(null);
  const outsideRefs = useMemo(() => [rootRef, popoverRef], []);
  const isTag = variant === 'tag';
  const isDynamic = typeof options === 'function';

  const staticSelected = !isDynamic ? options.find((o) => o.value === value) : undefined;
  const selected = value
    ? (staticSelected ?? (selectedLabel ? { value, label: selectedLabel, color: selectedColor } : undefined))
    : undefined;

  const filtered = useMemo(
    () => (isDynamic ? asyncOptions : options.filter((o) => matchesQuery(o, query))),
    [isDynamic, asyncOptions, options, query],
  );

  // Dynamic resolvers already do their own query-based filtering (a DB
  // search, typically) — refetch on every query change while the popover
  // is open, debounced so a fast typist doesn't fire one call per keystroke.
  useEffect(() => {
    if (!isDynamic || !isOpen) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    const timer = setTimeout(() => {
      Promise.resolve(options(query))
        .then((result) => {
          if (cancelled) return;
          setAsyncOptions(result ?? []);
          setIsLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setAsyncOptions([]);
          setIsLoading(false);
          setLoadError(true);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isDynamic, isOpen, options, query]);

  const close = useCallback(() => setIsOpen(false), []);

  useOutsideClickAndEscape(outsideRefs, isOpen, close);
  const adjustedLeft = useHorizontalAutoAdjustedLeft(popoverRef, isOpen, rect?.left);

  const open = useCallback(() => {
    setRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setQuery('');
    setActiveIndex(0);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Keeps the keyboard-active option (Arrow Up/Down) visible as it moves
  // past the edge of the scrollable list — without this, arrowing down
  // past the bottom of a long option list leaves the "active" highlight
  // scrolled out of view with nothing on screen showing which one it is.
  useEffect(() => {
    activeOptionRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

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
        className={`be-select-trigger${isTag ? ' be-select-trigger-tag' : ''}${mention ? ' be-select-trigger-mention' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => (isOpen ? close() : open())}
      >
        {isTag ? (
          selected ? (
            <span
              className={`be-select-tag${mention ? ' be-select-tag-mention' : ''}`}
              style={mention ? undefined : { background: selected.color?.bg, color: selected.color?.text }}
            >
              {mention ? `@${selected.label}` : selected.label}
            </span>
          ) : (
            <span className="be-select-value be-select-value-placeholder">{placeholder}</span>
          )
        ) : (
          <>
            <span className="be-select-value">{selected ? selected.label : placeholder}</span>
            <ChevronDownIcon size={14} className="be-select-chevron" />
          </>
        )}
      </button>
      {isOpen &&
        rect &&
        adjustedLeft != null &&
        createPortal(
          <div
            ref={popoverRef}
            className="be-select-popover"
            style={{
              position: 'fixed',
              left: adjustedLeft,
              minWidth: rect.width,
              // Flips above the trigger instead of below it once there isn't
              // enough room left before the keyboard (or screen bottom) —
              // otherwise the popover can render partly/entirely hidden
              // underneath an open on-screen keyboard.
              ...(rect.bottom + ESTIMATED_POPOVER_HEIGHT > window.innerHeight - keyboardInset
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
            }}
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
              {isDynamic && isLoading && <div className="be-select-empty">Loading…</div>}
              {isDynamic && !isLoading && loadError && <div className="be-select-empty be-select-error">Couldn't load options</div>}
              {!isLoading && !loadError && filtered.length === 0 && <div className="be-select-empty">No results</div>}
              {!isLoading &&
                !loadError &&
                filtered.map((option, i) => (
                  <div
                    key={option.value}
                    ref={i === activeIndex ? activeOptionRef : undefined}
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
                    {isTag ? (
                      <span className="be-select-tag" style={{ background: option.color?.bg, color: option.color?.text }}>
                        {option.label}
                      </span>
                    ) : (
                      option.label
                    )}
                  </div>
                ))}
            </div>
            {onManageOptions && (
              <button
                type="button"
                className="be-select-manage-options"
                onMouseDown={(event) => {
                  event.preventDefault();
                  close();
                  onManageOptions();
                }}
              >
                {manageOptionsLabel}
              </button>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
