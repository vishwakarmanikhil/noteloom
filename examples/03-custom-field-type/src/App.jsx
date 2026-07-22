import { useEditor, NoteloomEditor, registerBuiltInInlineTypes, createSelectFieldType } from 'noteloom';

// createSelectFieldType() builds a full inline type from a plain config
// object -- no component to write. Type "/status" (or "/Status") to insert it.
const statusFieldType = createSelectFieldType({
  type: 'status', // must match the key it's registered under, below
  label: 'Status', // shown in the "/" menu and as the search box's aria-label
  placeholder: 'Set status…',
  variant: 'tag', // colored pill, instead of a plain bordered dropdown
  options: [
    { value: 'todo', label: 'To do', color: { bg: '#e9e9e7', text: '#37352f' } },
    { value: 'doing', label: 'In progress', color: { bg: '#fdecc8', text: '#a06400' } },
    { value: 'done', label: 'Done', color: { bg: '#dbeddb', text: '#2f7a2f' } },
  ],
});

// The only difference from examples/01-quickstart: a custom inline type
// ("status") registered alongside every built-in one, via useEditor()'s
// registerInlineTypes callback.
export function App() {
  const editor = useEditor({
    registerInlineTypes: (inlineRegistry) => {
      registerBuiltInInlineTypes(inlineRegistry);
      inlineRegistry.register('status', statusFieldType);
    },
  });
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <NoteloomEditor editor={editor} />
    </div>
  );
}
