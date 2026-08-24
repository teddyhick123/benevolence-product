import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { requestJson, useApiData } = vi.hoisted(() => ({
  requestJson: vi.fn().mockResolvedValue({ runId: 'run-1' }),
  useApiData: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ requestJson }));
vi.mock('@/lib/api/client-hooks', () => ({ useApiData }));

import AIModelsSettings from '../AIModelsSettings';

const CONNECTION_ID = '00000000-0000-4000-8000-000000000010';
const DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000011';
const SUITE = 'deployment-suite-v1';

function renderWith(verifiedWorkloads: Record<string, unknown>) {
  useApiData.mockReturnValue({
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    data: {
      connections: [{
        id: CONNECTION_ID,
        name: 'Ford OpenRouter',
        connector: 'openrouter',
        status: 'active',
        last_test_status: null,
        credential: { displayHint: '••••cdef' },
      }],
      deployments: [{
        id: DEPLOYMENT_ID,
        connection_id: CONNECTION_ID,
        name: 'Ford Opus 5',
        status: 'active',
        catalog_template_id: 'openrouter-anthropic-claude-opus-5',
        verified_workloads: verifiedWorkloads,
      }],
      routes: [],
      workloads: [{ id: 'assistant', displayName: 'Assistant' }],
      catalog: [{
        id: 'openrouter-anthropic-claude-opus-5',
        displayName: 'Claude Opus 5',
        modelVendor: 'anthropic',
        connector: 'openrouter',
      }],
      usageSummary: {
        periodDays: 30, invocations: 0, failedInvocations: 0,
        inputTokens: 0, outputTokens: 0, reportedCost: 0,
      },
    },
  });
  render(<AIModelsSettings orgId="org-1" />);
}

beforeEach(() => {
  requestJson.mockClear();
  requestJson.mockResolvedValue({ runId: 'run-1' });
});

describe('evaluation and checkbox gating', () => {
  it('starts a run and sends the deployment id', async () => {
    renderWith({});
    fireEvent.click(screen.getByText('Run evaluation'));
    await waitFor(() => {
      const call = requestJson.mock.calls.find(([url]) => String(url).endsWith('/evaluate'));
      expect(call).toBeTruthy();
      expect(String(call![0])).toContain(DEPLOYMENT_ID);
    });
  });

  it('sends no workload list so the server picks what the template supports', async () => {
    renderWith({});
    fireEvent.click(screen.getByText('Run evaluation'));
    await waitFor(() => {
      const call = requestJson.mock.calls.find(([url]) => String(url).endsWith('/evaluate'));
      expect(JSON.parse(call![1].body)).toEqual({});
    });
  });

  it('hides the write-access checkbox once the workload is verified', () => {
    renderWith({
      assistant: { result: 'passed', verifiedAt: new Date().toISOString(), evalSuiteVersion: SUITE },
    });
    fireEvent.change(screen.getByLabelText('Assistant model'), { target: { value: DEPLOYMENT_ID } });

    expect(screen.queryByLabelText(/allow this model to make changes/i)).toBeNull();
    expect(screen.getByText(/granted by evaluation/i)).toBeTruthy();
  });

  it('keeps the checkbox available when the workload is only conditional', () => {
    renderWith({
      assistant: { result: 'conditional', verifiedAt: new Date().toISOString(), evalSuiteVersion: SUITE },
    });
    fireEvent.change(screen.getByLabelText('Assistant model'), { target: { value: DEPLOYMENT_ID } });

    expect(screen.getByLabelText(/allow this model to make changes/i)).toBeTruthy();
  });

  it('keeps the checkbox available when evidence is from a superseded suite', () => {
    renderWith({
      assistant: { result: 'passed', verifiedAt: new Date().toISOString(), evalSuiteVersion: 'phase1-compatibility-v1' },
    });
    fireEvent.change(screen.getByLabelText('Assistant model'), { target: { value: DEPLOYMENT_ID } });

    expect(screen.getByLabelText(/allow this model to make changes/i)).toBeTruthy();
  });

  it('shows per-workload verification state on the deployment', () => {
    renderWith({
      assistant: { result: 'passed', verifiedAt: '2026-08-14T00:00:00.000Z', evalSuiteVersion: SUITE },
    });
    expect(screen.getByText(/^assistant · verified/)).toBeTruthy();
  });

  // Superseded evidence must not read as verified on the deployment card.
  it('marks superseded evidence as needing re-evaluation', () => {
    renderWith({
      assistant: { result: 'passed', verifiedAt: new Date().toISOString(), evalSuiteVersion: 'phase1-compatibility-v1' },
    });
    expect(screen.getByText(/^assistant · needs re-evaluation/)).toBeTruthy();
  });
});
