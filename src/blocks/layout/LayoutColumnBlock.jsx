import { BlockChildren } from '../../react/BlockChildren.jsx';

// Identical container mechanism to Page — a column just holds arbitrary
// child blocks via contentIds, same as the document root does.
export function LayoutColumnBlock({ id }) {
  return (
    <div className="be-layout-column" data-block-id={id}>
      <BlockChildren parentId={id} />
    </div>
  );
}
