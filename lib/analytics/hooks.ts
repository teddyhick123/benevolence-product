'use client';

import {
  useApiData,
  type ApiDataConfiguration,
  type ApiDataKey,
  type ApiDataResponse,
} from '@/lib/api/client-hooks';

export function useAnalyticsData<Data>(
  key: ApiDataKey,
  configuration?: ApiDataConfiguration<Data>
): ApiDataResponse<Data> {
  return useApiData(key, configuration);
}
