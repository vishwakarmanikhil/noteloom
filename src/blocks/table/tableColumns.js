import { genId } from '../../utils/idGen.js';

export const COLUMN_TYPES = ['text', 'date', 'checkbox', 'select'];
export const DEFAULT_COLUMN_TYPE = 'text';

export function defaultColumnLabel(index) {
  return `Column ${index + 1}`;
}

export function createDefaultColumns(count) {
  return Array.from({ length: count }, (_, i) => ({ id: genId(), label: defaultColumnLabel(i), type: DEFAULT_COLUMN_TYPE }));
}

/**
 * Returns a table's column metadata (`{ id, label, type }` per column),
 * falling back to generated (all-text) defaults when it's missing or the
 * wrong length — a table pasted in from external HTML, loaded from a
 * document saved before this feature existed, or hand-built by a host app
 * never had a chance to set `props.columns` at all, and it's cheap
 * insurance against a stale array (e.g. a column added/removed through a
 * code path that didn't know to keep it in sync) ever crashing the header
 * row instead of just re-deriving something sensible. Also fills in
 * `type: 'text'` for any column entry that predates the typed-column
 * feature (missing `type` field).
 */
export function resolveColumns(table, colCount) {
  const columns = table.props?.columns;
  if (!Array.isArray(columns) || columns.length !== colCount) return createDefaultColumns(colCount);
  return columns.map((c) => (c.type ? c : { ...c, type: DEFAULT_COLUMN_TYPE }));
}

/**
 * A blank run of the given column type — the shape reused table-wide,
 * whether creating a fresh cell or converting an existing one. A "select"
 * column's runs are `tableSelect` runs with no options of their own — the
 * shared, column-level `options` array (see resolveColumns) is the single
 * source of truth every cell's dropdown reads from, so a brand new blank
 * cell in an already-typed select column immediately gets the same
 * choices as every other cell in that column, with nothing to seed here.
 */
export function blankRunForType(type) {
  switch (type) {
    case 'date':
      return { id: genId(), type: 'date', value: '', marks: {}, data: { isoDate: '' } };
    case 'checkbox':
      return { id: genId(), type: 'checkbox', value: '', marks: {}, data: { checked: false, label: '' } };
    case 'select':
      return { id: genId(), type: 'tableSelect', value: '', marks: {}, data: { selectedValue: '', selectedLabel: '' } };
    default:
      return { id: genId(), type: 'text', value: '', marks: {} };
  }
}

/** A fresh empty cell block + its one run, matching `column`'s type — the single "create a table cell" primitive every row/column insert path shares. */
export function createCellForColumn(parentId, column) {
  const run = blankRunForType(column?.type);
  return { block: { id: genId(), type: 'tableCell', parentId, contentIds: [run.id], props: {} }, run };
}

/**
 * Converts one existing run to `newType`, attempting to preserve its data
 * rather than silently discarding it (the bug this whole feature set was
 * partly motivated by fixing, compared to the legacy notevo table's
 * "change type wipes the cell" behavior). Converting *from* a non-text
 * atomic type reads its plain-text value via the old type's own
 * `toPlainText` (through the inline registry) rather than needing a
 * hand-written conversion for every type pair — e.g. a date becomes its
 * formatted string, which then seeds the new checkbox's label, etc.
 * `inlineRegistry` may be omitted only when `run.type` is already `'text'`
 * (no lookup needed for that case).
 *
 * Does NOT handle `newType === 'select'` — converting a whole column *to*
 * select needs to look at every cell together (to build one shared,
 * deduplicated option list), which a single-run function can't do; see
 * setColumnType's own dedicated handling for that case instead.
 */
export function convertRunToType(run, newType, inlineRegistry) {
  if (run.type === newType) return run;

  let text;
  if (run.type === 'text') {
    text = run.value ?? '';
  } else {
    const entry = inlineRegistry?.get(run.type);
    text = entry?.toPlainText ? entry.toPlainText(run) : '';
  }

  if (newType === 'date') {
    const parsed = text ? new Date(text) : null;
    const isoDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
    return { id: genId(), type: 'date', value: '', marks: {}, data: { isoDate } };
  }
  if (newType === 'checkbox') {
    return { id: genId(), type: 'checkbox', value: '', marks: {}, data: { checked: false, label: text } };
  }
  return { id: genId(), type: 'text', value: text, marks: {} };
}
