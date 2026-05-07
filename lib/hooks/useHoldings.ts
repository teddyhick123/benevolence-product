import useSWR from 'swr';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export type HoldingRow = Record<string, unknown>;

export interface HoldingsResponse {
  data: HoldingRow[];
  count: number;
  nextOffset: number | null;
}

export function holdingsKey(portfolioId: string): string {
  return `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings?limit=1000`;
}

export function useHoldings(portfolioId: string) {
  const { data, error, isLoading, mutate } = useSWR<HoldingsResponse>(
    holdingsKey(portfolioId),
    fetcher
  );

  return {
    holdings: data?.data ?? [],
    count: data?.count ?? 0,
    isLoading,
    error,
    mutate,
  };
}
