import { CustomSelectInlineNode } from './CustomSelectInlineNode.jsx';
import { genId } from '../../utils/idGen.js';
import { insertInlineRunAtCursor } from '../shared/insertInlineRun.js';
import { SelectIcon } from '../../react/icons.jsx';

function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHTML(str).replace(/"/g, '&quot;');
}

/**
 * Builds a full InlineRegistry entry for one named "select field type" —
 * the mechanism behind BOTH halves of the custom-field-type system:
 *
 *  - a host app calling this directly at setup time with its own `options`
 *    (a plain array, OR a `(query) => Option[] | Promise<Option[]>`
 *    resolver for DB/API-backed search — see Select.jsx) — never persisted,
 *    the host re-registers it every load, same as registering any other
 *    built-in inline type;
 *  - the in-editor "new field type" UI (see FieldTypeEditorModal), which
 *    can only ever produce STATIC options (there's no way to author a
 *    fetch function through a form) and whose definition IS persisted via
 *    the store's fieldTypes collection — see registerStoredFieldTypes,
 *    which calls this same factory to re-register each one after load.
 *
 * Only the resolved `{ value, label }` of whatever got picked is ever
 * stored on the run (`data.selectedValue`/`data.selectedLabel`, plus
 * `data.selectedColor` for the tag variant) — never the live options list
 * itself, so a dynamic (DB-backed) type's run never embeds a stale
 * snapshot of someone else's database. This is exactly tableSelect's own
 * denormalized-label convention, applied here per-field-type instead of
 * per-table-column.
 *
 * `onManage`, if given, is threaded down to every chip as a "Manage
 * options…" footer entry in its popover (see Select's onManageOptions) —
 * registerStoredFieldTypes passes one that opens FieldTypeEditorModal
 * pre-filled for this type's stored id, so any chip can jump straight to
 * editing/deleting the type it belongs to. Not something a host app
 * calling this directly typically needs, since its own config lives in
 * code, not the store.
 *
 * `triggers` (default `['slash']`) decides which trigger-character menu(s)
 * this type's command shows up under — `'slash'` for useSlashMenuTrigger's
 * "/" menu, `'at'` for useAtMenuTrigger's "@" menu, or both. The command
 * object itself (label/icon/keywords/run) is identical either way — only
 * which InlineRegistry list (slashCommand vs atCommand) it's assigned to
 * differs — so opting a type into "@" is a one-line config change, not a
 * separate implementation. Left slash-only by default since not every
 * field type reads naturally after "@" (an "Assignee" or "Reviewer" type
 * does; a generic "Priority"/"Status" dropdown usually doesn't).
 */
export function createSelectFieldType({
  type,
  label,
  placeholder = 'Select…',
  variant = 'default',
  icon,
  options,
  onManage,
  triggers = ['slash'],
  // Defaults to true for an @-reachable type (Assignee, Reviewer, ...): a
  // picked chip renders as "@Name" in a fixed accent color rather than each
  // option's own tag color, matching how @mentions read everywhere else —
  // a consistent mention style, not a per-person palette. Pass
  // `mention: false` to opt an @-triggered type out of this
  // (e.g. it's reachable via "@" but isn't really a "who" mention).
  mention = triggers.includes('at'),
}) {
  function toHTML(run) {
    const label = run.data?.selectedLabel || '';
    const text = mention && label ? `@${label}` : label;
    return `<span data-inline-type="${escapeAttr(type)}" data-selected-value="${escapeAttr(run.data?.selectedValue ?? '')}">${escapeHTML(text)}</span>`;
  }

  function toPlainText(run) {
    const label = run.data?.selectedLabel ?? '';
    return mention && label ? `@${label}` : label;
  }

  function fromHTML(node) {
    if (node.getAttribute?.('data-inline-type') !== type) return null;
    const text = node.textContent ?? '';
    // toHTML prepends "@" for a mention type — strip it back off so
    // selectedLabel stays the bare name; otherwise re-rendering the pasted
    // chip would prepend a second "@" on top of the one already baked into
    // the round-tripped text.
    const selectedLabel = mention && text.startsWith('@') ? text.slice(1) : text;
    return {
      id: genId(),
      type,
      value: '',
      marks: {},
      data: {
        selectedValue: node.getAttribute('data-selected-value') ?? '',
        selectedLabel,
      },
    };
  }

  function Component({ id }) {
    return (
      <CustomSelectInlineNode
        id={id}
        label={label}
        placeholder={placeholder}
        variant={variant}
        options={options}
        onManage={onManage}
        mention={mention}
      />
    );
  }

  const command = {
    label,
    // Falls back to the same icon the built-in generic `select` inline
    // type's own slash command uses (see inlineTypes/select/index.js) —
    // every custom field type (host-defined or created in-editor via
    // FieldTypeEditorModal, which has no way to let a user pick an icon at
    // all) gets a consistent, non-blank glyph in the "/"/"@" menu instead
    // of silently rendering with no icon at all next to every other entry
    // that has one. A host can still override it by passing its own
    // `icon` in the config, same as before.
    icon: icon ?? SelectIcon,
    keywords: [label.toLowerCase(), 'select', 'field'],
    run: (store, { blockId, runId, sliceStart, sliceEnd }) =>
      insertInlineRunAtCursor(store, { blockId, runId, sliceStart, sliceEnd }, () => ({
        id: genId(),
        type,
        value: '',
        marks: {},
        data: { selectedValue: '', selectedLabel: '', selectedColor: undefined },
      })),
  };

  return {
    component: Component,
    isAtomic: true,
    toHTML,
    toPlainText,
    fromHTML,
    slashCommand: triggers.includes('slash') ? command : undefined,
    atCommand: triggers.includes('at') ? command : undefined,
  };
}
