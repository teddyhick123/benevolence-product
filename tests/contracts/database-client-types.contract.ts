import type { SessionClient } from '@/lib/api/server-client';
import { createServerClient } from '@/lib/api/server-client';

declare const db: SessionClient;

db.from('holdings');
db.rpc('can_view_portfolio', { p_portfolio_id: '00000000-0000-0000-0000-000000000000' });

// @ts-expect-error Generated write keys must reject nonexistent columns.
db.from('holdings').insert({ __missing_column__: true });

// @ts-expect-error Generated RPC argument keys must reject nonexistent arguments.
db.rpc('can_view_portfolio', { __missing_argument__: '00000000-0000-0000-0000-000000000000' });

db.from('holdings').select('__missing_column__').then(({ data }) => {
  // Supabase reports select-parser errors in the result type; dereferencing the
  // requested row proves a missing selected column cannot masquerade as a row.
  // @ts-expect-error Unknown selected columns do not produce holding rows.
  return data?.[0].id;
});

// @ts-expect-error The generated platform schema must reject unknown relations.
db.from('__missing_relation__');

// @ts-expect-error The generated platform schema must reject unknown RPCs.
db.rpc('__missing_rpc__');

type CompatibilityClient = Awaited<ReturnType<typeof createServerClient>>;
declare const compatibilityDb: CompatibilityClient;

// @ts-expect-error Compatibility aliases must preserve generated schema typing.
compatibilityDb.from('__missing_compatibility_relation__');
