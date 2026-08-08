'use client';

import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';
import { ApiClientError, requestJson } from '@/lib/api/client';

export type ApiDataKey = string | null;
export type ApiDataConfiguration<Data> = SWRConfiguration<Data, ApiClientError>;
export type ApiDataResponse<Data> = SWRResponse<Data, ApiClientError>;

export function useApiData<Data>(
  key: ApiDataKey,
  configuration?: ApiDataConfiguration<Data>
): ApiDataResponse<Data> {
  return useSWR<Data, ApiClientError>(key, url => requestJson<Data>(url), configuration);
}

export function useNoStoreApiData<Data>(
  key: ApiDataKey,
  configuration?: ApiDataConfiguration<Data>
): ApiDataResponse<Data> {
  return useSWR<Data, ApiClientError>(
    key,
    url => requestJson<Data>(url, { cache: 'no-store' }),
    configuration
  );
}
