import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { addPerson, updatePerson, removePerson } from '../../src/store/operations.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
    runs: [],
  };
}

function makePerson(overrides = {}) {
  return { id: 'pe1', name: 'Alice', color: '#e63946', ...overrides };
}

/** Applies `op` to `store`, then delivers the resulting envelope to every store in `peers`. */
function applyAndBroadcast(store, op, peers) {
  store.applyOperation(op);
  const envelope = store.getLastEnvelope();
  for (const peer of peers) peer.applyRemoteOperation(envelope);
  return envelope;
}

describe('EditorStore people CRUD', () => {
  it('addPerson adds a person, retrievable via getPerson/getPeople', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addPerson(makePerson()));
    expect(store.getPerson('pe1')).toEqual(makePerson());
    expect(store.getPeople()).toEqual([makePerson()]);
  });

  it('getPeople returns the same array reference until a people op runs', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addPerson(makePerson()));
    const first = store.getPeople();
    const second = store.getPeople();
    expect(first).toBe(second);
    store.applyOperation(updatePerson('pe1', { name: 'Alicia' }));
    expect(store.getPeople()).not.toBe(first);
  });

  it('updatePerson patches without disturbing other fields', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addPerson(makePerson()));
    store.applyOperation(updatePerson('pe1', { name: 'Alicia' }));
    expect(store.getPerson('pe1')).toEqual(makePerson({ name: 'Alicia' }));
  });

  it('removePerson deletes it', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addPerson(makePerson()));
    store.applyOperation(removePerson('pe1'));
    expect(store.getPerson('pe1')).toBeUndefined();
  });

  it('toJSON/constructor round-trips people', () => {
    const store = new EditorStore(makeDoc());
    store.applyOperation(addPerson(makePerson()));
    const json = store.toJSON();
    const restored = new EditorStore(json);
    expect(restored.getPerson('pe1')).toEqual(makePerson());
  });
});

describe('EditorStore people undo/redo (via History)', () => {
  it('undo/redo a full add-update-remove sequence', () => {
    const history = new History(new EditorStore(makeDoc()));
    history.perform(addPerson(makePerson()));
    history.perform(updatePerson('pe1', { name: 'Alicia' }));

    expect(history.getPerson('pe1').name).toBe('Alicia');

    history.undo(); // undo update
    expect(history.getPerson('pe1').name).toBe('Alice');

    history.undo(); // undo add
    expect(history.getPerson('pe1')).toBeUndefined();

    history.redo();
    expect(history.getPerson('pe1')).toBeDefined();
    history.redo();
    expect(history.getPerson('pe1').name).toBe('Alicia');
  });
});

describe('EditorStore two-peer convergence: people list', () => {
  it('addPerson broadcasts and applies remotely', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addPerson(makePerson()), [storeB]);
    expect(storeB.getPerson('pe1')).toEqual(makePerson());
  });

  it('an update from one peer merges into the other', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addPerson(makePerson()), [storeB]);
    applyAndBroadcast(storeB, updatePerson('pe1', { name: 'Alicia' }), [storeA]);

    expect(storeA.getPerson('pe1').name).toBe('Alicia');
    expect(storeB.getPerson('pe1').name).toBe('Alicia');
  });

  it('duplicate delivery of the same add envelope is a no-op (idempotent)', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    storeA.applyOperation(addPerson(makePerson()));
    const envelope = storeA.getLastEnvelope();
    storeB.applyRemoteOperation(envelope);
    storeB.applyRemoteOperation(envelope); // delivered twice

    expect(storeB.getPeople()).toEqual([makePerson()]);
  });

  it('removePerson broadcasts to a connected peer', () => {
    const storeA = new EditorStore(makeDoc());
    const storeB = new EditorStore(makeDoc());
    applyAndBroadcast(storeA, addPerson(makePerson()), [storeB]);
    applyAndBroadcast(storeA, removePerson('pe1'), [storeB]);
    expect(storeB.getPerson('pe1')).toBeUndefined();
  });

  it('an update arriving before its person was ever added (out-of-order delivery) is silently dropped, not thrown', () => {
    const storeB = new EditorStore(makeDoc());
    expect(() =>
      storeB.applyRemoteOperation({ kind: 'peopleWrite', op: 'update', id: 'never-arrived', patch: { name: 'Ghost' } }),
    ).not.toThrow();
    expect(storeB.getPerson('never-arrived')).toBeUndefined();
  });
});
