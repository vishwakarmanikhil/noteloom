import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useBlockClassName } from '../../react/EditorProvider.jsx';

// Identical container mechanism to Page — a column just holds arbitrary
// child blocks via contentIds, same as the document root does.
export function LayoutColumnBlock({ id }) {
  const block = useBlock(id);
  const className = useBlockClassName('be-layout-column', block);
  return (
    <div className={className} data-block-id={id}>
      <BlockChildren parentId={id} />
    </div>
  );
}
