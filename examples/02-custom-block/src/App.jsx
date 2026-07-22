import { useEditor, NoteloomEditor, registerBuiltInBlocks } from 'noteloom';
import { ratingBlockType } from './ratingBlockType.js';

// The only difference from examples/01-quickstart: a custom block type
// ("rating") registered alongside every built-in one, via useEditor()'s
// registerBlocks callback. Type "/rating" to insert it.
export function App() {
  const editor = useEditor({
    registerBlocks: (registry) => {
      registerBuiltInBlocks(registry);
      registry.register('rating', ratingBlockType);
    },
  });
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <NoteloomEditor editor={editor} />
    </div>
  );
}
