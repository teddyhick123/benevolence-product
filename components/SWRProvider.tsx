'use client';

import { SWRConfig } from 'swr';
import { ReactNode } from 'react';

const swrConfig = {
  dedupingInterval: 60000,        // Dedupe requests within 1 minute
  focusThrottleInterval: 300000,  // Don't re-fetch on window focus for 5 minutes
  revalidateOnFocus: false,       // Disable auto-revalidate on window focus
  revalidateOnReconnect: false,   // Disable auto-revalidate on reconnect
  errorRetryCount: 2,             // Retry failed requests twice
  errorRetryInterval: 3000,       // Wait 3 seconds between retries
};

export default function SWRProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
