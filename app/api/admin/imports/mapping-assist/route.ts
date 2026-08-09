// app/api/admin/imports/mapping-assist/route.ts
// POST /api/admin/imports/mapping-assist
// Body: { source_type, entity_type, source_fields, sample_records, existing_mapping? }
// Returns: MappingAssistResult
// Admin-only endpoint

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { suggestMappings } from '@/lib/import/ai/mapping-assist';
import { aiLimiter } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';

const mappingAssistSchema = z.object({
  source_type: z.string().trim().min(1).max(100),
  entity_type: z.string().trim().min(1).max(100),
  source_fields: z.array(z.string().max(200)).min(1).max(500),
  sample_records: z.array(z.record(z.string(), z.string())).min(1).max(100),
  existing_mapping: z.record(z.string(), z.unknown()).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  // Per-user rate limit
  const { success, reset, remaining, limit } = await aiLimiter.limit(access.context.user.id);
  if (!success) return rateLimitExceeded(reset, remaining, limit);

  try {
    const parsed = mappingAssistSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const { source_type, entity_type, source_fields, sample_records, existing_mapping } = parsed.data;

    const result = await suggestMappings({
      scope: { kind: 'platform', actorId: access.context.user.id },
      sourceSystem: source_type,
      entityType: entity_type,
      sourceFields: source_fields,
      sampleRecords: sample_records,
      existingMapping: existing_mapping,
    });

    return jsonOk({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[mapping-assist] Error:', message);
    return jsonError(message, 500);
  }
}
