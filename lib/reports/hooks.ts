'use client';

import {
  useApiData,
  type ApiDataConfiguration,
  type ApiDataKey,
  type ApiDataResponse,
} from '@/lib/api/client-hooks';

export function useReportsData<Data>(
  key: ApiDataKey,
  configuration?: ApiDataConfiguration<Data>
): ApiDataResponse<Data> {
  return useApiData(key, configuration);
}
