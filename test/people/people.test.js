import { describe, it, expect } from 'vitest';
import { EditorStore } from '../../src/store/EditorStore.js';
import { History } from '../../src/store/history.js';
import { addPerson, updatePerson, removePerson } from '../../src/people/people.js';

function makeDoc() {
  return {
    rootId: 'root',
    blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
    runs: [],
  };
}

describe('addPerson / updatePerson / removePerson (high-level API)', () => {
  it('addPerson adds a person, retrievable via getPerson/getPeople', () => {
    const history = new History(new EditorStore(makeDoc()));
    const id = addPerson(history, { name: 'Alice', color: '#e63946' });

    expect(history.getPerson(id)).toMatchObject({ name: 'Alice', color: '#e63946' });
    expect(history.getPeople().map((p) => p.name)).toEqual(['Alice']);
  });

  it('updatePerson patches an existing person', () => {
    const history = new History(new EditorStore(makeDoc()));
    const id = addPerson(history, { name: 'Alice', color: '#e63946' });
    updatePerson(history, id, { name: 'Alicia' });
    expect(history.getPerson(id).name).toBe('Alicia');
  });

  it('removePerson deletes it', () => {
    const history = new History(new EditorStore(makeDoc()));
    const id = addPerson(history, { name: 'Alice', color: '#e63946' });
    removePerson(history, id);
    expect(history.getPerson(id)).toBeUndefined();
  });

  it('undo/redo a full add-update-remove sequence', () => {
    const history = new History(new EditorStore(makeDoc()));
    const id = addPerson(history, { name: 'Alice', color: '#e63946' });
    updatePerson(history, id, { name: 'Alicia' });
    removePerson(history, id);

    expect(history.getPerson(id)).toBeUndefined();

    history.undo(); // undo remove
    expect(history.getPerson(id).name).toBe('Alicia');

    history.undo(); // undo update
    expect(history.getPerson(id).name).toBe('Alice');

    history.undo(); // undo add
    expect(history.getPerson(id)).toBeUndefined();

    history.redo();
    expect(history.getPerson(id)).toBeDefined();
  });

  it('works directly against a plain EditorStore (no History wrapper) too', () => {
    const store = new EditorStore(makeDoc());
    const id = addPerson(store, { name: 'Alice', color: '#e63946' });
    expect(store.getPerson(id)).toBeDefined();
  });
});
