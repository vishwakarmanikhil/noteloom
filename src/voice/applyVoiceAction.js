import { convertBlockType } from '../blocks/shared/convertBlockType.js';
import { insertSiblingAfterAndFocus } from '../blocks/shared/blockCommands.js';
import { createTextLeafBlock } from '../blocks/shared/leafBlockFactory.js';
import { focusRunStart } from '../react/focusRun.js';
import { restoreSelectionAfterHistoryChange } from '../react/restoreHistorySelection.js';

function applyOps(store, ops) {
  if (typeof store.performBatch === 'function') store.performBatch(ops);
  else for (const op of ops) store.applyOperation(op);
}

function getOwnRunIds(block) {
  return block?.props?.titleRunIds ?? block?.contentIds ?? [];
}

/**
 * Executes one matched voice command (see voiceCommands.js) against the
 * store. `blockId` is wherever the caret currently is — resolved by the
 * caller (useVoiceTyping) via resolveCollapsedCaret, the same way every
 * other command in this codebase locates "the current block".
 *
 * 'convertBlock' reuses convertBlockType directly (not the slash-command
 * factory path) specifically so any text already dictated into the
 * current block survives the conversion — the same reason
 * markdownShortcuts.js uses it, and doubly important here since a live
 * dictation session is far more likely to have real typed content in the
 * block at the moment a structural command is spoken.
 */
export function applyVoiceAction(store, blockId, action) {
  if (action.type === 'insertParagraph') {
    insertSiblingAfterAndFocus(store, blockId, createTextLeafBlock('paragraph'));
    return;
  }

  if (action.type === 'convertBlock') {
    const block = store.getBlock(blockId);
    if (!block) return;
    const runIds = getOwnRunIds(block);
    const { ops } = convertBlockType(store, blockId, action.blockType, action.props, runIds);
    applyOps(store, ops);
    if (runIds[0]) focusRunStart(runIds[0]);
    return;
  }

  if (action.type === 'undo') {
    if (store.undo?.()) restoreSelectionAfterHistoryChange(store);
    return;
  }

  if (action.type === 'redo') {
    if (store.redo?.()) restoreSelectionAfterHistoryChange(store);
  }
}
