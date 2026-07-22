import { useEditor, NoteloomEditor } from 'noteloom';

// This is the entire quick-start from the README, runnable — no manual
// registry/store wiring, no assembling clipboard/menu/keyboard hooks by
// hand. See examples/basic/ for the same editor built from the granular
// pieces useEditor()/NoteloomEditor() wrap, if you need that level of
// control (a custom toolbar, a subset of block types, voice typing, ...).
export function App() {
  const editor = useEditor();
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <NoteloomEditor editor={editor} />
    </div>
  );
}
