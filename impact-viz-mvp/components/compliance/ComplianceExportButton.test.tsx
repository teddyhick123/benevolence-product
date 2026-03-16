import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ComplianceExportButton from './ComplianceExportButton';

beforeEach(() => {
  vi.restoreAllMocks();
  // jsdom doesn't implement URL.createObjectURL / revokeObjectURL
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ComplianceExportButton', () => {
  it('renders Export button', () => {
    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('dropdown is hidden initially', () => {
    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    expect(screen.queryByText('990-PF Data (JSON)')).toBeNull();
  });

  it('opens dropdown on Export click', () => {
    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    fireEvent.click(screen.getByText('Export'));

    expect(screen.getByText('990-PF Data (JSON)')).toBeInTheDocument();
    expect(screen.getByText('Qualifying Distributions (CSV)')).toBeInTheDocument();
  });

  it('shows tax year in dropdown header', () => {
    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    fireEvent.click(screen.getByText('Export'));

    expect(screen.getByText('Tax year 2025')).toBeInTheDocument();
  });

  it('fetches correct URL for 990-PF JSON export', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['{}'], { type: 'application/json' })) })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByText('990-PF Data (JSON)'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/portfolio/p-1/compliance/990pf-export?year=2025&format=json')
      );
    });
  });

  it('fetches correct URL for CSV export', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['a,b'], { type: 'text/csv' })) })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByText('Qualifying Distributions (CSV)'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/portfolio/p-1/compliance/990pf-export?year=2025&format=csv')
      );
    });
  });

  it('shows error message when export fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Export unavailable' }),
      })
    ));

    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByText('990-PF Data (JSON)'));

    await waitFor(() => {
      expect(screen.getByText('Export unavailable')).toBeInTheDocument();
    });
  });

  it('closes dropdown when clicking outside overlay', () => {
    render(<ComplianceExportButton portfolioId="p-1" taxYear={2025} />);
    fireEvent.click(screen.getByText('Export'));
    expect(screen.getByText('Export Compliance Data')).toBeInTheDocument();

    // The fixed inset-0 overlay div closes the dropdown
    const overlay = document.querySelector('.fixed.inset-0.z-10');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    expect(screen.queryByText('Export Compliance Data')).toBeNull();
  });
});
