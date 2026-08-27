/**
 * Pure sort/filter/aggregate math for a table — no store mutation here (see
 * tableEditCommands.js's `sortTableByColumn`/`setColumnAggregate` for the
 * operations that apply this). Kept separate so the comparison/aggregate
 * logic itself is trivially unit-testable without an EditorStore.
 */

/** A cell run's plain-text value, regardless of type (text/date/checkbox/tableSelect) — the single shared helper every sort/filter/aggregate/conversion path in this table feature set reuses instead of re-deriving. */
export function runPlainText(run, inlineRegistry) {
  if (!run) return '';
  if (run.type === 'text') return run.value ?? '';
  const entry = inlineRegistry?.get(run.type);
  return entry?.toPlainText ? entry.toPlainText(run) : '';
}

/** The value a column's own type cares about for sorting/aggregating — not always the same as its rendered plain text (a checkbox sorts by checked state, a date by its ISO string, not a locale-formatted display string). */
function sortKeyForColumn(run, columnType, inlineRegistry) {
  if (columnType === 'date') return run?.data?.isoDate ?? '';
  if (columnType === 'checkbox') return run?.data?.checked ? 1 : 0;
  if (columnType === 'select') return (run?.data?.selectedLabel ?? '').trim();
  return runPlainText(run, inlineRegistry).trim();
}

function compareValues(a, b, columnType) {
  if (columnType === 'checkbox') return a - b;
  // Numeric-ish text/select values (e.g. a "text" column holding numbers,
  // a common real-world case) sort numerically when BOTH sides parse
  // cleanly; otherwise falls back to a locale-aware string compare.
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/**
 * Sorts `rows` (`[{ rowId, run }]`, one entry per row's cell in the target
 * column) by that column's own type-aware comparison — returns just the
 * reordered `rowId`s. Blank cells always sort to the end regardless of
 * `direction` (the common spreadsheet convention), so switching a sort's
 * direction doesn't make empty rows jump from the bottom to the top.
 */
export function sortRowIdsByColumn(rows, columnType, direction, inlineRegistry) {
  const withKeys = rows.map(({ rowId, run }) => ({
    rowId,
    key: sortKeyForColumn(run, columnType, inlineRegistry),
  }));
  const isEmptyKey = (key) => key === '' || key == null;

  withKeys.sort((a, b) => {
    const aEmpty = isEmptyKey(a.key);
    const bEmpty = isEmptyKey(b.key);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const cmp = compareValues(a.key, b.key, columnType);
    return direction === 'desc' ? -cmp : cmp;
  });

  return withKeys.map((r) => r.rowId);
}

export const AGGREGATE_TYPES = [
  'none',
  'count',
  'count-values',
  'count-empty',
  'sum',
  'average',
  'min',
  'max',
];

export const AGGREGATE_LABELS = {
  none: 'None',
  count: 'Count all',
  'count-values': 'Count filled',
  'count-empty': 'Count empty',
  sum: 'Sum',
  average: 'Average',
  min: 'Min',
  max: 'Max',
};

/** Compact prefix shown in the table footer cell itself — the full labels above are for the dropdown, where there's room to spell them out. */
export const AGGREGATE_SHORT_LABELS = {
  count: 'Count',
  'count-values': 'Filled',
  'count-empty': 'Empty',
  sum: 'Sum',
  average: 'Avg',
  min: 'Min',
  max: 'Max',
};

/**
 * Computes one column's footer aggregate over `runs` (the cell run of each
 * currently-VISIBLE row in that column, so a filtered-out row never
 * contributes) — a lightweight, dependency-free "computed column" stand-in
 * for a real formula engine, which this zero-runtime-dependency package
 * deliberately doesn't ship (no expression parser/evaluator, no
 * user-authored code execution surface). `sum`/`average`/`min`/`max` parse
 * each run's own plain text as a number, silently skipping any run that
 * doesn't parse (a text/select column holding numbers works the same as a
 * dedicated "number" column would, since there isn't one) — a column with
 * no numeric values at all returns `null` for those four rather than `0`,
 * so the footer can show an honest "—" instead of a misleading zero.
 */
export function computeColumnAggregate(runs, columnType, aggregateType, inlineRegistry) {
  if (!aggregateType || aggregateType === 'none') return null;
  if (aggregateType === 'count') return runs.length;

  const texts = runs.map((run) => runPlainText(run, inlineRegistry).trim());
  if (aggregateType === 'count-values') return texts.filter((t) => t !== '').length;
  if (aggregateType === 'count-empty') return texts.filter((t) => t === '').length;

  const numbers = texts.map(Number).filter((n, i) => texts[i] !== '' && !Number.isNaN(n));
  if (numbers.length === 0) return null;
  if (aggregateType === 'sum') return numbers.reduce((a, b) => a + b, 0);
  if (aggregateType === 'average') return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  if (aggregateType === 'min') return Math.min(...numbers);
  if (aggregateType === 'max') return Math.max(...numbers);
  return null;
}

/** Formats an aggregate's numeric result for display — integers print bare, non-integers round to 2 decimal places (avoids ugly floating-point noise like 3.300000000000001 from a sum of decimals). */
export function formatAggregateValue(value) {
  if (value == null) return '';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
