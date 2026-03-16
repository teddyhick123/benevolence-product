import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PayoutTracker from './PayoutTracker';

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

function makeForecast(overrides = {}) {
  return {
    tax_year: 2025,
    distributable_amount: 500_000,
    distributions_to_date: 200_000,
    pipeline_total: 100_000,
    shortfall_before_pipeline: 300_000,
    shortfall_after_pipeline: 200_000,
    on_track: false,
    pct_complete: 40.0,
    days_remaining: 183,
    ...overrides,
  };
}

function makePayout(overrides = {}) {
  return {
    payout_history: null,
    payout_status: null,
    qualifying_distributions: [],
    ...overrides,
  };
}

function mockFetch(forecastData: object, payoutData: object) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('payout-forecast')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(forecastData) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payoutData) });
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PayoutTracker', () => {
  it('shows loading skeleton initially', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    render(<PayoutTracker portfolioId="test-portfolio-id" />);
    // skeleton divs have animate-pulse class
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders pct_complete from forecast', async () => {
    mockFetch(makeForecast({ pct_complete: 40.0 }), makePayout());
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.getByText('40%')).toBeInTheDocument();
    });
  });

  it('shows red shortfall banner when shortfall_after_pipeline > 0', async () => {
    mockFetch(
      makeForecast({ shortfall_after_pipeline: 200_000, on_track: false }),
      makePayout()
    );
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.getByText('Payout Shortfall')).toBeInTheDocument();
    });
  });

  it('does not show shortfall banner when on_track', async () => {
    mockFetch(
      makeForecast({ shortfall_after_pipeline: 0, on_track: true }),
      makePayout()
    );
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.queryByText('Payout Shortfall')).toBeNull();
    });
  });

  it('shows green on-track banner when on_track', async () => {
    mockFetch(
      makeForecast({ shortfall_after_pipeline: 0, on_track: true, pipeline_total: 300_000 }),
      makePayout()
    );
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.getByText('On Track')).toBeInTheDocument();
    });
  });

  it('renders distributable_amount in the stats section', async () => {
    mockFetch(
      makeForecast({ distributable_amount: 500_000 }),
      makePayout()
    );
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.getByText('$500,000')).toBeInTheDocument();
    });
  });

  it('shows category breakdown when distributions are present', async () => {
    mockFetch(
      makeForecast(),
      makePayout({
        qualifying_distributions: [
          { id: '1', category: 'grants_paid', qualifying_amount: 150_000, distribution_date: '2025-03-01', description: 'Grant 1' },
          { id: '2', category: 'program_expenses', qualifying_amount: 50_000, distribution_date: '2025-04-01', description: 'Program' },
        ],
      })
    );
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.getByText('Grants Paid')).toBeInTheDocument();
      expect(screen.getByText('Program Expenses')).toBeInTheDocument();
    });
  });

  it('shows empty state when no distributions', async () => {
    mockFetch(makeForecast(), makePayout({ qualifying_distributions: [] }));
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.getByText(/No qualifying distributions recorded/)).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Server error' }) })));
    render(<PayoutTracker portfolioId="test-portfolio-id" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load forecast/)).toBeInTheDocument();
    });
  });

  it('changes year selection and re-fetches', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('payout-forecast')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeForecast()) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makePayout()) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<PayoutTracker portfolioId="test-portfolio-id" />);
    await waitFor(() => screen.getByText('40%'));

    const select = screen.getByRole('combobox');
    const prevYear = String(new Date().getFullYear() - 1);
    fireEvent.change(select, { target: { value: prevYear } });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([url]) => url);
      expect(calls.some(url => url.includes(`year=${prevYear}`))).toBe(true);
    });
  });
});
