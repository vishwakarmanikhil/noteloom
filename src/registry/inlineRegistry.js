/**
 * Registry of inline run types beyond plain text — e.g. a `select` chip, a
 * `date` chip, mixed directly into a paragraph's running text alongside
 * ordinary text runs. Parallel to BlockRegistry: `RunNode` (the per-run
 * renderer) looks entries up here instead of switching on `run.type`
 * itself, so adding a new inline type is only ever "call `register` once".
 *
 * entry shape:
 *   {
 *     component,                 // React component, receives only { id } (like BlockRenderer's contract)
 *     isAtomic: true,             // always true today: every registered inline type renders as a single
 *                                 // contentEditable=false island (see RunNode) — the browser then handles
 *                                 // arrow-key skip-over and single-backspace-delete for it natively.
 *     toHTML(run, ctx),           // ctx: { store, registry, inlineRegistry } -> html string
 *     fromHTML(domNode, ctx),     // -> constructed Run | null if this type doesn't claim the node
 *     toPlainText(run, ctx),      // -> plain text string
 *     slashCommand: { label, icon, keywords, run(store, {blockId, runId}) } | undefined,
 *     slashCommands: [ { label, icon, keywords, run } ] | undefined  // for a type offering several commands
 *                                 // at once (e.g. emoji: one entry per emoji, all sharing an "emoji" keyword)
 *                                 // — mirrors BlockRegistry's own singular/plural split.
 *     atCommand / atCommands,     // same shape as slashCommand/slashCommands, listed under useAtMenuTrigger's
 *                                 // "@" trigger instead of (or in addition to) "/" — e.g. createSelectFieldType's
 *                                 // `triggers` option decides which of these two lists a given field type joins.
 *                                 // A command object itself doesn't care which character triggered it (`run`
 *                                 // only consumes {blockId, runId, sliceStart, sliceEnd}), so the very same
 *                                 // object can be — and typically is — assigned to both slashCommand and atCommand.
 *   }
 *
 * A plain `type: 'text'` run is handled directly by RunNode and never goes
 * through this registry — there's nothing to register for it.
 */
export class InlineRegistry {
  constructor() {
    this._types = new Map();
  }

  register(type, entry) {
    this._types.set(type, entry);
  }

  /** Drops a registered type — e.g. deleting a user-created custom field type. */
  unregister(type) {
    this._types.delete(type);
  }

  get(type) {
    return this._types.get(type);
  }

  listHtmlMatchers() {
    return [...this._types.values()].filter((entry) => entry.fromHTML);
  }

  listSlashCommands() {
    const commands = [];
    for (const entry of this._types.values()) {
      if (entry.slashCommand) commands.push(entry.slashCommand);
      if (entry.slashCommands) commands.push(...entry.slashCommands);
    }
    return commands;
  }

  /** Same shape as listSlashCommands, sourced from atCommand/atCommands instead — see useAtMenuTrigger. */
  listAtCommands() {
    const commands = [];
    for (const entry of this._types.values()) {
      if (entry.atCommand) commands.push(entry.atCommand);
      if (entry.atCommands) commands.push(...entry.atCommands);
    }
    return commands;
  }
}

export function createInlineRegistry() {
  return new InlineRegistry();
}
