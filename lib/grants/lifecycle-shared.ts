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

export const ALLOWED_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  draft:                ['prospect', 'cancelled'],
  prospect:             ['invited', 'application_received', 'declined', 'cancelled'],
  invited:              ['application_received', 'declined', 'cancelled'],
  application_received: ['due_diligence', 'declined', 'cancelled'],
  due_diligence:        ['recommended', 'declined', 'cancelled'],
  recommended:          ['approved', 'declined', 'cancelled'],
  approved:             ['agreement', 'declined', 'cancelled'],
  agreement:            ['active', 'cancelled'],
  active:               ['renewal_review', 'closeout', 'cancelled'],
  renewal_review:       ['active', 'closeout', 'declined', 'cancelled'],
  closeout:             ['closed', 'cancelled'],
  closed:               [],
  declined:             [],
  cancelled:            [],
};

// Transitions that require a grant_decisions record before the stage change is committed.
export const DECISION_REQUIRED_TRANSITIONS = new Set<`${LifecycleStage}->${LifecycleStage}`>([
  'recommended->approved',
  'recommended->declined',
  'active->renewal_review',
  'renewal_review->active',
  'closeout->closed',
  'approved->declined',
]);

export function canTransition(from: LifecycleStage, to: LifecycleStage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function requiresDecision(from: LifecycleStage, to: LifecycleStage): boolean {
  return DECISION_REQUIRED_TRANSITIONS.has(`${from}->${to}`);
}

export interface DecisionPayload {
  decision_type: 'approval' | 'decline' | 'defer' | 'renewal' | 'closeout' | 'payment_release';
  decision: 'approved' | 'declined' | 'deferred' | 'conditional' | 'not_applicable';
  decision_date: string; // ISO date
  decided_by?: string;
  amount?: number;
  conditions?: string;
  rationale?: string;
  board_meeting_date?: string;
  metadata?: Record<string, unknown>;
}
