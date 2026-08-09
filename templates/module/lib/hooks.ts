'use client';

import { requestJson } from '@/lib/api/client';
import { useNoStoreApiData } from '@/lib/api/client-hooks';

type {ModuleName}Item = { id: string; name: string };
type {ModuleName}Response = { items: {ModuleName}Item[] };

function itemsUrl(orgId: string): string {
  return `/api/org/${encodeURIComponent(orgId)}/{module_name}`;
}

export function use{ModuleName}Items(orgId: string) {
  const result = useNoStoreApiData<{ModuleName}Response>(itemsUrl(orgId));
  return { ...result, items: result.data?.items ?? [] };
}

export function save{ModuleName}Item(
  orgId: string,
  itemId: string | null,
  input: { name: string },
): Promise<{ item: {ModuleName}Item }> {
  const base = itemsUrl(orgId);
  return requestJson(itemId ? `${base}/${encodeURIComponent(itemId)}` : base, {
    method: itemId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
