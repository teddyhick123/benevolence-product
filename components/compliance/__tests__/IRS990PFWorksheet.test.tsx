import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import IRS990PFWorksheet from '../IRS990PFWorksheet';

const PORTFOLIO_ID = 'aaaa-0000-0000-0000-bbbbbbbbbbbb';
const MOCK_DATA = {
  portfolio: { id: PORTFOLIO_ID, name: 'Test Foundation' },
  taxYear: 2024,
  grants: [
    {
      id: '1',
      contribution_date: '2024-03-15',
      recipient_name: 'Community Food Bank',
      recipient_ein: '12-3456789',
      contribution_type: 'cash',
      fair_market_value: 50000,
      deductible_amount: 50000,
    },
  ],
  summary: {
    totalQualifyingDistributions: 50000,
    totalGrantAmount: 50000,
    distributionCount: 1,
    fivePercentMinimumDistribution: 40000,
    qualifiesForMinimumDistribution: true,
  },
  pf990: null,
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => MOCK_DATA,
  })) as any;
});

describe('IRS990PFWorksheet', () => {
  it('fetches from 990pf-export endpoint with correct year', async () => {
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/portfolio/${PORTFOLIO_ID}/compliance/990pf-export?year=2024`)
      )
    );
  });

  it('renders qualifying distribution rows', async () => {
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() =>
      expect(screen.getByText('Community Food Bank')).toBeInTheDocument()
    );
  });

  it('shows minimum distribution test result', async () => {
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() =>
      expect(screen.getAllByText(/minimum distribution/i).length).toBeGreaterThan(0)
    );
  });

  it('shows empty state when no grants', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...MOCK_DATA,
        grants: [],
        summary: {
          ...MOCK_DATA.summary,
          distributionCount: 0,
          totalQualifyingDistributions: 0,
        },
      }),
    });
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() =>
      expect(screen.getByText(/no qualifying distributions/i)).toBeInTheDocument()
    );
  });
});
