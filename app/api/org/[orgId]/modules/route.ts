import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import {
  ModuleId,
  enableModule,
  disableModule,
  getOrgEnabledModules,
  applyModulePreset,
  getModulePresets,
} from '@/lib/modules';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const ADMIN_ROLES = new Set(['owner', 'admin']);

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

function getSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * GET /api/org/[orgId]/modules
 * Get enabled modules for an organization
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const cookieStore = await cookies();
    const supabase = getSupabase(cookieStore);

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify org membership
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });

    if (!role) {
      return json({ error: 'Access denied' }, { status: 403 });
    }

    const serviceSupabase = getServiceSupabase();
    const enabledModules = await getOrgEnabledModules(serviceSupabase, orgId);
    const { presets } = await getModulePresets(serviceSupabase);

    return json({
      enabledModules,
      presets,
    });
  } catch (error) {
    console.error('Error getting modules:', error);
    return json(
      { error: 'Failed to get modules' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/org/[orgId]/modules
 * Enable or disable a module, or apply a preset
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const cookieStore = await cookies();
    const supabase = getSupabase(cookieStore);

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify org admin
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });

    if (!role || !ADMIN_ROLES.has(role)) {
      return json(
        { error: 'Only organization admins can manage modules' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action, moduleId, presetId } = body;

    const serviceSupabase = getServiceSupabase();

    if (action === 'enable' && moduleId) {
      const result = await enableModule(
        serviceSupabase,
        orgId,
        moduleId as ModuleId,
        user.id
      );
      if (!result.success) {
        return json({ error: result.error }, { status: 400 });
      }
      return json({
        success: true,
        enabledModules: result.enabledModules,
      });
    }

    if (action === 'disable' && moduleId) {
      const result = await disableModule(serviceSupabase, orgId, moduleId as ModuleId);
      if (!result.success) {
        return json({ error: result.error }, { status: 400 });
      }
      return json({ success: true });
    }

    if (action === 'apply_preset' && presetId) {
      const result = await applyModulePreset(serviceSupabase, orgId, presetId, user.id);
      if (!result.success) {
        return json({ error: result.error }, { status: 400 });
      }
      return json({
        success: true,
        enabledModules: result.enabledModules,
      });
    }

    return json(
      { error: 'Invalid action. Use "enable", "disable", or "apply_preset"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error managing modules:', error);
    return json(
      { error: 'Failed to manage modules' },
      { status: 500 }
    );
  }
}
