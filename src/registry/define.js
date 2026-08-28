// defineBlock / defineInline — the typed, validating factories for authoring a
// block or inline type. A result is a plain object that is ALSO a valid
// BlockRegistry/InlineRegistry entry, so it drops straight into the existing
// `registry.register(type, entry)` path — an addition alongside
// `registerBlocks` / `registerBuiltInBlocks`, not a replacement.
// `registerExtensions` walks an `extensions: [...]` array and registers each
// item on the right registry.

const BLOCK_KIND = 'block';
const INLINE_KIND = 'inline';
const EXTENSION_KIND = 'extension';

// 'blocks' -> holds child blocks (isLeaf false); 'runs'/'void' -> a leaf
// (isLeaf true) whose contentIds point at text runs, or nothing at all.
const CONTENT_MODEL_IS_LEAF = { blocks: false, runs: true, void: true };

function fail(fn, message) {
  throw new TypeError(`${fn}: ${message}`);
}

/**
 * @param {object} config
 *   - `name` (required): unique string, used as the block `type`.
 *   - `component` (required): React component, receives `{ id }`.
 *   - `contentModel`: 'blocks' | 'runs' | 'void' (default 'blocks'). Sets `isLeaf`.
 *   - `isLeaf`: escape hatch — pass it directly instead of `contentModel`
 *     (used when wrapping a pre-existing entry object).
 *   - any other entry fields (`defaultProps`, `toHTML`, `fromHTML`,
 *     `toPlainText`, `toMarkdown`, `slashCommand`, `slashCommands`, …) pass
 *     through untouched.
 * @returns a BlockRegistry entry: the config plus `kind: 'block'` and a
 *   resolved `isLeaf`.
 */
export function defineBlock(config) {
  if (!config || typeof config !== 'object') fail('defineBlock', 'config must be an object');
  const { name, component, contentModel, isLeaf, ...rest } = config;

  if (typeof name !== 'string' || !name.trim()) {
    fail('defineBlock', '`name` must be a non-empty string');
  }
  if (typeof component !== 'function') {
    fail('defineBlock', `block "${name}": \`component\` must be a React component`);
  }
  if (contentModel !== undefined && !(contentModel in CONTENT_MODEL_IS_LEAF)) {
    fail(
      'defineBlock',
      `block "${name}": \`contentModel\` must be 'blocks', 'runs', or 'void' (got ${JSON.stringify(contentModel)})`,
    );
  }

  const resolvedIsLeaf =
    isLeaf !== undefined
      ? Boolean(isLeaf)
      : contentModel === undefined
        ? false
        : CONTENT_MODEL_IS_LEAF[contentModel];

  return {
    ...rest,
    ...(contentModel !== undefined ? { contentModel } : {}),
    name,
    kind: BLOCK_KIND,
    component,
    isLeaf: resolvedIsLeaf,
  };
}

/**
 * @param {object} config
 *   - `name` (required): unique string, used as the run `type`.
 *   - `component` (required): React component, receives `{ id }`.
 *   - `atomic` / `isAtomic`: only `true` is supported today (the default) —
 *     every inline type renders as one contenteditable=false island.
 *   - any other entry fields (`toHTML`, `fromHTML`, `toPlainText`,
 *     `slashCommand(s)`, `atCommand(s)`, …) pass through untouched.
 * @returns an InlineRegistry entry: the config plus `kind: 'inline'` and
 *   `isAtomic: true`.
 */
export function defineInline(config) {
  if (!config || typeof config !== 'object') fail('defineInline', 'config must be an object');
  const { name, component, atomic, isAtomic, ...rest } = config;

  if (typeof name !== 'string' || !name.trim()) {
    fail('defineInline', '`name` must be a non-empty string');
  }
  if (typeof component !== 'function') {
    fail('defineInline', `inline "${name}": \`component\` must be a React component`);
  }
  const resolvedAtomic =
    atomic !== undefined ? Boolean(atomic) : isAtomic !== undefined ? Boolean(isAtomic) : true;
  if (resolvedAtomic !== true) {
    fail('defineInline', `inline "${name}": only atomic inline types are supported today`);
  }

  return {
    ...rest,
    name,
    kind: INLINE_KIND,
    component,
    isAtomic: true,
  };
}

