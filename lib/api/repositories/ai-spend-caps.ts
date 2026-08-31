import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';

export type CapBehaviour = 'hard_stop' | 'read_only' | 'own_key';
export type CapState = 'uncapped' | 'under' | 'warn' | 'over';

export type SpendCapStatus = {
  effectiveLimitUsd: number | null;
  platformLimitUsd: number | null;
  orgLimitUsd: number | null;
  spendUsd: number;
  onLimit: CapBehaviour;
  warnAtPercent: number;
  state: CapState;
  periodStart: string;
};

/** Null is an absent limit, never a limit of zero. */
export function effectiveLimit(
  platformLimitUsd: number | null,
  orgLimitUsd: number | null,
): number | null {
  const limits = [platformLimitUsd, orgLimitUsd].filter(
    (value): value is number => value !== null && value !== undefined,
  );
  return limits.length === 0 ? null : Math.min(...limits);
}

export function capState(input: {
  effectiveLimitUsd: number | null;
  spendUsd: number;
  warnAtPercent: number;
}): CapState {
  if (input.effectiveLimitUsd === null) return 'uncapped';
  // At the limit is over: allowing one more turn at exactly the ceiling would
  // spend past it, since the turn's cost is not known until after it runs.
  if (input.spendUsd >= input.effectiveLimitUsd) return 'over';
  const used = input.effectiveLimitUsd === 0 ? 100 : (input.spendUsd / input.effectiveLimitUsd) * 100;
  return used >= input.warnAtPercent ? 'warn' : 'under';
}

/** Calendar month, UTC. Rolling windows never reset cleanly. */
export function periodStartFor(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

type SpendCapScope = Pick<OrgAccessContext, 'orgId'>;

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function createAISpendCapRepository(
  scope: SpendCapScope,
  dependencies: { db?: ElevatedClient; now?: () => Date } = {},
) {
  const db = dependencies.db ?? createElevatedClient();
  const now = dependencies.now ?? (() => new Date());

  async function readRow() {
    const { data, error } = await db.from('org_ai_spend_caps')
      .select('*').eq('org_id', scope.orgId).maybeSingle();
    if (error) throw error;
    return data;
  }

  return {
    periodStart: () => periodStartFor(now()),

    async getStatus(): Promise<SpendCapStatus> {
      const periodStart = periodStartFor(now());
      const [row, spend] = await Promise.all([
        readRow(),
        db.rpc('org_platform_spend', {
          p_org_id: scope.orgId,
          p_period_start: periodStart.toISOString(),
        }),
      ]);
      if (spend.error) throw spend.error;

      const platformLimitUsd = numberOrNull(row?.platform_limit_usd);
      const orgLimitUsd = numberOrNull(row?.org_limit_usd);
      const limit = effectiveLimit(platformLimitUsd, orgLimitUsd);
      const spendUsd = Number(spend.data ?? 0);
      const warnAtPercent = row?.warn_at_percent ?? 80;

      return {
        effectiveLimitUsd: limit,
        platformLimitUsd,
        orgLimitUsd,
        spendUsd,
        onLimit: (row?.on_limit ?? 'hard_stop') as CapBehaviour,
        warnAtPercent,
        state: capState({ effectiveLimitUsd: limit, spendUsd, warnAtPercent }),
        periodStart: periodStart.toISOString(),
      };
    },

    async setOrgLimit(limitUsd: number | null) {
      const row = await readRow();
      const ceiling = numberOrNull(row?.platform_limit_usd);
      if (limitUsd !== null && ceiling !== null && limitUsd > ceiling) {
        throw new Error(`Organization limit cannot exceed the platform ceiling of ${ceiling}`);
      }
      const { error } = await db.from('org_ai_spend_caps').upsert({
        org_id: scope.orgId,
        org_limit_usd: limitUsd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
      if (error) throw error;
    },

    /**
     * Clamps the organization's limit in the same statement. Without it, an
     * app admin lowering the ceiling below an existing org limit would violate
     * the CHECK — the platform unable to reduce a budget it owns.
     */
    async setPlatformLimit(limitUsd: number | null) {
      const row = await readRow();
      const currentOrgLimit = numberOrNull(row?.org_limit_usd);
      const clamped = limitUsd === null || currentOrgLimit === null
        ? currentOrgLimit
        : Math.min(currentOrgLimit, limitUsd);

      const { error } = await db.from('org_ai_spend_caps').upsert({
        org_id: scope.orgId,
        platform_limit_usd: limitUsd,
        org_limit_usd: clamped,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
      if (error) throw error;
    },

    async setBehaviour(onLimit: CapBehaviour, warnAtPercent: number) {
      const { error } = await db.from('org_ai_spend_caps').upsert({
        org_id: scope.orgId,
        on_limit: onLimit,
        warn_at_percent: warnAtPercent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
      if (error) throw error;
    },
  };
}

export type AISpendCapRepository = ReturnType<typeof createAISpendCapRepository>;
