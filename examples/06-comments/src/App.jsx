import { useEditor, NoteloomEditor, registerBuiltInBlocks } from 'noteloom';

// Set this to whichever user is "logged in" for this demo -- every reply
// composed through the built-in UI below is attributed to it.
const AUTHOR_ID = 'You';

const initialDoc = {
  rootId: 'root',
  blocks: [
    { id: 'root', type: 'page', parentId: null, contentIds: ['p1'], props: {} },
    { id: 'p1', type: 'paragraph', parentId: 'root', contentIds: ['r1'], props: {} },
  ],
  runs: [
    {
      id: 'r1',
      type: 'text',
      value:
        'Select some text below and click the comment icon in the floating toolbar to leave feedback. Click highlighted text to view, reply, resolve, or delete a comment.',
      marks: {},
    },
  ],
};

export function App() {
  const editor = useEditor({ doc: initialDoc, registerBlocks: registerBuiltInBlocks });

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 24px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 20 }}>Comments demo</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
        The whole experience here — the floating toolbar's Comment button, the popover that opens
        when you click or hover over highlighted text, and the panel on the right — is built into
        the package. Nothing on this page writes any comment UI of its own; it just sets{' '}
        <code>commentAuthorId</code> and <code>showCommentsPanel</code>.
      </p>
      {/* commentAuthorId enables the whole built-in comments UI with zero
          host code: the floating toolbar's Comment button opens a small
          composer, clicking/hovering existing highlighted text opens a
          popover (view/reply/resolve/delete), and showCommentsPanel adds
          the right-side thread list (Notion/Google Docs-style). For full
          control instead (your own compose UI), pass onComment and skip
          commentAuthorId -- see the README's "Comments" section. */}
      <NoteloomEditor editor={editor} commentAuthorId={AUTHOR_ID} showCommentsPanel />
    </div>
  );
}
