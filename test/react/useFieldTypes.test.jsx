import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorStore } from '../../src/store/EditorStore.js';
import { EditorProvider } from '../../src/react/EditorProvider.jsx';
import { useFieldTypes } from '../../src/react/useFieldTypes.js';
import { addFieldType, removeFieldType } from '../../src/store/operations.js';

function makeDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

function Harness() {
  const fieldTypes = useFieldTypes();
  return <div data-testid="labels">{fieldTypes.map((f) => f.label).join(',')}</div>;
}

describe('useFieldTypes', () => {
  it('re-renders with the updated list after add/remove, empty initially', () => {
    const store = new EditorStore(makeDoc());
    const { getByTestId } = render(<EditorProvider store={store} registry={{}}><Harness /></EditorProvider>);

    expect(getByTestId('labels').textContent).toBe('');

    act(() => {
      store.applyOperation(addFieldType({ id: 'ft1', label: 'Priority', options: [] }));
    });
    expect(getByTestId('labels').textContent).toBe('Priority');

    act(() => {
      store.applyOperation(addFieldType({ id: 'ft2', label: 'Status', options: [] }));
    });
    expect(getByTestId('labels').textContent).toBe('Priority,Status');

    act(() => {
      store.applyOperation(removeFieldType('ft1'));
    });
    expect(getByTestId('labels').textContent).toBe('Status');
  });
});
