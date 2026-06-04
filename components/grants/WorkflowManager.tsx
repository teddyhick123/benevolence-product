'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { grantStatusBadgeClass } from './grantPalette';

type WorkflowTemplate = {
  id: string;
  name: string;
  workflow_type: string;
  description: string | null;
  steps: Array<{
    id: string;
    name: string;
    description: string;
    required: boolean;
    estimated_days: number;
    order: number;
  }>;
  is_system: boolean;
};

type WorkflowInstance = {
  id: string;
  name: string;
  status: string;
  due_date: string | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  template_name: string;
  workflow_type: string;
  grant_name: string;
  holding_id: string;
  tasks: WorkflowTask[];
};

type WorkflowTask = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  is_required: boolean;
  due_date: string | null;
  outcome: string | null;
  outcome_notes: string | null;
  completed_at: string | null;
  sequence_order: number;
};

interface Props {
  portfolioId: string;
  orgId: string;
}

export default function WorkflowManager({ portfolioId, orgId }: Props) {
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [holdings, setHoldings] = useState<Array<{ id: string; name: string }>>([]);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [newWorkflowData, setNewWorkflowData] = useState({
    holdingId: '',
    templateId: '',
    dueDate: '',
  });
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        const workflowRes = await fetch(`/api/org/${orgId}/workflows?portfolio_id=${portfolioId}&status=all`);
        const workflowJson = await workflowRes.json();
        if (!workflowRes.ok) throw new Error(workflowJson.error || 'Failed to load workflows');

        const processedWorkflows = (workflowJson.workflows || []).map((wf: any) => ({
          id: wf.id,
          name: wf.name,
          status: wf.status,
          due_date: wf.due_date,
          started_at: wf.started_at,
          completed_at: wf.completed_at,
          notes: wf.notes,
          template_name: wf.workflow_templates?.name || 'Unknown',
          workflow_type: wf.workflow_templates?.workflow_type || 'custom',
          grant_name: wf.grants?.holdings?.name || 'Unknown Grant',
          holding_id: wf.grants?.holding_id,
          tasks: (wf.workflow_tasks || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
        }));

        setWorkflows(processedWorkflows);

        const templateRes = await fetch(`/api/org/${orgId}/workflow-templates`);
        const templateJson = await templateRes.json();
        if (!templateRes.ok) throw new Error(templateJson.error || 'Failed to load workflow templates');
        setTemplates(templateJson.templates || []);

        // Fetch grant holdings
        const { data: holdingsData } = await supabase
          .from('holdings')
          .select('id, name')
          .eq('portfolio_id', portfolioId)
          .in('asset_type', ['foundation_grant', 'daf_grant', 'pri', 'mri'])
          .order('name');

        setHoldings(holdingsData || []);
      } catch (err) {
        console.error('Error fetching workflow data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, portfolioId]);

  const formatDate = (date: string | null) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    return grantStatusBadgeClass(status);
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return null;
    return grantStatusBadgeClass(outcome);
  };

  const calculateProgress = (tasks: WorkflowTask[]) => {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / tasks.length) * 100);
  };

  const handleStartWorkflow = async () => {
    if (!newWorkflowData.holdingId || !newWorkflowData.templateId) {
      alert('Please select a grant and template');
      return;
    }

    try {
      const template = templates.find(t => t.id === newWorkflowData.templateId);
      const holding = holdings.find(h => h.id === newWorkflowData.holdingId);

      const res = await fetch(`/api/org/${orgId}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: newWorkflowData.templateId,
          holding_id: newWorkflowData.holdingId,
          portfolio_id: portfolioId,
          name: `${template?.name || 'Workflow'} - ${holding?.name || 'Grant'}`,
          due_date: newWorkflowData.dueDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start workflow');

      // Refresh data
      window.location.reload();
    } catch (err) {
      console.error('Error starting workflow:', err);
      alert('Failed to start workflow');
    }
  };

  const handleCompleteTask = async (workflowId: string, taskId: string, outcome: string) => {
    try {
      const res = await fetch(`/api/org/${orgId}/workflows/${workflowId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          outcome,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to complete task');

      // Refresh data
      window.location.reload();
    } catch (err) {
      console.error('Error completing task:', err);
      alert('Failed to complete task');
    }
  };

  const filteredWorkflows = workflows.filter(wf => {
    if (filter === 'all') return true;
    if (filter === 'active') return wf.status === 'active';
    if (filter === 'completed') return wf.status === 'completed';
    return true;
  });

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-neutral-200 rounded-2xl"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-black/10 rounded-2xl text-sm focus:ring-azure/30 focus:border-azure"
          >
            <option value="active">Active Workflows</option>
            <option value="completed">Completed</option>
            <option value="all">All Workflows</option>
          </select>
          <span className="text-sm text-neutral-500">{filteredWorkflows.length} workflows</span>
        </div>
        <button
          onClick={() => setShowNewWorkflow(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Start Workflow
        </button>
      </div>

      {/* New Workflow Modal */}
      {showNewWorkflow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-ink mb-4">Start New Workflow</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Grant</label>
                <select
                  value={newWorkflowData.holdingId}
                  onChange={(e) => setNewWorkflowData({ ...newWorkflowData, holdingId: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                >
                  <option value="">Select a grant...</option>
                  {holdings.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Workflow Template</label>
                <select
                  value={newWorkflowData.templateId}
                  onChange={(e) => setNewWorkflowData({ ...newWorkflowData, templateId: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.steps.length} steps)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Due Date (optional)</label>
                <input
                  type="date"
                  value={newWorkflowData.dueDate}
                  onChange={(e) => setNewWorkflowData({ ...newWorkflowData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowNewWorkflow(false)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleStartWorkflow}
                className="px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 text-sm font-medium"
              >
                Start Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow List */}
      {filteredWorkflows.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="mt-2 text-neutral-500">No {filter !== 'all' ? filter : ''} workflows found.</p>
          <button
            onClick={() => setShowNewWorkflow(true)}
            className="mt-4 text-azure hover:text-azure/80 text-sm font-medium"
          >
            Start your first workflow
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredWorkflows.map((workflow) => (
            <div key={workflow.id} className="rounded-2xl border border-black/5 bg-white shadow-soft overflow-hidden">
              {/* Workflow Header */}
              <div
                className="px-6 py-4 cursor-pointer hover:bg-neutral-50"
                onClick={() => setExpandedWorkflow(expandedWorkflow === workflow.id ? null : workflow.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <svg
                      className={`w-5 h-5 text-neutral-400 transition-transform ${expandedWorkflow === workflow.id ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div>
                      <h3 className="text-sm font-medium text-ink">{workflow.name}</h3>
                      <p className="text-xs text-neutral-500">
                        {workflow.grant_name} | {workflow.template_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-neutral-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-azure"
                            style={{ width: `${calculateProgress(workflow.tasks)}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-500">{calculateProgress(workflow.tasks)}%</span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">
                        {workflow.tasks.filter(t => t.status === 'completed').length}/{workflow.tasks.length} tasks
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadge(workflow.status)}`}>
                      {workflow.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Task List */}
              {expandedWorkflow === workflow.id && (
                <div className="border-t border-black/5 bg-neutral-50">
                  <div className="px-6 py-3 border-b border-black/5">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>Started: {formatDate(workflow.started_at)}</span>
                      <span>Due: {formatDate(workflow.due_date)}</span>
                    </div>
                  </div>
                  <ul className="divide-y divide-black/5">
                    {workflow.tasks.map((task) => (
                      <li key={task.id} className="px-6 py-4 bg-white">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                              task.status === 'completed' ? 'bg-green-100 text-green-600' :
                              task.status === 'in_progress' ? 'bg-azure/10 text-azure-deep' :
                              'bg-neutral-100 text-neutral-400'
                            }`}>
                              {task.status === 'completed' ? (
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <span className="text-xs font-medium">{task.sequence_order}</span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${task.status === 'completed' ? 'text-neutral-500 line-through' : 'text-ink'}`}>
                                  {task.name}
                                </span>
                                {task.is_required && (
                                  <span className="text-xs text-red-500">Required</span>
                                )}
                                {task.outcome && (
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getOutcomeBadge(task.outcome)}`}>
                                    {task.outcome}
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-xs text-neutral-500 mt-1">{task.description}</p>
                              )}
                              {task.outcome_notes && (
                                <p className="text-xs text-neutral-600 mt-1 italic">{task.outcome_notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {task.due_date && (
                              <span className="text-xs text-neutral-500">{formatDate(task.due_date)}</span>
                            )}
                            {task.status !== 'completed' && workflow.status === 'active' && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleCompleteTask(workflow.id, task.id, 'pass')}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  title="Pass"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleCompleteTask(workflow.id, task.id, 'fail')}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                  title="Fail"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
