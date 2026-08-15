import { genId } from '../utils/idGen.js';
import {
  addPerson as addPersonOp,
  updatePerson as updatePersonOp,
  removePerson as removePersonOp,
} from '../store/operations.js';

/**
 * Documented entry points for a document's own people list — real,
 * collaboration-aware document data (see EditorStore's `peopleWrite`
 * envelope handling), not device-local storage. This is what
 * `createSelectFieldType`'s "Assignee" usage is meant to source its
 * options from, so every collaborator on the same document sees and can
 * manage the same assignable people, the same way everyone sees the same
 * comment threads.
 *
 * Returns the new person's id.
 */
export function addPerson(store, { name, color }) {
  const id = genId();
  store.applyOperation(addPersonOp({ id, name, color }));
  return id;
}

export function updatePerson(store, id, patch) {
  store.applyOperation(updatePersonOp(id, patch));
}

export function removePerson(store, id) {
  store.applyOperation(removePersonOp(id));
}
