import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import * as api from '../src/index.js';
import * as collabEntry from '../src/collab.js';
import * as persistenceEntry from '../src/persistence.js';
import * as commentsEntry from '../src/comments.js';
import * as versionsEntry from '../src/versions.js';
import * as voiceEntry from '../src/voice.js';
import * as canvasEntry from '../src/canvas.js';
import * as starterKitEntry from '../src/starter-kit.js';

/**
 * Export-surface snapshot — the cheap gate that lets the repackaging work
 * (docs/repackaging-plan.md) move files around freely without a full manual
 * regression pass each time. Phases 0–2 add new entry points and relocate
 * modules but must not add, drop, or rename anything on the main `noteloom`
 * entry; this test fails loudly the moment that happens.
 *
 * When a public API change IS intended, update the frozen lists below in the
 * same commit — the diff then shows exactly what entered or left the surface,
 * the same review signal the hand-written src/index.d.ts used to provide.
 */

// The complete set of named exports from `noteloom` (the main entry), sorted.
const EXPECTED_EXPORTS = [
  'AGGREGATE_LABELS',
  'AGGREGATE_TYPES',
  'APP_MIME',
  'BlockChildren',
  'BlockErrorBoundary',
  'BlockGutterRow',
  'BlockRangeActionMenu',
  'BlockRegistry',
  'BlockRenderer',
  'COLUMN_TYPES',
  'CollabSession',
  'CommentAvatar',
  'CommentComposer',
  'CommentThreadCard',
  'CommentsPanel',
  'DEFAULT_COLUMN_TYPE',
  'DEFAULT_COLUMN_WIDTH',
  'DocumentExportButton',
  'EditableBlockContent',
  'EditorProvider',
  'EditorStore',
  'EditorTrailingSpace',
  'FieldClockRegistry',
  'FieldTypeEditorModal',
  'FindBar',
  'FloatingToolbar',
  'HLC',
  'History',
  'InlineRegistry',
  'LAYOUT_BLOCKS',
  'ListCrdtState',
  'MESSAGE_TYPE',
  'MIN_COLUMN_WIDTH',
  'MobileActionBar',
  'MobileBlockOptionsSheet',
  'MobileBlockPickerSheet',
  'Modal',
  'NoteloomEditor',
  'PeerConnection',
  'Select',
  'SlashMenu',
  'TABLE_BLOCKS',
  'TABLE_SELECT_INLINE_TYPES',
  'TableHeaderRow',
  'TemplatePicker',
  'VersionHistory',
  'VoiceListeningIndicator',
  'VoicePermissionModal',
  'addComment',
  'addCommentMarkOverRange',
  'addPerson',
  'applyDocumentTemplate',
  'blankRunForType',
  'blockquoteBlockType',
  'buttonBlockType',
  'calloutBlockType',
  'canvasBlockType',
  'captureBlockTemplate',
  'captureSubtree',
  'checkboxInlineType',
  'codeBlockType',
  'computeColumnAggregate',
  'convertRunToType',
  'copyBlockRangeToClipboard',
  'createAutoPersistence',
  'createAutoVersionHistory',
  'createBlockRegistry',
  'createCellForColumn',
  'createDefaultColumns',
  'createInlineRegistry',
  'createPeriodicTombstoneGC',
  'createSelectFieldType',
  'createWebSocketSignaling',
  'dateInlineType',
  'decodeMessage',
  'defineBlock',
  'defineInline',
  'deleteBlockAndFocusSibling',
  'deleteBlockRange',
  'deleteColumn',
  'deleteComment',
  'deleteDocumentVersion',
  'deleteEntireDocument',
  'deleteOverBlockRange',
  'deletePersistedDocument',
  'deleteRow',
  'deleteRunRangeInBlock',
  'deleteTemplate',
  'deserializeClipboard',
  'diffDocumentsHTML',
  'dividerBlockType',
  'duplicateBlock',
  'embedBlockType',
  'emojiInlineType',
  'encodeMessage',
  'ensureRootNonEmpty',
  'exportDocumentHTML',
  'exportDocumentJSON',
  'exportDocumentMarkdown',
  'exportDocumentSimpleJSON',
  'exportDocumentText',
  'exportDocumentWordHTML',
  'findMatches',
  'focusRunAtOffset',
  'focusRunEnd',
  'focusRunStart',
  'formatAggregateValue',
  'genPeerId',
  'getMarksSummaryOverBlockRange',
  'getMarksSummaryOverSelection',
  'headingBlockType',
  'importDocumentSimpleJSON',
  'injectDefaultStyles',
  'insertBlockTemplate',
  'insertColumnAfter',
  'insertRowAfter',
  'isEntireBlockRangeHidden',
  'isEntireBlockSelected',
  'layoutBlockType',
  'layoutColumnBlockType',
  'listDocumentVersions',
  'listItemBlockType',
  'listPersistedDocumentIds',
  'listTemplates',
  'listVoiceCommands',
  'loadDocumentVersion',
  'loadPersistedDocument',
  'loadTemplate',
  'moveBlockDown',
  'moveBlockRangeDown',
  'moveBlockRangeUp',
  'moveBlockUp',
  'operations',
  'paragraphBlockType',
  'registerBlockTemplates',
  'registerBlocks',
  'registerBuiltInBlocks',
  'registerBuiltInInlineTypes',
  'registerExtensions',
  'registerInlineTypes',
  'registerStoredFieldTypes',
  'remapSubtreeIds',
  'removeCommentMarkEverywhere',
  'removePerson',
  'renameColumn',
  'reorderBlockRangeFromStore',
  'replaceAllMatches',
  'replaceMatch',
  'replyToComment',
  'resolveCollapsedCaret',
  'resolveColumns',
  'resolveComment',
  'resolveCrossBlockSelection',
  'resolveMultiRunSelection',
  'resolveRunSelection',
  'saveDocumentVersion',
  'savePersistedDocument',
  'saveTemplate',
  'selectInlineType',
  'serializeBlockRange',
  'setBlockRangeHidden',
  'setColumnAggregate',
  'setColumnOptions',
  'setColumnType',
  'setColumnWidth',
  'setMarksOverBlockRange',
  'setMarksOverSelection',
  'sortTableByColumn',
  'starterKit',
  'tableBlockType',
  'tableCellBlockType',
  'tableRowBlockType',
  'tableSelectInlineType',
  'textToParagraphs',
  'toggleHeadingBlockType',
  'toggleMarkOnRunRange',
  'toggleMarkOverBlockRange',
  'toggleMarkOverSelection',
  'updatePerson',
  'useAtMenuTrigger',
  'useAutoPairBrackets',
  'useBlock',
  'useBlockChildren',
  'useBlockClassName',
  'useBlockRangeDrag',
  'useBlockRangeSelection',
  'useBlockRegistry',
  'useCaretRect',
  'useClipboardHandlers',
  'useCoarsePointer',
  'useCommentAuthorId',
  'useComments',
  'useDocumentVersions',
  'useEditor',
  'useEditorKeyboardShortcuts',
  'useEditorStore',
  'useEmojiMenuTrigger',
  'useFieldTypeEditor',
  'useFieldTypes',
  'useFileUpload',
  'useFindInDocument',
  'useFloatingToolbarTrigger',
  'useHistory',
  'useInlineRegistry',
  'usePeople',
  'usePersistedDocument',
  'usePresence',
  'usePreviewMode',
  'useRegisterFieldTypes',
  'useRun',
  'useSelectedBlock',
  'useServiceWorkerUpdate',
  'useShowLineNumbers',
  'useSlashMenuTrigger',
  'useSmartQuotes',
  'useTemplates',
  'useTextFormattingActions',
  'useVirtualKeyboardInset',
  'useVoiceTyping',
  'useWholeDocumentSelection',
  'walkDomToBlocks',
];

