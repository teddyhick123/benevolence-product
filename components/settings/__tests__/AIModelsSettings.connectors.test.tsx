import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { requestJson, useApiData } = vi.hoisted(() => ({
  requestJson: vi.fn().mockResolvedValue({}),
  useApiData: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ requestJson }));
vi.mock('@/lib/api/client-hooks', () => ({ useApiData }));

// AIUsagePanel is rendered by AIModelsSettings but is not what these suites
// are about; it has its own test file.
vi.mock('@/components/settings/AIUsagePanel', () => ({
  default: () => null,
}));

import AIModelsSettings from '../AIModelsSettings';

const API_KEY = 'sk-test-0123456789abcdef';
const OPENROUTER_CONNECTION = '00000000-0000-4000-8000-000000000010';
const ANTHROPIC_CONNECTION = '00000000-0000-4000-8000-000000000020';

beforeEach(() => {
  requestJson.mockClear();
  useApiData.mockReturnValue({
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    data: {
      connections: [
        {
          id: OPENROUTER_CONNECTION,
          name: 'Ford OpenRouter',
          connector: 'openrouter',
          status: 'active',
          last_test_status: null,
          credential: { displayHint: '••••cdef' },
        },
        {
          id: ANTHROPIC_CONNECTION,
          name: 'Ford Anthropic',
          connector: 'anthropic',
          status: 'active',
          last_test_status: null,
          credential: { displayHint: '••••cdef' },
        },
      ],
      deployments: [],
      routes: [],
      workloads: [{ id: 'assistant', displayName: 'Assistant' }],
      catalog: [
        { id: 'openrouter-anthropic-claude-opus-5', displayName: 'Claude Opus 5', modelVendor: 'anthropic', connector: 'openrouter' },
        { id: 'anthropic-claude-opus-5', displayName: 'Claude Opus 5 (direct)', modelVendor: 'anthropic', connector: 'anthropic' },
      ],
      usageSummary: {
        periodDays: 30, invocations: 0, failedInvocations: 0,
        inputTokens: 0, outputTokens: 0, reportedCost: 0,
      },
    },
  });
});

function submitConnection(connector: string) {
  render(<AIModelsSettings orgId="org-1" />);
  fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: connector } });
  fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: API_KEY } });
  fireEvent.click(screen.getByText('Add connection'));
}

function savedConnectionBody() {
  const call = requestJson.mock.calls.find(([url]) => String(url).endsWith('/ai-settings/connections'));
  if (!call) throw new Error('connection save was not requested');
  return JSON.parse(call[1].body);
}

describe('AIModelsSettings provider picker', () => {
  it('sends the chosen direct Anthropic connector', async () => {
    submitConnection('anthropic');
    await waitFor(() => expect(savedConnectionBody().connector).toBe('anthropic'));
  });

  it('sends the chosen direct OpenAI connector', async () => {
    submitConnection('openai');
    await waitFor(() => expect(savedConnectionBody().connector).toBe('openai'));
  });

  it('still supports OpenRouter', async () => {
    submitConnection('openrouter');
    await waitFor(() => expect(savedConnectionBody().connector).toBe('openrouter'));
  });

  it('shows provider-specific credential guidance', () => {
    render(<AIModelsSettings orgId="org-1" />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'anthropic' } });
    expect(screen.getByText(/console\.anthropic\.com/i)).toBeTruthy();
  });
});

describe('AIModelsSettings deployment template picker', () => {
  it('offers only templates the chosen connection can run', () => {
    render(<AIModelsSettings orgId="org-1" />);
    fireEvent.change(screen.getByLabelText(/connection/i), { target: { value: ANTHROPIC_CONNECTION } });

    expect(screen.queryByText(/Claude Opus 5 \(direct\)/)).toBeTruthy();
    // The OpenRouter-slug template must not be attachable to a direct key.
    expect(screen.queryByText(/^Claude Opus 5 · anthropic$/)).toBeNull();
  });
});
