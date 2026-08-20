import { ArrowUpIcon, ArrowDownIcon, XIcon, ChevronRightIcon } from './icons.jsx';

/**
 * The visible bar for `useFindInDocument` — pass through everything that
 * hook returns. Rendered inline (not portaled) at the top of the editor
 * container by `NoteloomEditor`; a host assembling its own UI from the
 * lower-level pieces can mount it (or a custom bar built on the same hook)
 * wherever makes sense for their layout.
 */
export function FindBar({
  isOpen,
  close,
  query,
  setQuery,
  caseSensitive,
  setCaseSensitive,
  wholeWord,
  setWholeWord,
  isReplaceOpen,
  setIsReplaceOpen,
  replacement,
  setReplacement,
  matches,
  currentIndex,
  next,
  prev,
  replaceCurrent,
  replaceAll,
  queryInputRef,
}) {
  if (!isOpen) return null;

  const handleQueryKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) prev();
      else next();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const handleReplaceKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      replaceCurrent();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="be-find-bar" contentEditable={false}>
      <div className="be-find-bar-row">
        <button
          type="button"
          className={`be-find-bar-replace-toggle${isReplaceOpen ? ' be-find-bar-replace-toggle-open' : ''}`}
          onClick={() => setIsReplaceOpen(!isReplaceOpen)}
          aria-expanded={isReplaceOpen}
          aria-label="Toggle replace"
        >
          <ChevronRightIcon size={12} />
        </button>
        <input
          ref={queryInputRef}
          type="text"
          className="be-find-bar-input"
          placeholder="Find"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleQueryKeyDown}
          aria-label="Find in document"
        />
        <span className="be-find-bar-count">{matches.length === 0 ? '0/0' : `${currentIndex + 1}/${matches.length}`}</span>
        <button
          type="button"
          className={`be-find-bar-toggle${caseSensitive ? ' be-find-bar-toggle-active' : ''}`}
          onClick={() => setCaseSensitive(!caseSensitive)}
          aria-pressed={caseSensitive}
          title="Match case"
          aria-label="Match case"
        >
          Aa
        </button>
        <button
          type="button"
          className={`be-find-bar-toggle${wholeWord ? ' be-find-bar-toggle-active' : ''}`}
          onClick={() => setWholeWord(!wholeWord)}
          aria-pressed={wholeWord}
          title="Whole word"
          aria-label="Whole word"
        >
          [Ab]
        </button>
        <button type="button" className="be-find-bar-nav" onClick={prev} disabled={matches.length === 0} aria-label="Previous match">
          <ArrowUpIcon size={14} />
        </button>
        <button type="button" className="be-find-bar-nav" onClick={next} disabled={matches.length === 0} aria-label="Next match">
          <ArrowDownIcon size={14} />
        </button>
        <button type="button" className="be-find-bar-close" onClick={close} aria-label="Close find bar">
          <XIcon size={14} />
        </button>
      </div>
      {isReplaceOpen && (
        <div className="be-find-bar-row be-find-bar-replace-row">
          <input
            type="text"
            className="be-find-bar-input"
            placeholder="Replace"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={handleReplaceKeyDown}
            aria-label="Replace with"
          />
          <button type="button" className="be-find-bar-replace-btn" onClick={replaceCurrent} disabled={matches.length === 0}>
            Replace
          </button>
          <button type="button" className="be-find-bar-replace-btn" onClick={replaceAll} disabled={matches.length === 0}>
            Replace All
          </button>
        </div>
      )}
    </div>
  );
}
