/**
 * Resolves the `dir` attribute a block's editable region/wrapper should
 * render with: the block's own `props.dir` override, else the document
 * root's `props.dir` (a document-wide default), else `'auto'`.
 *
 * `'auto'` is the actual workhorse for multi-language support, not just a
 * fallback: it lets the browser's own Unicode bidi algorithm detect
 * direction per block from its first strong character, which is exactly
 * what a document mixing LTR and RTL blocks (e.g. an English heading over
 * an Arabic paragraph) needs with zero configuration. The explicit
 * override exists for what `auto` can't infer on its own — most commonly
 * an empty block with no text yet to detect a direction from.
 */
export function resolveBlockDir(store, block) {
  if (!block) return 'auto';
  if (block.props?.dir) return block.props.dir;
  const root = store.getBlock(store.getRootId());
  return root?.props?.dir ?? 'auto';
}
