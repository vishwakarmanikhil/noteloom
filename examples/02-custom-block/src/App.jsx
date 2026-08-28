import { useEditor, NoteloomEditor, starterKit } from 'noteloom';
import { ratingBlock } from './ratingBlock.js';

// The only difference from examples/01-quickstart: a custom block type
// ("rating"), authored with `defineBlock()` (see ratingBlock.js) and added
// to the editor via the `extensions` array — `starterKit()` is every
// built-in type, spread in so the usual editor is still there. Type
// "/rating" to insert it.
export function App() {
  const editor = useEditor({
    extensions: [...starterKit(), ratingBlock],
  });
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <NoteloomEditor editor={editor} />
    </div>
  );
}
