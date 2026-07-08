/**
 * Central registry of block types. Every consumer of a block's behavior
 * (the renderer, the slash-command menu, clipboard serialize/deserialize)
 * looks entries up here instead of switching on `block.type` itself — adding
 * a new block type is only ever "call `register` once".
 *
 * entry shape:
 *   {
 *     component,                 // React component, receives only { id }
 *     isLeaf,                    // true if contentIds points at Runs, false if at child Blocks
 *     defaultProps,              // props for a freshly-inserted block of this type
 *     toHTML(block, ctx),        // ctx: { store, registry } -> html string
 *     fromHTML(domNode, ctx),    // -> constructed { block, runs } | null if this type doesn't claim the node
 *     toPlainText(block, ctx),   // -> plain text string
 *     slashCommand: { label, icon, keywords, run(store, atBlockId) } | undefined,
 *     slashCommands: [ { label, icon, keywords, run } ] | undefined  // for a type offering more than one variant (e.g. listItem: bulleted/numbered/to-do)
 *   }
 */
export class BlockRegistry {
  constructor() {
    this._types = new Map();
  }

  register(type, entry) {
    this._types.set(type, entry);
  }

  get(type) {
    return this._types.get(type);
  }

  isLeaf(type) {
    return Boolean(this._types.get(type)?.isLeaf);
  }

  listSlashCommands() {
    const commands = [];
    for (const entry of this._types.values()) {
      if (entry.slashCommand) commands.push(entry.slashCommand);
      if (entry.slashCommands) commands.push(...entry.slashCommands);
    }
    return commands;
  }

  listHtmlMatchers() {
    return [...this._types.values()].filter((entry) => entry.fromHTML);
  }
}

export function createBlockRegistry() {
  return new BlockRegistry();
}