// `export * as operations` — its own sub-surface, frozen the same way.
const EXPECTED_OPERATIONS = [
  'OP',
  'addCommentReply',
  'addCommentThread',
  'addFieldType',
  'addPerson',
  'changeBlockType',
  'editRunChars',
  'insertBlock',
  'moveBlock',
  'removeBlock',
  'removeCommentReply',
  'removeCommentThread',
  'removeFieldType',
  'removePerson',
  'replaceRunSpan',
  'resolveComment',
  'setBlockContentIds',
  'setBlockRuns',
  'updateBlockProps',
  'updateFieldType',
  'updatePerson',
  'updateRun',
];

function diff(actual, expected) {
  const a = new Set(actual);
  const e = new Set(expected);
  return {
    added: actual.filter((n) => !e.has(n)),
    removed: expected.filter((n) => !a.has(n)),
  };
}

describe('public API surface (noteloom main entry)', () => {
  it('exports exactly the frozen set of names', () => {
    const actual = Object.keys(api).sort();
    const { added, removed } = diff(actual, EXPECTED_EXPORTS);
    expect(
      { added, removed },
      `Public API surface changed.\n  + added:   ${JSON.stringify(added)}\n  - removed: ${JSON.stringify(removed)}\n` +
        'If this change is intentional, update EXPECTED_EXPORTS in this file in the same commit.',
    ).toEqual({ added: [], removed: [] });
  });

  it('operations namespace exports exactly the frozen set of names', () => {
    const actual = Object.keys(api.operations).sort();
    const { added, removed } = diff(actual, EXPECTED_OPERATIONS);
    expect({ added, removed }).toEqual({ added: [], removed: [] });
  });

  it('every non-namespace export is defined', () => {
    const missing = EXPECTED_EXPORTS.filter((n) => n !== 'operations' && api[n] === undefined);
    expect(missing).toEqual([]);
  });
});

