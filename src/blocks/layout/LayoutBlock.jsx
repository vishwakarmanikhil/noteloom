import { BlockChildren } from '../../react/BlockChildren.jsx';

export function LayoutBlock({ id }) {
  return (
    <div className="be-layout" data-block-id={id} style={{ display: 'flex', gap: '1em' }}>
      <BlockChildren parentId={id} />
    </div>
  );
}
