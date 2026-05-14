// app/api/admin/imports/mapping-assist/route.ts
// POST /api/admin/imports/mapping-assist
// Body: { source_system, entity_type, source_fields, sample_records, existing_mapping? }
// Returns: MappingAssistResult
// Admin-only endpoint

import { NextRequest, NextResponse } from 'next/server';
import { suggestMappings } from '@/lib/import/ai/mapping-assist';
import { createServerClient } from '@/lib/supabase';
import { aiLimiter } from '@/lib/rate-limit';
import { aiAuthRequired, rateLimitExceeded } from '@/lib/rate-limit-response';

export async function POST(req: NextRequest) {
  // Auth check — admin-only AI endpoint
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return aiAuthRequired();
  const { data: isAdmin } = await supabase.rpc('is_app_admin');
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  // Per-user rate limit
  const { success, reset, remaining, limit } = await aiLimiter.limit(user.id);
  if (!success) return rateLimitExceeded(reset, remaining, limit);

  try {
    const body = await req.json() as {
      source_system?: string;
      entity_type?: string;
      source_fields?: string[];
      sample_records?: Record<string, string>[];
      existing_mapping?: Record<string, unknown>;
    };
    const { source_system, entity_type, source_fields, sample_records, existing_mapping } = body;

    if (!source_system || !entity_type || !source_fields || !sample_records) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await suggestMappings({
      sourceSystem: source_system,
      entityType: entity_type,
      sourceFields: source_fields,
      sampleRecords: sample_records,
      existingMapping: existing_mapping,
    });

    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[mapping-assist] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
