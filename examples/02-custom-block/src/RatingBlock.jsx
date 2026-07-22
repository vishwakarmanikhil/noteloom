import { useBlock, useEditorStore, operations } from 'noteloom';

const STAR_COUNT = 5;

function Star({ filled, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1, padding: 0, color: filled ? '#f5a623' : '#d1d5db' }}
    >
      ★
    </button>
  );
}

// A block doesn't have to hold text at all -- see ratingBlockType.js for the
// registry entry (isLeaf: false, contentIds always empty). This one keeps a
// plain number in `props.value` and renders it as clickable stars.
export function RatingBlock({ id }) {
  const store = useEditorStore();
  const block = useBlock(id);
  if (!block) return null;
  const value = block.props?.value ?? 0;

  return (
    <div data-block-id={id} contentEditable={false} style={{ display: 'flex', gap: 4, margin: '0.4em 0' }}>
      {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((n) => (
        <Star
          key={n}
          filled={n <= value}
          label={`Rate ${n} out of ${STAR_COUNT}`}
          onClick={() => store.applyOperation(operations.updateBlockProps(id, { value: n }))}
        />
      ))}
    </div>
  );
}
