import { useEditor, NoteloomEditor } from 'noteloom';
import './theme.css';

// The only difference from examples/01-quickstart: className (scopes the CSS
// custom property overrides in theme.css to this instance) and
// getBlockClassName (adds a class per-block, based on the block itself).
export function App() {
  const editor = useEditor();
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <NoteloomEditor
        editor={editor}
        className="my-editor"
        getBlockClassName={(block) => (block.type === 'heading' ? 'my-heading' : undefined)}
      />
    </div>
  );
}
