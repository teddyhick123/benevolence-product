import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrgImportWorkbench from './OrgImportWorkbench';
import type { ImportJob } from '@/lib/import/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const job: ImportJob = {
  id: 'job-1',
  org_id: 'org-1',
  portfolio_id: 'portfolio-1',
  name: 'Starter migration',
  source_type: 'csv_export',
  source_config: null,
  mapping_profile_id: null,
  status: 'needs_review',
  total_records_extracted: 10,
  records_validated: 8,
  records_loaded: 0,
  records_failed: 2,
  approved_rows: 0,
  rejected_rows: 0,
  error_rows: 1,
  last_heartbeat_at: null,
  started_at: null,
  completed_at: null,
  error_message: null,
  error_details: null,
  reconciliation_data: null,
  created_by: 'user-1',
  reviewed_by: null,
  created_at: '2026-01-15T00:00:00.000Z',
  updated_at: '2026-01-15T00:00:00.000Z',
};

describe('OrgImportWorkbench', () => {
  it('renders org import jobs and calls org-scoped resume endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/resume')) {
        return { ok: true, json: async () => ({ job: { ...job, status: 'processing' } }) };
      }
      if (url === '/api/org/org-1/imports') {
        return { ok: true, json: async () => ({ jobs: [{ ...job, status: 'processing' }] }) };
      }
      return { ok: true, json: async () => ({}) };
    }));

    render(
      <OrgImportWorkbench
        orgId="org-1"
        canManageImports
        initialJobs={[job]}
        portfolios={[{ id: 'portfolio-1', name: 'Main Portfolio', org_id: 'org-1' }]}
      />
    );

    expect(screen.getByText('Starter migration')).toBeInTheDocument();
    expect(screen.getByText('Main Portfolio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resume/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/org/org-1/imports/job-1/resume', { method: 'POST' });
    });
  });

  it('opens the shared wizard with the org import endpoint', () => {
    render(
      <OrgImportWorkbench
        orgId="org-1"
        canManageImports
        initialJobs={[]}
        portfolios={[{ id: 'portfolio-1', name: 'Main Portfolio', org_id: 'org-1' }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New import/i }));
    expect(screen.getByRole('heading', { name: 'New Data Import' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Main Portfolio' })).toBeInTheDocument();
  });

  it('loads org-scoped validation errors and applies a corrected value', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/org/org-1/imports/job-1') {
        return {
          ok: true,
          json: async () => ({
            staging_counts: {
              donors: { total: 0, valid: 0, invalid: 0, pending: 0, warning: 0 },
              investees: { total: 0, valid: 0, invalid: 0, pending: 0, warning: 0 },
              holdings: { total: 1, valid: 0, invalid: 1, pending: 0, warning: 0 },
              contributions: { total: 0, valid: 0, invalid: 0, pending: 0, warning: 0 },
              metrics: { total: 0, valid: 0, invalid: 0, pending: 0, warning: 0 },
            },
          }),
        };
      }
      if (url === '/api/org/org-1/imports/job-1/errors?entity=holdings&limit=25' && init?.method !== 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            rows: [{
              id: 'row-1',
              row_number: 7,
              raw_data: { ein: 'abc' },
              transformed_data: null,
              validation_errors: [{ field: 'ein', message: 'EIN is invalid', severity: 'error' }],
              validation_status: 'invalid',
              action_taken: 'pending',
            }],
            total: 1,
          }),
        };
      }
      if (url === '/api/org/org-1/imports/job-1/errors' && init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ success: true, remaining_errors: 0 }) };
      }
      return { ok: true, json: async () => ({ jobs: [job] }) };
    }));

    render(
      <OrgImportWorkbench
        orgId="org-1"
        canManageImports
        initialJobs={[job]}
        portfolios={[{ id: 'portfolio-1', name: 'Main Portfolio', org_id: 'org-1' }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Review/i }));
    await screen.findByText('EIN is invalid');
    fireEvent.change(screen.getByPlaceholderText('Corrected value'), { target: { value: '12-3456789' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/org/org-1/imports/job-1/errors', expect.objectContaining({
        method: 'PATCH',
      }));
    });
  });
});
