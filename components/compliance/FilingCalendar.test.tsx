import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FilingCalendar from './FilingCalendar';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFiling(overrides = {}) {
  return {
    id: 'filing-1',
    filing_type: '990_pf',
    tax_year: 2025,
    jurisdiction: 'federal',
    description: null,
    due_date: '2026-05-15',
    extended_due_date: null,
    status: 'pending',
    filed_date: null,
    confirmation_number: null,
    urgency: 'low',
    days_until_due: 90,
    ...overrides,
  };
}

function setupFetch(filings: object[]) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ data: filings }) })
  ));
}

beforeEach(() => vi.restoreAllMocks());

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FilingCalendar', () => {
  it('renders loading skeleton initially', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    render(<FilingCalendar orgId="org-1" />);
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows empty state when no filings', async () => {
    setupFetch([]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('No filings found.')).toBeInTheDocument();
    });
  });

  it('renders filing type label for 990-PF', async () => {
    setupFetch([makeFiling({ filing_type: '990_pf' })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('Form 990-PF')).toBeInTheDocument();
    });
  });

  it('renders tax year for each filing', async () => {
    setupFetch([makeFiling({ tax_year: 2025 })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('TY 2025')).toBeInTheDocument();
    });
  });

  it('shows OVERDUE badge for overdue status', async () => {
    setupFetch([makeFiling({ status: 'overdue', days_until_due: -5 })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('OVERDUE')).toBeInTheDocument();
    });
  });

  it('shows day countdown badge for critical filings (≤7d)', async () => {
    setupFetch([makeFiling({ status: 'pending', days_until_due: 5 })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('5d')).toBeInTheDocument();
    });
  });

  it('does not show Mark Filed button for already-filed filings', async () => {
    setupFetch([makeFiling({ status: 'filed', filed_date: '2025-05-10' })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Mark Filed')).toBeNull();
    });
  });

  it('shows Mark Filed button for pending filings', async () => {
    setupFetch([makeFiling({ status: 'pending' })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('Mark Filed')).toBeInTheDocument();
    });
  });

  it('opens Mark Filed modal when button clicked', async () => {
    setupFetch([makeFiling({ status: 'pending' })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => screen.getByText('Mark Filed'));
    fireEvent.click(screen.getByText('Mark Filed'));

    expect(screen.getByText('Mark as Filed')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Optional')).toBeInTheDocument();
  });

  it('closes Mark Filed modal on Cancel', async () => {
    setupFetch([makeFiling({ status: 'pending' })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => screen.getByText('Mark Filed'));
    fireEvent.click(screen.getByText('Mark Filed'));
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Mark as Filed')).toBeNull();
    });
  });

  it('POSTs with status=filed when Mark Filed is submitted', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [makeFiling({ status: 'pending' })] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<FilingCalendar orgId="org-1" />);
    await waitFor(() => screen.getByText('Mark Filed'));
    fireEvent.click(screen.getByText('Mark Filed'));

    // Click the "Mark Filed" button in the modal (there are now two: the link and the modal button)
    const markFiledButtons = screen.getAllByText('Mark Filed');
    // The modal button is the last one
    fireEvent.click(markFiledButtons.at(-1)!);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'POST');
      expect(postCall).toBeTruthy();
      const [, opts] = postCall!;
      const body = JSON.parse(opts!.body as string);
      expect(body.status).toBe('filed');
    });
  });

  it('opens Add Filing modal', async () => {
    setupFetch([]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => screen.getByText('+ Add Filing'));
    fireEvent.click(screen.getByText('+ Add Filing'));

    expect(screen.getByText('Add Filing Deadline')).toBeInTheDocument();
    expect(screen.getByText('Due Date *')).toBeInTheDocument();
  });

  it('closes Add Filing modal on Cancel', async () => {
    setupFetch([]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => screen.getByText('+ Add Filing'));
    fireEvent.click(screen.getByText('+ Add Filing'));
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Add Filing Deadline')).toBeNull();
    });
  });

  it('displays state jurisdiction badge when jurisdiction is not federal', async () => {
    setupFetch([makeFiling({ jurisdiction: 'ca' })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('CA')).toBeInTheDocument();
    });
  });

  it('uses extended_due_date when available', async () => {
    setupFetch([makeFiling({ extended_due_date: '2026-08-15' })]);
    render(<FilingCalendar orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Due: 2026-08-15/)).toBeInTheDocument();
    });
  });

  it('appends status filter to fetch URL', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<FilingCalendar orgId="org-1" />);
    await waitFor(() => screen.getByText('No filings found.'));

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'overdue' } });

    await waitFor(() => {
      const calls = (fetchMock.mock.calls as any[]).map(([url]) => url);
      expect(calls.some(url => String(url).includes('status=overdue'))).toBe(true);
    });
  });
});
