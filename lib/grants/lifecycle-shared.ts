export const LIFECYCLE_STAGES = [
  'draft',
  'prospect',
  'invited',
  'application_received',
  'due_diligence',
  'recommended',
  'approved',
  'agreement',
  'active',
  'renewal_review',
  'closeout',
  'closed',
  'declined',
  'cancelled',
] as const;

export type LifecycleStage = typeof LIFECYCLE_STAGES[number];
