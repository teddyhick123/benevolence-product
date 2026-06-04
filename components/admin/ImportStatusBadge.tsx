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
  processing: {
    label: 'Processing',
    classes: 'bg-azure/10 text-azure-deep border-azure/20',
  },
  needs_review: {
    label: 'Needs Review',
    classes: 'bg-sunset/15 text-ink border-sunset/30',
  },
  approved: {
    label: 'Approved',
    classes: 'bg-green-50 text-green-700 border-green-200',
  },
  committing: {
    label: 'Committing',
    classes: 'bg-azure/10 text-azure-deep border-azure/20',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-green-50 text-green-700 border-green-200',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-red-50 text-red-700 border-red-200',
  },
  rejected: {
    label: 'Rejected',
    classes: 'bg-red-50 text-red-700 border-red-200',
  },
  rolled_back: {
    label: 'Rolled Back',
    classes: 'bg-coral/10 text-coral border-coral/25',
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
