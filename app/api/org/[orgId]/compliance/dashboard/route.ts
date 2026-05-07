import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * GET /api/org/[orgId]/compliance/dashboard
 * Compliance health summary: dashboard stats + upcoming deadlines + open incidents
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();

    // Verify org membership
    const { data: membership } = await sb
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    // Check module enabled
    const { data: hasModule } = await sb.rpc('org_has_module', {
      p_org_id: orgId,
      p_module_id: 'compliance_regulatory',
    });
    if (!hasModule) return NextResponse.json({ error: 'Module not enabled' }, { status: 403 });

    // Fetch in parallel
    const [dashboardRes, deadlinesRes, incidentsRes, profileRes] = await Promise.all([
      sb.from('v_compliance_dashboard').select('*').eq('organization_id', orgId).maybeSingle(),
      sb.from('v_upcoming_filing_deadlines').select('*').eq('organization_id', orgId).limit(5),
      sb.from('self_dealing_incidents')
        .select('*')
        .eq('organization_id', orgId)
        .in('status', ['flagged', 'confirmed'])
        .order('created_at', { ascending: false })
        .limit(5),
      sb.from('compliance_profiles').select('*').eq('organization_id', orgId).maybeSingle(),
    ]);

    return NextResponse.json({
      dashboard: dashboardRes.data || null,
      upcoming_deadlines: deadlinesRes.data || [],
      open_incidents: incidentsRes.data || [],
      profile: profileRes.data || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
