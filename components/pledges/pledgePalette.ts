export const PLEDGE_STATUS_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  due_soon: 'Due Soon',
  on_track: 'On Track',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
  defaulted: 'Defaulted',
  written_off: 'Written Off',
};

export const PLEDGE_STATUS_BADGE: Record<string, string> = {
  overdue: 'border border-red-200 bg-red-100 text-red-700',
  due_soon: 'border border-sunset/30 bg-sunset/10 text-ink',
  on_track: 'border border-green-200 bg-green-100 text-green-700',
  fulfilled: 'border border-azure/20 bg-azure/10 text-azure-deep',
  cancelled: 'border border-neutral-200 bg-neutral-100 text-neutral-500',
  defaulted: 'border border-neutral-200 bg-neutral-100 text-neutral-600',
  written_off: 'border border-neutral-200 bg-neutral-100 text-neutral-500',
};

export function pledgeStatusBadgeClass(status: string | null | undefined) {
  return PLEDGE_STATUS_BADGE[status ?? ''] ?? 'border border-neutral-200 bg-neutral-100 text-neutral-600';
}

export function pledgeStatusLabel(status: string | null | undefined) {
  if (!status) return 'Unknown';
  return PLEDGE_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}
