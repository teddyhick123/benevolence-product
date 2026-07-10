import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import WorkbenchHomePanel from './WorkbenchHomePanel';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkbenchHomePanel', () => {
  it('renders activation signals from the org dashboard workbench summary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        org: { id: 'org-1', name: 'Example Foundation' },
        setup_progress: {
          completed_count: 1,
          total_count: 3,
          tasks: [
            { id: 'profile', label: 'Complete organization profile', completed: true },
            { id: 'grant', label: 'Create a grant record', completed: false },
          ],
        },
        workbench: {
          next_actions: [
            {
              id: 'first_import',
              label: 'Import source data',
              description: 'Upload the first operating dataset for cleanup and review.',
              href: '/admin/upload?portfolio_id=portfolio-1',
              priority: 'high',
            },
          ],
          data_health: {
            score: 91,
            records_checked: 12,
            issues: [
              { id: 'missing_eins', label: 'Missing EINs', count: 2, severity: 'warning', href: '/dashboard/holdings' },
              { id: 'duplicates', label: 'Possible duplicates', count: 0, severity: 'ok', href: '/dashboard/holdings' },
              { id: 'import_errors', label: 'Import errors', count: 0, severity: 'ok', href: '/admin/imports' },
              { id: 'review_imports', label: 'Imports needing review', count: 1, severity: 'warning', href: '/admin/imports' },
            ],
          },
          imports: {
            total_recent: 1,
            recent: [
              {
                id: 'job-1',
                name: 'January import',
                status: 'needs_review',
                total_records_extracted: 10,
                records_loaded: 7,
                records_failed: 1,
                error_rows: 1,
                created_at: '2026-01-15T00:00:00.000Z',
              },
            ],
          },
          builder: {
            pending_proposals: 2,
            configured_layers: {
              workflow_items: 3,
              custom_fields: 1,
              automation_rules: 1,
              ai_context_items: 2,
              view_preferences: 4,
            },
          },
          usage: {
            plan: 'starter',
            imports_used: 1,
            imports_limit: 5,
            ai_calls_used: null,
            ai_calls_limit: null,
          },
        },
      }),
    })));

    render(<WorkbenchHomePanel orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Import source data' })).toBeInTheDocument();
    });

    expect(screen.getByText('Missing EINs')).toBeInTheDocument();
    expect(screen.getByText('91/100')).toBeInTheDocument();
    expect(screen.getByText('Pending proposals')).toBeInTheDocument();
    expect(screen.getByText('January import')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Upload data/i })).toHaveAttribute(
      'href',
      '/org/org-1/data'
    );
  });
});
