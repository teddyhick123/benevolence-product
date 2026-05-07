import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ proposalId: string }>;
}

const PROJECT_ROOT = path.resolve(process.cwd());

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();
    const { data: proposal, error: fetchError } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, generated_code, org_id')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.phase !== 'ready_to_apply') {
      return NextResponse.json(
        { error: `Proposal must be ready_to_apply, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    const files = (proposal.generated_code as { files: Array<{ path: string; content: string }> })?.files ?? [];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No generated files to apply.' }, { status: 400 });
    }

    const writtenPaths: string[] = [];

    for (const file of files) {
      const cleanPath = file.path.replace(/^[./]+/, '');
      const absolutePath = path.join(PROJECT_ROOT, cleanPath);

      if (!absolutePath.startsWith(PROJECT_ROOT + path.sep)) {
        return NextResponse.json(
          { error: `Path traversal detected: ${file.path}` },
          { status: 400 }
        );
      }

      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, file.content, 'utf-8');
      writtenPaths.push(cleanPath);
    }

    await adminSupabase
      .from('builder_proposals')
      .update({
        phase: 'applied',
        status: 'applied',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    return NextResponse.json({ applied: true, files: writtenPaths });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
