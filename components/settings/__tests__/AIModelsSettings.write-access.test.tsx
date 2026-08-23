import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { requestJson, useApiData } = vi.hoisted(() => ({
  requestJson: vi.fn().mockResolvedValue({}),
  useApiData: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ requestJson }));
vi.mock('@/lib/api/client-hooks', () => ({ useApiData }));

import AIModelsSettings from '../AIModelsSettings';

const DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000011';

beforeEach(() => {
  requestJson.mockClear();
  useApiData.mockReturnValue({
    isLoading: false,
    error: null,
    mutate: vi.fn(),
    data: {
      connections: [],
      deployments: [{
        id: DEPLOYMENT_ID,
        connection_id: '00000000-0000-4000-8000-000000000010',
        name: 'Ford Sonnet',
        status: 'active',
        catalog_template_id: 'openrouter-anthropic-claude-sonnet',
        verified_workloads: {},
      }],
      routes: [],
      workloads: [{ id: 'assistant', displayName: 'Assistant' }],
      catalog: [],
      usageSummary: {
        periodDays: 30, invocations: 0, failedInvocations: 0,
        inputTokens: 0, outputTokens: 0, reportedCost: 0,
      },
    },
  });
});

// The page renders three selects (connection, catalog, route), so the route
// select is addressed by its accessible name rather than by role alone.
function routeSelect() {
  return screen.getByLabelText('Assistant model');
}

function selectOwnDeployment() {
  render(<AIModelsSettings orgId="org-1" />);
  fireEvent.change(routeSelect(), { target: { value: DEPLOYMENT_ID } });
}

function savedRoutePolicy() {
  const call = requestJson.mock.calls.find(([url]) => String(url).endsWith('/ai-settings/routes'));
  if (!call) throw new Error('route save was not requested');
  return JSON.parse(call[1].body).policy;
}

describe('AIModelsSettings write-access opt-in', () => {
  it('defaults an org deployment to read-only tools', async () => {
    selectOwnDeployment();
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(savedRoutePolicy().mutationTools).toBe('verified_only'));
  });

  it('sends allow_experimental once the admin opts in', async () => {
    selectOwnDeployment();
    fireEvent.click(screen.getByLabelText(/allow this model to make changes/i));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(savedRoutePolicy().mutationTools).toBe('allow_experimental'));
  });

  it('hides the write-access control for the platform default', () => {
    render(<AIModelsSettings orgId="org-1" />);
    fireEvent.change(routeSelect(), { target: { value: 'platform_default' } });

    expect(screen.queryByLabelText(/allow this model to make changes/i)).toBeNull();
  });
});
