// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkflowTaskMutationError,
  WorkflowStartInputError,
  createWorkflowRepository,
  createWorkflowTaskRepository,
} from '@/lib/api/repositories/workflows';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom, rpc: mockRpc });
});

describe('createWorkflowRepository', () => {
  it('forces template, portfolio, workflow, and actor into the authorized scope', async () => {
    const templateQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'template-1',
            name: 'Review',
            workflow_type: 'due_diligence',
            steps: [],
          },
          error: null,
        },
      }
    );
    const portfolioQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'portfolio-1' }, error: null } }
    );
    const insertQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'workflow-1' }, error: null } }
    );
    const loadQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'workflow-1', name: 'Review' }, error: null } }
    );
    mockFrom
      .mockReturnValueOnce(templateQuery)
      .mockReturnValueOnce(portfolioQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(loadQuery);

    const workflow = await createWorkflowRepository({
      orgId: 'org-1',
      actorId: 'admin-1',
    }).startWorkflow({
      template_id: 'template-1',
      portfolio_id: 'portfolio-1',
      metadata: {},
    });

    expect(templateQuery.calls).toContainEqual({
      method: 'or',
      args: ['org_id.is.null,org_id.eq.org-1'],
    });
    expect(portfolioQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: 'org-1',
      portfolio_id: 'portfolio-1',
      created_by: 'admin-1',
    }));
    expect(loadQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(workflow).toEqual({ id: 'workflow-1', name: 'Review' });
  });

  it('rejects an assignee outside the authorized org before template reads', async () => {
    const memberQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(memberQuery);

    await expect(createWorkflowRepository({
      orgId: 'org-1',
      actorId: 'admin-1',
    }).startWorkflow({
      template_id: 'template-1',
      portfolio_id: 'portfolio-1',
      assigned_to: 'member-2',
      metadata: {},
    })).rejects.toEqual(expect.objectContaining<Partial<WorkflowStartInputError>>({
      message: 'Assignee is not a member of this organization',
      status: 400,
    }));

    expect(memberQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(memberQuery.calls).toContainEqual({ method: 'eq', args: ['user_id', 'member-2'] });
    expect(memberQuery.calls).toContainEqual({
      method: 'not',
      args: ['accepted_at', 'is', null],
    });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createWorkflowRepository({ orgId: 'org-1', actorId: 'admin-1' });
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});

describe('createWorkflowTaskRepository', () => {
  it('maps transactional authorization failures without falling back to direct writes', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });

    await expect(createWorkflowTaskRepository({
      orgId: 'org-1',
      role: 'viewer',
      actorId: 'member-1',
    }).updateWorkflowTask({
      workflowId: 'workflow-1',
      workflowTaskId: 'workflow-task-1',
      updates: { status: 'completed' },
    })).rejects.toBeInstanceOf(WorkflowTaskMutationError);

    expect(mockRpc).toHaveBeenCalledWith('update_workflow_task_with_linked_task', {
      p_expected_org_id: 'org-1',
      p_workflow_id: 'workflow-1',
      p_workflow_task_id: 'workflow-task-1',
      p_actor_id: 'member-1',
      p_is_workspace_manager: false,
      p_updates: { status: 'completed' },
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('passes manager scope and the validated patch to one atomic RPC', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'workflow-task-1', task_id: 'task-1', status: 'in_progress' },
      error: null,
    });

    const result = await createWorkflowTaskRepository({
      orgId: 'org-1',
      role: 'admin',
      actorId: 'admin-1',
    }).updateWorkflowTask({
      workflowId: 'workflow-1',
      workflowTaskId: 'workflow-task-1',
      updates: { status: 'in_progress' },
    });

    expect(result).toEqual({
      id: 'workflow-task-1',
      task_id: 'task-1',
      status: 'in_progress',
    });
    expect(mockRpc).toHaveBeenCalledWith('update_workflow_task_with_linked_task', {
      p_expected_org_id: 'org-1',
      p_workflow_id: 'workflow-1',
      p_workflow_task_id: 'workflow-task-1',
      p_actor_id: 'admin-1',
      p_is_workspace_manager: true,
      p_updates: { status: 'in_progress' },
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('maps a missing scoped workflow task to a repository 404', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002' } });

    await expect(createWorkflowTaskRepository({
      orgId: 'org-1',
      role: 'admin',
      actorId: 'admin-1',
    }).updateWorkflowTask({
      workflowId: 'workflow-1',
      workflowTaskId: 'workflow-task-1',
      updates: { outcome: 'pass' },
    })).rejects.toEqual(expect.objectContaining<Partial<WorkflowTaskMutationError>>({
      message: 'Workflow task not found',
      status: 404,
    }));
  });
});