/**
 * A named unit dropped into an `extensions: [...]` array. Can carry:
 *   - `blocks` / `inlineTypes` — `defineBlock()` / `defineInline()` results to
 *     register (a plugin that ships several types as one install).
 *   - `keymap` — `{ 'Mod-Shift-x': (ctx, event) => boolean }`; return truthy to
 *     mark the key handled (the editor calls preventDefault + stops it there).
 *   - `onBeforeInput(ctx, event)` / `onPaste(ctx, event)` — same "return truthy
 *     = handled" contract, for `beforeinput` / `paste` on the editor surface.
 *   - `setup(ctx)` — run once when the editor mounts; may return a cleanup fn.
 *
 * The behavior fields only do anything when the extension is passed through
 * `useEditor({ extensions })` and rendered by `<NoteloomEditor>` (which wires
 * `useExtensionBehaviors`). `ctx` is the stable facade that hook builds — see
 * its doc comment for the shape. Markdown-style input rules that convert a
 * whole block are still block-coupled and not expressible here yet.
 *
 * @param {object} config — `name` (required, a label) plus any of the above.
 */
export function defineExtension(config) {
  if (!config || typeof config !== 'object') fail('defineExtension', 'config must be an object');
  const {
    name,
    blocks = [],
    inlineTypes = [],
    keymap,
    onBeforeInput,
    onPaste,
    setup,
    ...rest
  } = config;

  if (typeof name !== 'string' || !name.trim()) {
    fail('defineExtension', '`name` must be a non-empty string');
  }
  if (!Array.isArray(blocks)) {
    fail('defineExtension', `extension "${name}": \`blocks\` must be an array`);
  }
  if (!Array.isArray(inlineTypes)) {
    fail('defineExtension', `extension "${name}": \`inlineTypes\` must be an array`);
  }
  if (keymap !== undefined && (typeof keymap !== 'object' || keymap === null)) {
    fail('defineExtension', `extension "${name}": \`keymap\` must be an object`);
  }
  for (const [field, value] of [
    ['onBeforeInput', onBeforeInput],
    ['onPaste', onPaste],
    ['setup', setup],
  ]) {
    if (value !== undefined && typeof value !== 'function') {
      fail('defineExtension', `extension "${name}": \`${field}\` must be a function`);
    }
  }

  return {
    ...rest,
    name,
    kind: EXTENSION_KIND,
    blocks,
    inlineTypes,
    ...(keymap !== undefined ? { keymap } : {}),
    ...(onBeforeInput !== undefined ? { onBeforeInput } : {}),
    ...(onPaste !== undefined ? { onPaste } : {}),
    ...(setup !== undefined ? { setup } : {}),
  };
}

export function isBlockDefinition(value) {
  return Boolean(value) && value.kind === BLOCK_KIND;
}

export function isInlineDefinition(value) {
  return Boolean(value) && value.kind === INLINE_KIND;
}

export function isExtensionBundle(value) {
  return Boolean(value) && value.kind === EXTENSION_KIND;
}

/**
 * Registers a flat or nested array of `defineBlock()` / `defineInline()`
 * results (and `defineExtension()` bundles, which are unpacked recursively)
 * onto the given registries — the primitive behind
 * `useEditor({ extensions: [...] })`, also usable directly against your own
 * `createBlockRegistry()` / `createInlineRegistry()`.
 */
export function registerExtensions(extensions, { registry, inlineRegistry }) {
  if (!Array.isArray(extensions)) {
    fail('registerExtensions', '`extensions` must be an array');
  }
  for (const ext of extensions.flat(Infinity)) {
    if (isExtensionBundle(ext)) {
      registerExtensions([...ext.blocks, ...ext.inlineTypes], { registry, inlineRegistry });
    } else if (isBlockDefinition(ext)) {
      if (!registry) fail('registerExtensions', `no block registry given for "${ext.name}"`);
      registry.register(ext.name, ext);
    } else if (isInlineDefinition(ext)) {
      if (!inlineRegistry) fail('registerExtensions', `no inline registry given for "${ext.name}"`);
      inlineRegistry.register(ext.name, ext);
    } else {
      fail(
        'registerExtensions',
        'each item must be a defineBlock() / defineInline() result or a defineExtension() bundle (missing `kind`)',
      );
    }
  }
}
