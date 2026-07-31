// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkflowTaskMutationError,
  WorkflowStartInputError,
  createWorkflowRepository,
  createWorkflowTaskRepository,
} from '@/lib/api/repositories/workflows';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
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
  it('checks the parent workflow org before applying assignee authorization', async () => {
    const existingQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'workflow-task-1',
            tasks: { assigned_to: 'member-2' },
            workflow_instances: { org_id: 'org-1' },
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(existingQuery);

    await expect(createWorkflowTaskRepository({
      orgId: 'org-1',
      role: 'viewer',
      actorId: 'member-1',
    }).updateWorkflowTask({
      workflowId: 'workflow-1',
      workflowTaskId: 'workflow-task-1',
      updates: { status: 'completed' },
    })).rejects.toBeInstanceOf(WorkflowTaskMutationError);

    expect(existingQuery.calls).toContainEqual({
      method: 'eq',
      args: ['workflow_instances.org_id', 'org-1'],
    });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('scopes linked task and event synchronization to the workflow org and actor', async () => {
    const existingQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'workflow-task-1',
            status: 'pending',
            completed_at: null,
            completed_by: null,
            outcome: null,
            outcome_notes: null,
            tasks: {
              id: 'task-1',
              assigned_to: 'member-1',
              status: 'open',
              completed_at: null,
              completed_by: null,
            },
            workflow_instances: { id: 'workflow-1', org_id: 'org-1', status: 'active' },
          },
          error: null,
        },
      }
    );
    const workflowTaskUpdate = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'workflow-task-1', task_id: 'task-1' }, error: null } }
    );
    const taskUpdate = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'task-1', status: 'in_progress' }, error: null } }
    );
    const eventInsert = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(existingQuery)
      .mockReturnValueOnce(workflowTaskUpdate)
      .mockReturnValueOnce(taskUpdate)
      .mockReturnValueOnce(eventInsert);

    await createWorkflowTaskRepository({
      orgId: 'org-1',
      role: 'viewer',
      actorId: 'member-1',
    }).updateWorkflowTask({
      workflowId: 'workflow-1',
      workflowTaskId: 'workflow-task-1',
      updates: { status: 'in_progress' },
    });

    expect(taskUpdate.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(eventInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-1',
      org_id: 'org-1',
      actor_id: 'member-1',
      event_type: 'status_changed',
    }));
  });
});
