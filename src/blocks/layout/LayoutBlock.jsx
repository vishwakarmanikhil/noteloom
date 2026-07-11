import { BlockChildren } from '../../react/BlockChildren.jsx';
import { useBlock } from '../../react/useBlock.js';
import { useBlockClassName } from '../../react/EditorProvider.jsx';

export function LayoutBlock({ id }) {
  const block = useBlock(id);
  const className = useBlockClassName('be-layout', block);
  return (
    <div className={className} data-block-id={id} style={{ display: 'flex', gap: '1em' }}>
      <BlockChildren parentId={id} />
    </div>
  );
}
