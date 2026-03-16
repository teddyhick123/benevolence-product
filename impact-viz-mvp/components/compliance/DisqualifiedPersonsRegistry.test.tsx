import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DisqualifiedPersonsRegistry from './DisqualifiedPersonsRegistry';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTIVE_PERSON = {
  id: 'person-1',
  full_name: 'Jane Smith',
  relationship_type: 'founder',
  title_or_role: 'Executive Director',
  ein: null,
  ssn_last4: '1234',
  start_date: '2020-01-01',
  end_date: null,
  is_active: true,
  notes: null,
};

const TERMINATED_PERSON = {
  ...ACTIVE_PERSON,
  id: 'person-2',
  full_name: 'Bob Johnson',
  relationship_type: 'foundation_manager',
  title_or_role: null,
  end_date: '2023-06-01',
  is_active: false,
};

function setupFetch(persons: object[]) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ data: persons }) })
  ));
}

beforeEach(() => vi.restoreAllMocks());

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DisqualifiedPersonsRegistry', () => {
  it('renders the quick-screen panel', async () => {
    setupFetch([]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);
    expect(screen.getByText('Quick Transaction Screen')).toBeInTheDocument();
  });

  it('renders active persons from the API', async () => {
    setupFetch([ACTIVE_PERSON]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Executive Director')).toBeInTheDocument();
    });
  });

  it('shows relationship type badge', async () => {
    setupFetch([ACTIVE_PERSON]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('Founder')).toBeInTheDocument();
    });
  });

  it('shows masked SSN', async () => {
    setupFetch([ACTIVE_PERSON]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText(/\*\*\*-\*\*-1234/)).toBeInTheDocument();
    });
  });

  it('shows Active badge for active persons', async () => {
    setupFetch([ACTIVE_PERSON]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('shows Terminate button only for active persons', async () => {
    setupFetch([ACTIVE_PERSON, TERMINATED_PERSON]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => {
      const terminateButtons = screen.getAllByText('Terminate');
      // Only one Terminate button (for the active person)
      expect(terminateButtons).toHaveLength(1);
    });
  });

  it('shows empty state when no persons', async () => {
    setupFetch([]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText(/No disqualified persons registered/)).toBeInTheDocument();
    });
  });

  it('opens Add Person modal on button click', async () => {
    setupFetch([]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => screen.getByText('+ Add Person'));
    fireEvent.click(screen.getByText('+ Add Person'));

    expect(screen.getByText('Register Disqualified Person')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Jane Smith')).toBeInTheDocument();
  });

  it('closes Add Person modal on Cancel', async () => {
    setupFetch([]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => screen.getByText('+ Add Person'));
    fireEvent.click(screen.getByText('+ Add Person'));
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Register Disqualified Person')).toBeNull();
    });
  });

  it('performs a quick screen and shows no-match result', async () => {
    setupFetch([]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => screen.getByPlaceholderText('Enter counterparty name to screen...'));
    const input = screen.getByPlaceholderText('Enter counterparty name to screen...');
    fireEvent.change(input, { target: { value: 'Unknown Vendor' } });
    fireEvent.click(screen.getByText('Screen'));

    await waitFor(() => {
      expect(screen.getByText(/No disqualified person match found/)).toBeInTheDocument();
    });
  });

  it('performs a quick screen and shows match result', async () => {
    setupFetch([ACTIVE_PERSON]);
    render(<DisqualifiedPersonsRegistry orgId="org-1" />);

    await waitFor(() => screen.getByPlaceholderText('Enter counterparty name to screen...'));
    const input = screen.getByPlaceholderText('Enter counterparty name to screen...');
    fireEvent.change(input, { target: { value: 'Jane Smith' } });
    fireEvent.click(screen.getByText('Screen'));

    await waitFor(() => {
      expect(screen.getByText(/potential match/i)).toBeInTheDocument();
    });
  });

  it('POSTs to the correct endpoint when adding a person', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DisqualifiedPersonsRegistry orgId="org-1" />);
    await waitFor(() => screen.getByText('+ Add Person'));
    fireEvent.click(screen.getByText('+ Add Person'));

    // Fill in required field
    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), { target: { value: 'Test Person' } });
    fireEvent.click(screen.getByText('Add to Registry'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(postCall![0]).toContain('/api/org/org-1/compliance/disqualified-persons');
    });
  });
});