// The optional-feature subpath entry points (docs/repackaging-plan.md Phase 1).
// Each re-exports a hand-picked slice; every name here must also still be on the
// main `noteloom` entry (they are re-exports, removed only in 2.0). Freezing
// these lists is what stops a rename in a feature module from silently changing
// `noteloom/collab` & co.
const ENTRY_EXPORTS = {
  'noteloom/collab': {
    mod: collabEntry,
    names: [
      'CollabSession',
      'FieldClockRegistry',
      'HLC',
      'ListCrdtState',
      'MESSAGE_TYPE',
      'PeerConnection',
      'createPeriodicTombstoneGC',
      'createWebSocketSignaling',
      'decodeMessage',
      'encodeMessage',
      'genPeerId',
    ],
  },
  'noteloom/persistence': {
    mod: persistenceEntry,
    names: [
      'createAutoPersistence',
      'deletePersistedDocument',
      'listPersistedDocumentIds',
      'loadPersistedDocument',
      'savePersistedDocument',
      'usePersistedDocument',
      'useServiceWorkerUpdate',
    ],
  },
  'noteloom/comments': {
    mod: commentsEntry,
    names: [
      'CommentAvatar',
      'CommentComposer',
      'CommentThreadCard',
      'CommentsPanel',
      'addComment',
      'addCommentMarkOverRange',
      'deleteComment',
      'removeCommentMarkEverywhere',
      'replyToComment',
      'resolveComment',
      'useCommentAuthorId',
      'useComments',
    ],
  },
  'noteloom/versions': {
    mod: versionsEntry,
    names: [
      'VersionHistory',
      'createAutoVersionHistory',
      'deleteDocumentVersion',
      'diffDocumentsHTML',
      'listDocumentVersions',
      'loadDocumentVersion',
      'saveDocumentVersion',
      'useDocumentVersions',
    ],
  },
  'noteloom/voice': {
    mod: voiceEntry,
    names: [
      'VoiceListeningIndicator',
      'VoicePermissionModal',
      'listVoiceCommands',
      'useVoiceTyping',
    ],
  },
  'noteloom/canvas': {
    mod: canvasEntry,
    names: ['canvasBlockType'],
  },
  'noteloom/starter-kit': {
    mod: starterKitEntry,
    names: ['defineBlock', 'defineInline', 'registerExtensions', 'starterKit'],
  },
};

describe('optional-feature subpath entry points', () => {
  for (const [entry, { mod, names }] of Object.entries(ENTRY_EXPORTS)) {
    it(`${entry} exports exactly its frozen set`, () => {
      const actual = Object.keys(mod).sort();
      const { added, removed } = diff(actual, names);
      expect(
        { added, removed },
        `${entry} surface changed.\n  + added:   ${JSON.stringify(added)}\n  - removed: ${JSON.stringify(removed)}`,
      ).toEqual({ added: [], removed: [] });
    });

    it(`${entry} names are all still on the main noteloom entry (back-compat)`, () => {
      const notOnMain = names.filter((name) => api[name] === undefined);
      expect(notOnMain).toEqual([]);
    });
  }
});

// src/index.d.ts is hand-written (see its header comment) and CONTRIBUTING asks
// contributors to keep it in sync by hand. Generating it from the untyped .js
// source would replace real signatures with `any`, so Phase 0 keeps it
// hand-written but adds this check: every runtime export must have a matching
// declaration in the .d.ts. A rename/add that forgets the .d.ts fails here.
describe('src/index.d.ts stays in sync with the runtime exports', () => {
  const dts = readFileSync(resolve(process.cwd(), 'src/index.d.ts'), 'utf8');

  it('declares every runtime export', () => {
    const undeclared = Object.keys(api).filter((name) => {
      if (name === 'operations') return !/export\s+namespace\s+operations\b/.test(dts);
      const decl = new RegExp(
        `export\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|class|let|var|type|interface)\\s+${name}\\b`,
      );
      const reexport = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
      return !decl.test(dts) && !reexport.test(dts);
    });
    expect(
      undeclared,
      `These runtime exports have no declaration in src/index.d.ts: ${JSON.stringify(undeclared)}`,
    ).toEqual([]);
  });
});
