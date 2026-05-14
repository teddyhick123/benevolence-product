import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ExpenditureResponsibilityList from './ExpenditureResponsibilityList';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGrant(overrides = {}) {
  return {
    id: 'er-1',
    grant_id: 'grant-1',
    grantee_name: 'Community Food Bank',
    grant_amount: 50_000,
    grantee_is_public_charity: false,
    grantee_ein: '12-3456789',
    grantee_501c3_verified: false,
    er_agreement_required: true,
    er_agreement_signed_date: '2025-01-15',
    er_reports_required_count: 2,
    er_reports_received_count: 1,
    terminal_report_required: false,
    terminal_report_received: false,
    terminal_report_date: null,
    er_status: 'pending',
    agreement_missing: false,
    reports_deficient: true,
    terminal_report_overdue: false,
    ...overrides,
  };
}

function setupFetch(grants: object[]) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ data: grants }) })
  ));
}

beforeEach(() => vi.restoreAllMocks());

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ExpenditureResponsibilityList', () => {
  it('renders loading skeleton initially', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows empty state when no grants', async () => {
    setupFetch([]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('No ER grants tracked yet.')).toBeInTheDocument();
    });
  });

  it('renders grantee name', async () => {
    setupFetch([makeGrant()]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('Community Food Bank')).toBeInTheDocument();
    });
  });

  it('renders formatted grant amount', async () => {
    setupFetch([makeGrant({ grant_amount: 50_000 })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText(/\$50,000/)).toBeInTheDocument();
    });
  });

  it('shows EIN in grantee row', async () => {
    setupFetch([makeGrant({ grantee_ein: '12-3456789' })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText(/EIN: 12-3456789/)).toBeInTheDocument();
    });
  });

  it('shows deficient banner when grants have issues', async () => {
    setupFetch([makeGrant({ reports_deficient: true })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText(/deficient in expenditure responsibility compliance/)).toBeInTheDocument();
    });
  });

  it('does not show deficient banner when all grants are compliant', async () => {
    setupFetch([makeGrant({
      er_status: 'compliant',
      agreement_missing: false,
      reports_deficient: false,
      terminal_report_overdue: false,
    })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.queryByText(/deficient in expenditure responsibility/)).toBeNull();
    });
  });

  it('shows ER agreement signed date when agreement exists', async () => {
    setupFetch([makeGrant({ er_agreement_signed_date: '2025-01-15' })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Signed 2025-01-15/)).toBeInTheDocument();
    });
  });

  it('shows Missing when ER agreement required but not signed', async () => {
    setupFetch([makeGrant({ er_agreement_required: true, er_agreement_signed_date: null, agreement_missing: true })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('⚠ Missing')).toBeInTheDocument();
    });
  });

  it('shows Not required for public charity ER agreement', async () => {
    setupFetch([makeGrant({ er_agreement_required: false })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('Not required (public charity)')).toBeInTheDocument();
    });
  });

  it('shows report progress count', async () => {
    setupFetch([makeGrant({ er_reports_required_count: 4, er_reports_received_count: 2, er_reports_required: true } as any)]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('2/4')).toBeInTheDocument();
    });
  });

  it('shows status badge', async () => {
    setupFetch([makeGrant({ er_status: 'compliant' })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('compliant')).toBeInTheDocument();
    });
  });

  it('shows Record Report button when reports are pending', async () => {
    setupFetch([makeGrant({ er_reports_required_count: 2, er_reports_received_count: 1 })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('+ Record Report')).toBeInTheDocument();
    });
  });

  it('does not show Record Report button when all reports received', async () => {
    setupFetch([makeGrant({ er_reports_required_count: 2, er_reports_received_count: 2 })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.queryByText('+ Record Report')).toBeNull();
    });
  });

  it('PATCHes with incremented count when Record Report is clicked', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [makeGrant({ er_reports_required_count: 2, er_reports_received_count: 1 })] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);
    await waitFor(() => screen.getByText('+ Record Report'));
    fireEvent.click(screen.getByText('+ Record Report'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      const [, opts] = patchCall!;
      const body = JSON.parse(opts!.body as string);
      expect(body.er_reports_received_count).toBe(2); // 1 + 1
      expect(patchCall![0]).toContain('er-1'); // grant id in URL
    });
  });

  it('shows terminal report Overdue label', async () => {
    setupFetch([makeGrant({
      terminal_report_required: true,
      terminal_report_received: false,
      terminal_report_overdue: true,
    })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    await waitFor(() => {
      expect(screen.getByText('Overdue')).toBeInTheDocument();
    });
  });

  it('shows grant count', async () => {
    setupFetch([makeGrant(), makeGrant({ id: 'er-2', grantee_name: 'Other Org' })]);
    render(<ExpenditureResponsibilityList portfolioId="portfolio-1" />);

    // Wait for grantees to load, then verify count label
    await waitFor(() => {
      expect(screen.getByText('Other Org')).toBeInTheDocument();
    });
    // "2 grants" appears in both the filter bar and the deficient banner
    expect(screen.getAllByText('2 grants').length).toBeGreaterThanOrEqual(1);
  });
});
