// lib/grants/lifecycle.ts
//
// Canonical lifecycle state machine for grants.
// All stage transitions must go through canTransition / transitionGrant.
// Stages that require a grant_decisions record are listed in DECISION_REQUIRED_TRANSITIONS.

import { createAdminClient } from '@/lib/supabase';
import {
  canTransition,
  requiresDecision,
  type DecisionPayload,
  type LifecycleStage,
} from './lifecycle-shared';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  DECISION_REQUIRED_TRANSITIONS,
  LIFECYCLE_STAGES,
  requiresDecision,
  type DecisionPayload,
  type LifecycleStage,
} from './lifecycle-shared';

export class InvalidTransitionError extends Error {
  constructor(from: LifecycleStage, to: LifecycleStage) {
    super(`Invalid lifecycle transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class DecisionRequiredError extends Error {
  constructor(from: LifecycleStage, to: LifecycleStage) {
    super(`Transition ${from} → ${to} requires a decision record`);
    this.name = 'DecisionRequiredError';
  }
}

export class GrantNotFoundError extends Error {
  constructor(grantId: string) {
    super(`Grant not found: ${grantId}`);
    this.name = 'GrantNotFoundError';
  }
}

/**
 * Transitions a grant to a new lifecycle stage.
 * Validates the transition, optionally inserts a grant_decisions row,
 * updates grants.lifecycle_stage, and appends grant_status_history.
 * Throws InvalidTransitionError or DecisionRequiredError on failure.
 */
export async function transitionGrant(
  grantId: string,
  toStage: LifecycleStage,
  actorId: string | null,
  reason?: string,
  decisionPayload?: DecisionPayload,
  expectedOrgId?: string
): Promise<void> {
  const db = createAdminClient();

  // Fetch current stage
  const { data: grant, error: fetchErr } = await db
    .from('grants')
    .select('lifecycle_stage, org_id')
    .eq('id', grantId)
    .single();

  if (fetchErr) {
    throw new Error(fetchErr.message);
  }
  if (!grant) {
    throw new GrantNotFoundError(grantId);
  }

  const fromStage = grant.lifecycle_stage as LifecycleStage;
  const orgId: string = grant.org_id;
  if (expectedOrgId && orgId !== expectedOrgId) {
    throw new GrantNotFoundError(grantId);
  }

  if (!canTransition(fromStage, toStage)) {
    throw new InvalidTransitionError(fromStage, toStage);
  }

  if (requiresDecision(fromStage, toStage) && !decisionPayload) {
    throw new DecisionRequiredError(fromStage, toStage);
  }

  // Insert decision record if provided
  if (decisionPayload) {
    const { error: decisionErr } = await db.from('grant_decisions').insert({
      grant_id: grantId,
      org_id: orgId,
      ...decisionPayload,
    });
    if (decisionErr) throw new Error(`Failed to insert decision: ${decisionErr.message}`);
  }

  // Update lifecycle stage
  const { error: updateErr } = await db
    .from('grants')
    .update({ lifecycle_stage: toStage })
    .eq('id', grantId);
  if (updateErr) throw new Error(`Failed to update lifecycle stage: ${updateErr.message}`);

  // Append history row
  const { error: historyErr } = await db.from('grant_status_history').insert({
    grant_id: grantId,
    org_id: orgId,
    from_stage: fromStage,
    to_stage: toStage,
    reason: reason ?? null,
    actor_id: actorId ?? null,
  });
  if (historyErr) throw new Error(`Failed to append status history: ${historyErr.message}`);
}
