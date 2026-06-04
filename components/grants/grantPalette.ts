import type { LifecycleStage } from '@/lib/grants/lifecycle-shared';

type StagePalette = {
  badge: string;
  column: string;
  dot: string;
};

export const GRANT_STAGE_LABELS: Record<LifecycleStage, string> = {
  draft: 'Draft',
  prospect: 'Prospect',
  invited: 'Invited',
  application_received: 'Application',
  due_diligence: 'Due Diligence',
  recommended: 'Recommended',
  approved: 'Approved',
  agreement: 'Agreement',
  active: 'Active',
  renewal_review: 'Renewal Review',
  closeout: 'Closeout',
  closed: 'Closed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export const GRANT_STAGE_PALETTE: Record<LifecycleStage, StagePalette> = {
  draft: {
    badge: 'border border-neutral-200 bg-neutral-100 text-neutral-600',
    column: 'border-black/10 bg-neutral-50 text-neutral-600',
    dot: 'bg-neutral-400',
  },
  prospect: {
    badge: 'border border-azure/20 bg-azure/10 text-azure-deep',
    column: 'border-azure/20 bg-azure/10 text-azure-deep',
    dot: 'bg-azure',
  },
  invited: {
    badge: 'border border-azure/25 bg-azure/15 text-azure-deep',
    column: 'border-azure/25 bg-azure/15 text-azure-deep',
    dot: 'bg-azure',
  },
  application_received: {
    badge: 'border border-azure/30 bg-azure/20 text-azure-deep',
    column: 'border-azure/30 bg-azure/20 text-azure-deep',
    dot: 'bg-azure-deep',
  },
  due_diligence: {
    badge: 'border border-sunset/30 bg-sunset/10 text-ink',
    column: 'border-sunset/30 bg-sunset/10 text-ink',
    dot: 'bg-sunset',
  },
  recommended: {
    badge: 'border border-sunset/40 bg-sunset/20 text-ink',
    column: 'border-sunset/40 bg-sunset/20 text-ink',
    dot: 'bg-sunset',
  },
  approved: {
    badge: 'border border-green-200 bg-green-100 text-green-700',
    column: 'border-green-200 bg-green-50 text-green-700',
    dot: 'bg-green-500',
  },
  agreement: {
    badge: 'border border-azure/25 bg-azure/10 text-azure-deep',
    column: 'border-azure/25 bg-azure/10 text-azure-deep',
    dot: 'bg-azure',
  },
  active: {
    badge: 'border border-green-200 bg-green-100 text-green-700',
    column: 'border-green-200 bg-green-50 text-green-700',
    dot: 'bg-green-500',
  },
  renewal_review: {
    badge: 'border border-sunset/30 bg-sunset/10 text-ink',
    column: 'border-sunset/30 bg-sunset/10 text-ink',
    dot: 'bg-sunset',
  },
  closeout: {
    badge: 'border border-coral/30 bg-coral/10 text-coral',
    column: 'border-coral/30 bg-coral/10 text-coral',
    dot: 'bg-coral',
  },
  closed: {
    badge: 'border border-neutral-200 bg-neutral-100 text-neutral-600',
    column: 'border-black/10 bg-neutral-50 text-neutral-600',
    dot: 'bg-neutral-400',
  },
  declined: {
    badge: 'border border-red-200 bg-red-100 text-red-700',
    column: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-red-500',
  },
  cancelled: {
    badge: 'border border-neutral-200 bg-neutral-100 text-neutral-500',
    column: 'border-black/10 bg-neutral-50 text-neutral-500',
    dot: 'bg-neutral-300',
  },
};

export const DEFAULT_GRANT_STAGE_PALETTE = GRANT_STAGE_PALETTE.draft;

export function grantStageLabel(stage: string | null | undefined) {
  if (!stage) return 'Unknown';
  return GRANT_STAGE_LABELS[stage as LifecycleStage] ?? stage.replace(/_/g, ' ');
}

export function grantStagePalette(stage: string | null | undefined) {
  if (!stage) return DEFAULT_GRANT_STAGE_PALETTE;
  return GRANT_STAGE_PALETTE[stage as LifecycleStage] ?? DEFAULT_GRANT_STAGE_PALETTE;
}

export function grantStageBadgeClass(stage: string | null | undefined) {
  return `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${grantStagePalette(stage).badge}`;
}

export const GRANT_RISK_BADGE: Record<string, string> = {
  low: 'border border-green-200 bg-green-100 text-green-700',
  medium: 'border border-sunset/30 bg-sunset/10 text-ink',
  high: 'border border-coral/30 bg-coral/10 text-coral',
  critical: 'border border-red-200 bg-red-100 text-red-700 font-semibold',
};

export const GRANT_STATUS_BADGE: Record<string, string> = {
  active: 'border border-azure/20 bg-azure/10 text-azure-deep',
  approved: 'border border-azure/20 bg-azure/10 text-azure-deep',
  blocked: 'border border-red-200 bg-red-100 text-red-700',
  cancelled: 'border border-neutral-200 bg-neutral-100 text-neutral-500',
  completed: 'border border-green-200 bg-green-100 text-green-700',
  conditional: 'border border-sunset/30 bg-sunset/10 text-ink',
  fail: 'border border-red-200 bg-red-100 text-red-700',
  in_progress: 'border border-azure/20 bg-azure/10 text-azure-deep',
  pending: 'border border-neutral-200 bg-neutral-100 text-neutral-600',
  processing: 'border border-sunset/30 bg-sunset/10 text-ink',
  returned: 'border border-red-200 bg-red-100 text-red-700',
  paused: 'border border-sunset/30 bg-sunset/10 text-ink',
  pass: 'border border-green-200 bg-green-100 text-green-700',
  scheduled: 'border border-neutral-200 bg-neutral-100 text-neutral-600',
  skipped: 'border border-neutral-200 bg-neutral-100 text-neutral-500',
  'n/a': 'border border-neutral-200 bg-neutral-100 text-neutral-500',
};

export function grantStatusBadgeClass(status: string | null | undefined) {
  return GRANT_STATUS_BADGE[status ?? ''] ?? 'border border-neutral-200 bg-neutral-100 text-neutral-600';
}
