import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { VIEW_CONFIG_SCOPES, loadEntityVocabulary, loadOrgViewConfig, type ViewConfigScope } from '@/lib/view-config';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return json({ error: 'Not authorized' }, { status: 403 });

    const scopeParam = req.nextUrl.searchParams.get('scope');
    const scopeKey = req.nextUrl.searchParams.get('scope_key') ?? undefined;
    const includeVocabulary = req.nextUrl.searchParams.get('include_vocabulary') === 'true';

    const scope = scopeParam && VIEW_CONFIG_SCOPES.includes(scopeParam as ViewConfigScope)
      ? scopeParam as ViewConfigScope
      : undefined;
    if (scopeParam && !scope) {
      return json({ error: `scope must be one of: ${VIEW_CONFIG_SCOPES.join(', ')}` }, { status: 400 });
    }

    const db = createAdminClient();
    const [configs, vocabulary] = await Promise.all([
      loadOrgViewConfig(db, orgId, { scope, scopeKey }),
      includeVocabulary ? loadEntityVocabulary(db, orgId) : Promise.resolve(null),
    ]);

    return json({ configs, vocabulary });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
