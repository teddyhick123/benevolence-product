import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import IRS990PFWorksheet from '../IRS990PFWorksheet';

const PORTFOLIO_ID = 'aaaa-0000-0000-0000-bbbbbbbbbbbb';
const MOCK_DATA = {
  portfolio: { id: PORTFOLIO_ID, name: 'Test Foundation' },
  tax_year: 2024,
  generated_at: '2026-06-13T00:00:00Z',
  part_i: { net_investment_income: null, excise_tax_amount: null, excise_tax_rate: 1.39, total_grants: 50000, total_expenses: null },
  part_xi: {
    fair_market_value_assets: 800000,
    required_payout: 40000,
    actual_payout: 50000,
    payout_deficit: null,
    qualifying_distributions_total: 50000,
  },
  part_xii: {
    grants_count: 1,
    grants_total: 50000,
    qualifying_distributions_total: 50000,
    grants_detail: [
      {
        id: '1',
        date: '2024-03-15',
        recipient: 'Community Food Bank',
        recipient_ein: '12-3456789',
        recipient_type: 'public_charity',
        amount: 50000,
        deductible_amount: 50000,
        type: 'cash',
        description: null,
      },
    ],
  },
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
        part_xii: {
          ...MOCK_DATA.part_xii,
          grants_detail: [],
          grants_count: 0,
          qualifying_distributions_total: 0,
        },
      }),
    });
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() =>
      expect(screen.getByText(/no qualifying distributions/i)).toBeInTheDocument()
    );
  });
});
