'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Plus,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { getEntityUrl } from '@/lib/tasks/entity-links';

type Member = {
  user_id: string;
  role: string;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  task_type: string;
  source: string;
  due_at: string | null;
  assigned_to: string | null;
  created_at: string;
  assignee?: { full_name?: string | null; email?: string | null } | null;
  task_entity_links?: Array<{ entity_type: string; entity_id: string; relationship: string }>;
};

interface Props {
  orgId: string;
  members: Member[];
  currentUserId: string;
  currentRole: string;
}

const TABS = [
  { id: 'mine', label: 'Mine' },
  { id: 'open', label: 'Open' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'due_soon', label: 'Due Soon' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'all', label: 'All' },
];

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  waiting: 'Waiting',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-neutral-100 text-neutral-600',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
};

function displayMember(member?: Member | null) {
  if (!member) return 'Unassigned';
  return member.profiles?.full_name || member.profiles?.email || 'Team member';
}

function formatDueDate(dueAt: string | null) {
  if (!dueAt) return 'No due date';
  return new Date(dueAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOverdue(task: Task) {
  if (!task.due_at || ['completed', 'cancelled'].includes(task.status)) return false;
  return new Date(task.due_at).getTime() < Date.now();
}

export default function TaskInbox({ orgId, members, currentUserId, currentRole }: Props) {
  const [activeTab, setActiveTab] = useState('mine');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    due_at: '',
    priority: 'normal',
    task_type: 'task',
  });

  const isAdmin = currentRole === 'owner' || currentRole === 'admin';
  const membersById = useMemo(
    () => new Map(members.map(member => [member.user_id, member])),
    [members]
  );

  const loadTasks = useCallback(async (tab = activeTab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/tasks?tab=${tab}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load tasks');
      setTasks(json.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [activeTab, orgId]);

  useEffect(() => {
    loadTasks(activeTab);
  }, [activeTab, orgId, loadTasks]);

  async function createTask() {
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const dueAt = form.due_at ? new Date(`${form.due_at}T12:00:00`).toISOString() : null;
      const res = await fetch(`/api/org/${orgId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          assigned_to: form.assigned_to || null,
          due_at: dueAt,
          priority: form.priority,
          task_type: form.task_type,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create task');
      setForm({ title: '', description: '', assigned_to: '', due_at: '', priority: 'normal', task_type: 'task' });
      setShowCreate(false);
      await loadTasks(activeTab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSaving(false);
    }
  }

  async function setTaskDone(task: Task, complete: boolean) {
    try {
      const endpoint = complete ? 'complete' : 'reopen';
      const res = await fetch(`/api/org/${orgId}/tasks/${task.id}/${endpoint}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update task');
      setTasks(prev => prev.map(item => item.id === task.id ? { ...item, ...json.task } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  }

  const openCount = tasks.filter(task => !['completed', 'cancelled'].includes(task.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Tasks</h1>
          <p className="mt-1 text-sm text-neutral-500">{openCount} open</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadTasks(activeTab)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:border-azure hover:text-azure"
            aria-label="Refresh tasks"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-azure px-4 py-2 text-sm font-medium text-white hover:bg-azure/90"
            >
              <Plus className="h-4 w-4" />
              New Task
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-neutral-200">
        <div className="flex gap-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-azure text-azure'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">Title</label>
              <input
                value={form.title}
                onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Assignee</label>
              <select
                value={form.assigned_to}
                onChange={event => setForm(prev => ({ ...prev, assigned_to: event.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20"
              >
                <option value="">Unassigned</option>
                {members.map(member => (
                  <option key={member.user_id} value={member.user_id}>
                    {displayMember(member)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Due Date</label>
              <input
                type="date"
                value={form.due_at}
                onChange={event => setForm(prev => ({ ...prev, due_at: event.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Priority</label>
              <select
                value={form.priority}
                onChange={event => setForm(prev => ({ ...prev, priority: event.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Type</label>
              <select
                value={form.task_type}
                onChange={event => setForm(prev => ({ ...prev, task_type: event.target.value }))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20"
              >
                <option value="task">Task</option>
                <option value="approval">Approval</option>
                <option value="reminder">Reminder</option>
                <option value="follow_up">Follow-up</option>
                <option value="review">Review</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-neutral-700">Description</label>
              <textarea
                value={form.description}
                onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createTask}
              disabled={saving || !form.title.trim()}
              className="rounded-lg bg-azure px-4 py-2 text-sm font-medium text-white hover:bg-azure/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-soft">
        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-500">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">No tasks found.</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {tasks.map(task => {
              const assignee = task.assigned_to ? membersById.get(task.assigned_to) : null;
              const completed = task.status === 'completed';
              const overdue = isOverdue(task);
              const canToggle = isAdmin || task.assigned_to === currentUserId;

              return (
                <div key={task.id} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_160px_130px_120px] md:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => canToggle && setTaskDone(task, !completed)}
                      disabled={!canToggle}
                      className={`mt-0.5 rounded-full ${canToggle ? 'text-neutral-400 hover:text-azure' : 'text-neutral-300'}`}
                      aria-label={completed ? 'Reopen task' : 'Complete task'}
                      title={completed ? 'Reopen' : 'Complete'}
                    >
                      {completed ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`truncate text-sm font-medium ${completed ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                          {task.title}
                        </h2>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.normal}`}>
                          {task.priority}
                        </span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" />
                            Overdue
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{task.description}</p>
                      )}
                      {task.task_entity_links && task.task_entity_links.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.task_entity_links
                            .filter(link => link.relationship !== 'context')
                            .map(link => {
                              const url = getEntityUrl(link, task.task_entity_links ?? [], orgId);
                              const label = link.entity_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                              if (url) {
                                return (
                                  <Link
                                    key={`${link.entity_type}-${link.entity_id}`}
                                    href={url}
                                    className="rounded bg-azure/10 px-2 py-0.5 text-xs text-azure hover:bg-azure/20 transition-colors"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {label}
                                  </Link>
                                );
                              }
                              return (
                                <span key={`${link.entity_type}-${link.entity_id}`} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                                  {label}
                                </span>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-neutral-600">{displayMember(assignee)}</div>
                  <div className={`inline-flex items-center gap-1 text-sm ${overdue ? 'text-red-700' : 'text-neutral-600'}`}>
                    <Clock3 className="h-4 w-4" />
                    {formatDueDate(task.due_at)}
                  </div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {STATUS_LABELS[task.status] || task.status}
                    </span>
                    {completed && canToggle && (
                      <button
                        type="button"
                        onClick={() => setTaskDone(task, false)}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-azure"
                        aria-label="Reopen task"
                        title="Reopen"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
