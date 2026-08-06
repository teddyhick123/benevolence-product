import type { SessionClient } from '@/lib/api/server-client';
import { createSupabaseServerClient } from '@/lib/supabase';

declare const db: SessionClient;

db.from('holdings');
db.rpc('can_view_portfolio', { p_portfolio_id: '00000000-0000-0000-0000-000000000000' });

// @ts-expect-error The generated platform schema must reject unknown relations.
db.from('__missing_relation__');

// @ts-expect-error The generated platform schema must reject unknown RPCs.
db.rpc('__missing_rpc__');

type CompatibilityClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
declare const compatibilityDb: CompatibilityClient;

// @ts-expect-error Compatibility aliases must preserve generated schema typing.
compatibilityDb.from('__missing_compatibility_relation__');
