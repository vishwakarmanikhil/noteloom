/**
 * A plain, unopinionated list of templates (name + description, each with a
 * "Use" button) — not wrapped in a Modal/popover itself, since it's reused
 * for genuinely different contexts (a "new document" starter-template
 * gallery, an in-editor "insert a saved snippet" picker). Wrap it in the
 * exported `Modal` component yourself, or render it inline on a page —
 * whichever fits the host app.
 *
 * Feed it `templates` from `useTemplates()` (or `listTemplates()` directly);
 * `onSelect(template)` receives the whole stored template object — what to
 * do with it (apply/insert it, or just read its `.doc`) is the caller's
 * call, since that differs by scope (see README's "Templates" section).
 */
export function TemplatePicker({ templates, onSelect, emptyLabel = 'No templates yet.' }) {
  if (templates.length === 0) {
    return <p className="be-template-picker-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="be-template-picker" role="list">
      {templates.map((template) => (
        <li key={template.id} className="be-template-card">
          <div className="be-template-card-body">
            <span className="be-template-card-name">{template.name}</span>
            {template.description && (
              <span className="be-template-card-description">{template.description}</span>
            )}
          </div>
          <button
            type="button"
            className="be-template-card-select"
            onClick={() => onSelect(template)}
          >
            Use
          </button>
        </li>
      ))}
    </ul>
  );
}
