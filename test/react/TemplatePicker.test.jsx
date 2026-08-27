import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplatePicker } from '../../src/react/TemplatePicker.jsx';

function makeTemplates() {
  return [
    {
      id: 't1',
      scope: 'document',
      name: 'Meeting notes',
      description: 'Agenda + action items',
      doc: { rootId: 'r1', blocks: [], runs: [] },
    },
    { id: 't2', scope: 'document', name: 'Blank', doc: { rootId: 'r2', blocks: [], runs: [] } },
  ];
}

describe('TemplatePicker', () => {
  it('renders a name + description for each template', () => {
    render(<TemplatePicker templates={makeTemplates()} onSelect={() => {}} />);
    expect(screen.getByText('Meeting notes')).not.toBeNull();
    expect(screen.getByText('Agenda + action items')).not.toBeNull();
    expect(screen.getByText('Blank')).not.toBeNull();
  });

  it('calls onSelect with the exact template object when its "Use" button is clicked', () => {
    const templates = makeTemplates();
    const onSelect = vi.fn();
    render(<TemplatePicker templates={templates} onSelect={onSelect} />);

    const buttons = screen.getAllByText('Use');
    fireEvent.click(buttons[1]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(templates[1]);
  });

  it('shows the empty-state label (customizable) when there are no templates', () => {
    render(<TemplatePicker templates={[]} onSelect={() => {}} emptyLabel="Nothing saved yet" />);
    expect(screen.getByText('Nothing saved yet')).not.toBeNull();
  });

  it('defaults to a generic empty-state label', () => {
    render(<TemplatePicker templates={[]} onSelect={() => {}} />);
    expect(screen.getByText('No templates yet.')).not.toBeNull();
  });
});
