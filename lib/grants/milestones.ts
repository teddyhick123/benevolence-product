export type StoredMilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type MilestoneDisplayStatus = StoredMilestoneStatus | 'overdue';

type MilestoneStatusInput = {
  status?: string | null;
  due_date?: string | null;
};

const TERMINAL_MILESTONE_STATUSES = new Set(['completed', 'cancelled']);

export function milestoneDisplayStatus(
  milestone: MilestoneStatusInput,
  today: Date = new Date()
): MilestoneDisplayStatus {
  const status = (milestone.status ?? 'pending') as StoredMilestoneStatus;
  const dueDate = milestone.due_date;
  const todayIso = today.toISOString().slice(0, 10);

  if (dueDate && !TERMINAL_MILESTONE_STATUSES.has(status) && dueDate < todayIso) {
    return 'overdue';
  }

  return status;
}

export function withMilestoneDisplayStatus<T extends MilestoneStatusInput>(
  milestone: T,
  today: Date = new Date()
): T & { status: MilestoneDisplayStatus; stored_status: string | null } {
  return {
    ...milestone,
    stored_status: milestone.status ?? null,
    status: milestoneDisplayStatus(milestone, today),
  };
}
