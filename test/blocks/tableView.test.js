import { describe, it, expect } from 'vitest';
import { sortRowIdsByColumn, computeColumnAggregate, formatAggregateValue } from '../../src/blocks/table/tableView.js';

function textRun(value) {
  return { type: 'text', value, marks: {} };
}

describe('sortRowIdsByColumn', () => {
  it('sorts text columns case-insensitively, ascending or descending', () => {
    const rows = [
      { rowId: 'r1', run: textRun('banana') },
      { rowId: 'r2', run: textRun('Apple') },
      { rowId: 'r3', run: textRun('cherry') },
    ];
    expect(sortRowIdsByColumn(rows, 'text', 'asc')).toEqual(['r2', 'r1', 'r3']);
    expect(sortRowIdsByColumn(rows, 'text', 'desc')).toEqual(['r3', 'r1', 'r2']);
  });

  it('sorts numeric-looking text values numerically, not lexically', () => {
    const rows = [
      { rowId: 'r1', run: textRun('9') },
      { rowId: 'r2', run: textRun('10') },
      { rowId: 'r3', run: textRun('2') },
    ];
    // Lexical order would be ["10", "2", "9"] -- numeric order is ["2", "9", "10"].
    expect(sortRowIdsByColumn(rows, 'text', 'asc')).toEqual(['r3', 'r1', 'r2']);
  });

  it('blank cells always sort to the end, in both directions', () => {
    const rows = [
      { rowId: 'r1', run: textRun('b') },
      { rowId: 'r2', run: textRun('') },
      { rowId: 'r3', run: textRun('a') },
    ];
    expect(sortRowIdsByColumn(rows, 'text', 'asc')).toEqual(['r3', 'r1', 'r2']);
    expect(sortRowIdsByColumn(rows, 'text', 'desc')).toEqual(['r1', 'r3', 'r2']);
  });

  it('sorts date columns by their ISO date', () => {
    const rows = [
      { rowId: 'r1', run: { type: 'date', data: { isoDate: '2026-03-01' } } },
      { rowId: 'r2', run: { type: 'date', data: { isoDate: '2026-01-15' } } },
    ];
    expect(sortRowIdsByColumn(rows, 'date', 'asc')).toEqual(['r2', 'r1']);
  });

  it('sorts checkbox columns unchecked-before-checked ascending', () => {
    const rows = [
      { rowId: 'r1', run: { type: 'checkbox', data: { checked: true } } },
      { rowId: 'r2', run: { type: 'checkbox', data: { checked: false } } },
    ];
    expect(sortRowIdsByColumn(rows, 'checkbox', 'asc')).toEqual(['r2', 'r1']);
  });

  it('sorts select columns by their selected label', () => {
    const rows = [
      { rowId: 'r1', run: { type: 'tableSelect', data: { selectedLabel: 'High' } } },
      { rowId: 'r2', run: { type: 'tableSelect', data: { selectedLabel: 'Low' } } },
    ];
    expect(sortRowIdsByColumn(rows, 'select', 'asc')).toEqual(['r1', 'r2']);
  });
});

describe('computeColumnAggregate', () => {
  it('returns null for "none" or an unset aggregate', () => {
    expect(computeColumnAggregate([textRun('1')], 'text', 'none')).toBeNull();
    expect(computeColumnAggregate([textRun('1')], 'text', undefined)).toBeNull();
  });

  it('count / count-values / count-empty', () => {
    const runs = [textRun('a'), textRun(''), textRun('b')];
    expect(computeColumnAggregate(runs, 'text', 'count')).toBe(3);
    expect(computeColumnAggregate(runs, 'text', 'count-values')).toBe(2);
    expect(computeColumnAggregate(runs, 'text', 'count-empty')).toBe(1);
  });

  it('sum/average/min/max skip non-numeric cells rather than treating them as zero', () => {
    const runs = [textRun('4'), textRun('not a number'), textRun('6'), textRun('')];
    expect(computeColumnAggregate(runs, 'text', 'sum')).toBe(10);
    expect(computeColumnAggregate(runs, 'text', 'average')).toBe(5);
    expect(computeColumnAggregate(runs, 'text', 'min')).toBe(4);
    expect(computeColumnAggregate(runs, 'text', 'max')).toBe(6);
  });

  it('sum/average/min/max return null (not 0) when nothing in the column is numeric', () => {
    const runs = [textRun('abc'), textRun('def')];
    expect(computeColumnAggregate(runs, 'text', 'sum')).toBeNull();
    expect(computeColumnAggregate(runs, 'text', 'average')).toBeNull();
  });
});

describe('formatAggregateValue', () => {
  it('prints integers bare and rounds non-integers to 2 decimal places', () => {
    expect(formatAggregateValue(5)).toBe('5');
    expect(formatAggregateValue(3.3333333)).toBe('3.33');
    expect(formatAggregateValue(null)).toBe('');
  });
});
