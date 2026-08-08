'use client';

import {
  useNoStoreApiData,
  type ApiDataConfiguration,
  type ApiDataKey,
  type ApiDataResponse,
} from '@/lib/api/client-hooks';

export function useDashboardData<Data>(
  key: ApiDataKey,
  configuration?: ApiDataConfiguration<Data>
): ApiDataResponse<Data> {
  return useNoStoreApiData(key, configuration);
}
