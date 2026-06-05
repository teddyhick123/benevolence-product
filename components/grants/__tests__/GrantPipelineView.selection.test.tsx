import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GrantPipelineView, { type GrantListItem } from '../GrantPipelineView';

const mockGrant: GrantListItem = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  holding_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  lifecycle_stage: 'draft',
  requested_amount: 50000,
  approved_amount: null,
  currency: 'USD',
  grant_period_end: null,
  risk_level: null,
  internal_owner_id: null,
  holdings: { name: 'Test Foundation Grant' },
};

const mockGrant2: GrantListItem = {
  ...mockGrant,
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  lifecycle_stage: 'prospect',
  holdings: { name: 'Another Grant' },
};

describe('GrantPipelineView — selection mode', () => {
  it('does not render checkboxes when selectionMode is false', () => {
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={false}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={vi.fn()}
      />
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('renders a checkbox for each card when selectionMode is true', () => {
    render(
      <GrantPipelineView
        grants={[mockGrant, mockGrant2]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={vi.fn()}
      />
    );
    // One checkbox per grant card + one per column header = at least 2 grant checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onToggleSelect with the grant id when a card checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={onToggle}
        onSelectAllInStage={vi.fn()}
      />
    );
    // Find card-level checkboxes (data-grant-id attribute)
    const cardCheckbox = document.querySelector(`input[data-grant-id="${mockGrant.id}"]`);
    expect(cardCheckbox).not.toBeNull();
    fireEvent.click(cardCheckbox!);
    expect(onToggle).toHaveBeenCalledWith(mockGrant.id);
  });

  it('calls onSelectAllInStage with stage and ids when column header checkbox is clicked', () => {
    const onSelectAll = vi.fn();
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={onSelectAll}
      />
    );
    const headerCheckbox = document.querySelector(`input[data-stage-header="draft"]`);
    expect(headerCheckbox).not.toBeNull();
    fireEvent.click(headerCheckbox!);
    expect(onSelectAll).toHaveBeenCalledWith('draft', [mockGrant.id]);
  });

  it('renders card as non-navigating div (not Link) in selection mode', () => {
    render(
      <GrantPipelineView
        grants={[mockGrant]}
        selectionMode={true}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onSelectAllInStage={vi.fn()}
      />
    );
    // In selection mode the card should not be an anchor tag
    const card = document.querySelector(`[data-grant-id="${mockGrant.id}"]`)?.closest('[data-card]');
    // The card container should not be an <a> element
    const links = screen.queryAllByRole('link');
    const grantLink = links.find(l => l.getAttribute('href')?.includes(mockGrant.id));
    expect(grantLink).toBeUndefined();
  });
});
