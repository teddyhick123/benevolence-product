'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useCallback, useEffect, useState } from 'react';
import { LIFECYCLE_STAGES, type LifecycleStage } from '@/lib/grants/lifecycle-shared';

function fallbackStageLabel(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function useStageLabels(orgId: string | null | undefined) {
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!orgId) {
      setLabels({});
      return;
    }

    let cancelled = false;
    apiRequest(`/api/org/${orgId}/workflow-config/labels`)
      .then(res => res.ok ? readJson(res) : { labels: {} })
      .then(data => {
        if (!cancelled) setLabels(data.labels ?? {});
      })
      .catch(() => {
        if (!cancelled) setLabels({});
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const getLabel = useCallback((stage: LifecycleStage | string): string => {
    if (!LIFECYCLE_STAGES.includes(stage as LifecycleStage)) return fallbackStageLabel(stage);
    return labels[stage] ?? fallbackStageLabel(stage);
  }, [labels]);

  return { labels, getLabel };
}
