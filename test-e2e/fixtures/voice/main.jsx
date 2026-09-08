import { createRoot } from 'react-dom/client';
import { useEditor, NoteloomEditor } from 'noteloom';
import { useVoiceTyping, VoicePermissionModal, VoiceListeningIndicator } from 'noteloom/voice';

// The voice-permission e2e spec drives this page: NoteloomEditor's `voice`
// prop (see FloatingToolbar's own doc comment) wired to a real
// useVoiceTyping() from the separate noteloom/voice entry point, exactly the
// pattern the guide documents -- this fixture exists because no example app
// wires that combination yet.
function App() {
  const editor = useEditor({
    doc: {
      version: 1,
      blocks: [{ id: 'p1', type: 'paragraph', data: { text: 'select this text' } }],
    },
  });
  // An explicit `store` is required here: <NoteloomEditor> creates its own
  // <EditorProvider> internally, and this call sits outside it.
  const voice = useVoiceTyping({ store: editor.store });

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 24px' }}>
      <NoteloomEditor editor={editor} voice={voice} />
      <VoicePermissionModal voice={voice} />
      <VoiceListeningIndicator voice={voice} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
