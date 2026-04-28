// components/admin/ImportStatusBadge.tsx
// Reusable badge for import job status

import type { ImportJobStatus } from '@/lib/import/types';

const STATUS_CONFIG: Record<
  ImportJobStatus,
  { label: string; classes: string }
> = {
  pending: {
    label: 'Pending',
    classes: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  },
  running: {
    label: 'Running',
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  paused: {
    label: 'Paused',
    classes: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-green-50 text-green-700 border-green-200',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-red-50 text-red-700 border-red-200',
  },
  rolled_back: {
    label: 'Rolled Back',
    classes: 'bg-orange-50 text-orange-700 border-orange-200',
  },
};

interface ImportStatusBadgeProps {
  status: ImportJobStatus;
  className?: string;
}

export function ImportStatusBadge({ status, className = '' }: ImportStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border font-medium ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  );
}
