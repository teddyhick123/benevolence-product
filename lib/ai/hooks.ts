// lib/ai/hooks.ts
// Browser data ownership for AI settings surfaces. Components read through
// these rather than calling fetch directly.

import { useApiData } from '@/lib/api/client-hooks';
import type { SpendCapStatus } from '@/lib/api/repositories/ai-spend-caps';

export type UsageWorkloadRow = {
  workload_id: string;
  funding: 'platform';
  cost: number | string;
  invocations: number;
};

export type UsageDailyRow = {
  day: string;
  platform_cost: number | string;
  org_cost: number | string;
};

/** Mirrors the JSONB returned by public.org_ai_usage_report. */
export type UsageReport = {
  period_start: string;
  platform_cost: number | string;
  org_cost: number | string;
  invocations: number;
  failed_invocations: number;
  by_workload: UsageWorkloadRow[];
  daily: UsageDailyRow[];
};

export function useAiUsageReport(orgId: string) {
  return useApiData<{ cap: SpendCapStatus; report: UsageReport }>(
    `/api/org/${orgId}/ai-settings/usage`,
  );
}
