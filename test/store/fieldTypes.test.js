import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { addFieldType, updateFieldType, removeFieldType } from '../../src/store/operations.js';

function makeDoc() {
  return { rootId: 'root', blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }], runs: [] };
}

describe('EditorStore fieldTypes collection', () => {
  it('starts empty, and getFieldTypes returns a stable reference across unrelated writes', () => {
    const store = new EditorStore(makeDoc());
    expect(store.getFieldTypes()).toEqual([]);
    const before = store.getFieldTypes();
    expect(store.getFieldTypes()).toBe(before); // same reference, required for useSyncExternalStore
  });

  it('addFieldType adds a record, retrievable by id, and returns removeFieldType as its inverse', () => {
    const store = new EditorStore(makeDoc());
    const fieldType = { id: 'ft1', label: 'Priority', placeholder: 'Select…', variant: 'tag', options: [] };
    const before = store.getFieldTypes();

    const inverse = store.applyOperation(addFieldType(fieldType));

    expect(store.getFieldType('ft1')).toEqual(fieldType);
    expect(store.getFieldTypes()).toEqual([fieldType]);
    expect(store.getFieldTypes()).not.toBe(before); // snapshot invalidated
    expect(inverse).toEqual(removeFieldType('ft1'));

    store.applyOperation(inverse);
    expect(store.getFieldType('ft1')).toBeUndefined();
    expect(store.getFieldTypes()).toEqual([]);
  });

  it('updateFieldType patches fields and inverse restores the previous values', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addFieldType({ id: 'ft1', label: 'Priority', options: [] }));

    const inverse = store.applyOperation(updateFieldType('ft1', { label: 'Urgency', options: [{ value: 'v1', label: 'High' }] }));

    expect(store.getFieldType('ft1').label).toBe('Urgency');
    expect(store.getFieldType('ft1').options).toEqual([{ value: 'v1', label: 'High' }]);

    store.applyOperation(inverse);
    expect(store.getFieldType('ft1').label).toBe('Priority');
    expect(store.getFieldType('ft1').options).toEqual([]);
  });

  it('removeFieldType deletes it, and its inverse (addFieldType) restores the exact same record', () => {
    const store = new EditorStore(makeDoc());
    const fieldType = { id: 'ft1', label: 'Priority', options: [{ value: 'v1', label: 'High' }] };
    store.applyOperation(addFieldType(fieldType));

    const inverse = store.applyOperation(removeFieldType('ft1'));
    expect(store.getFieldType('ft1')).toBeUndefined();

    store.applyOperation(inverse);
    expect(store.getFieldType('ft1')).toEqual(fieldType);
  });

  it('notifies only the sentinel "$fieldTypes" subscription, not per-record ids', () => {
    const store = new EditorStore(makeDoc());
    let fired = 0;
    store.subscribe('$fieldTypes', () => (fired += 1));

    store.applyOperation(addFieldType({ id: 'ft1', label: 'Priority', options: [] }));
    expect(fired).toBe(1);

    store.applyOperation(updateFieldType('ft1', { label: 'X' }));
    expect(fired).toBe(2);

    store.applyOperation(removeFieldType('ft1'));
    expect(fired).toBe(3);
  });

  it('round-trips through toJSON/fromJSON', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addFieldType({ id: 'ft1', label: 'Priority', options: [{ value: 'v1', label: 'High' }] }));

    const restored = EditorStore.fromJSON(store.toJSON());
    expect(restored.getFieldType('ft1')).toEqual(store.getFieldType('ft1'));
  });
});

describe('History wraps fieldTypes ops with working undo/redo', () => {
  it('undo/redo an addFieldType as a single step', () => {
    const store = new History(new EditorStore(makeDoc()));
    store.applyOperation(addFieldType({ id: 'ft1', label: 'Priority', options: [] }));
    expect(store.getFieldType('ft1')).toBeDefined();

    store.undo();
    expect(store.getFieldType('ft1')).toBeUndefined();

    store.redo();
    expect(store.getFieldType('ft1')).toBeDefined();
  });

  it('History delegates getFieldTypes/getFieldType straight to the underlying store', () => {
    const rawStore = new EditorStore(makeDoc());
    const store = new History(rawStore);
    store.applyOperation(addFieldType({ id: 'ft1', label: 'Priority', options: [] }));
    expect(store.getFieldTypes()).toEqual(rawStore.getFieldTypes());
    expect(store.getFieldType('ft1')).toEqual(rawStore.getFieldType('ft1'));
  });
});
