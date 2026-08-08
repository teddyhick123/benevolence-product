'use client';

import {
  useNoStoreApiData,
  type ApiDataConfiguration,
  type ApiDataKey,
  type ApiDataResponse,
} from '@/lib/api/client-hooks';

export type HoldingRow = Record<string, unknown>;

export interface HoldingsResponse {
  data: HoldingRow[];
  count: number;
  nextOffset: number | null;
}

export function holdingsKey(portfolioId: string): string {
  return `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings?limit=1000`;
}

export function useHoldingsData<Data>(
  key: ApiDataKey,
  configuration?: ApiDataConfiguration<Data>
): ApiDataResponse<Data> {
  return useNoStoreApiData(key, configuration);
}

export function useHoldings(portfolioId: string) {
  const { data, error, isLoading, mutate } = useHoldingsData<HoldingsResponse>(holdingsKey(portfolioId));

  return {
    holdings: data?.data ?? [],
    count: data?.count ?? 0,
    isLoading,
    error,
    mutate,
  };
}
