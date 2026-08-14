// app/api/admin/imports/[id]/ai/chat/route.ts
// POST /api/admin/imports/:id/ai/chat
// Streaming AI Migration Copilot chat

import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError } from '@/lib/api/responses';
import { streamMigrationChat } from '@/lib/import/ai/chat';
import type { ChatMessage } from '@/lib/import/ai/chat';
import { aiLimiter } from '@/lib/api/rate-limit';
import { rateLimitExceeded } from '@/lib/api/rate-limit-response';

const chatSchema = z.object({
  message: z.string().trim().min(1).max(10_000),
  history: z.array(z.custom<ChatMessage>()).max(100).default([]),
}).strict();

interface ErrorRow {
  validation_errors: Array<{ field: string; message: string; severity: string }> | null;
}

interface ErrorEntry {
  field: string;
  message: string;
  count: number;
}

function buildErrorSummary(rows: ErrorRow[]): ErrorEntry[] {
  const counts: Record<string, ErrorEntry> = {};
  for (const row of rows) {
    for (const err of row.validation_errors ?? []) {
      const key = `${err.field}::${err.message}`;
      if (!counts[key]) {
        counts[key] = { field: err.field, message: err.message, count: 0 };
      }
      counts[key].count++;
    }
  }
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  // Per-user rate limit on streaming AI
  const { success, reset, remaining, limit } = await aiLimiter.limit(access.context.user.id);
  if (!success) {
    const rl = rateLimitExceeded(reset, remaining, limit);
    return new Response(await rl.text(), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  const { id: importJobId } = await params;
  const parsed = chatSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const { message, history } = parsed.data;
  const { db } = access.context;

  // Fetch job context
  const { data: job } = await db
    .from('import_jobs')
    .select('*')
    .eq('id', importJobId)
    .single();

  if (!job) {
    return new Response(JSON.stringify({ error: 'Import job not found' }), { status: 404 });
  }

  // Fetch recent error sample (up to 100 invalid rows)
  const { data: recentErrors } = await db
    .from('staging_import_contributions')
    .select('validation_errors')
    .eq('import_job_id', importJobId)
    .eq('validation_status', 'invalid')
    .limit(100);

  const errorSummary = buildErrorSummary((recentErrors ?? []) as ErrorRow[]);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { actions } = await streamMigrationChat(
          {
            scope: {
              kind: 'organization',
              orgId: (job as Record<string, unknown>).org_id as string,
              actorId: access.context.user.id,
              portfolioId: ((job as Record<string, unknown>).portfolio_id as string | null) ?? undefined,
            },
            importJobId,
            message,
            history,
            jobContext: {
              status: (job as Record<string, unknown>).status as string ?? 'unknown',
              recordsExtracted: (job as Record<string, unknown>).total_records_extracted as number ?? 0,
              recordsLoaded: (job as Record<string, unknown>).records_loaded as number ?? 0,
              recordsFailed: (job as Record<string, unknown>).records_failed as number ?? 0,
              recentErrors: errorSummary,
              reconciliation: (job as Record<string, unknown>).reconciliation_data as Record<string, unknown> | undefined,
            },
          },
          (chunk) => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`
              )
            );
          }
        );

        if (actions.length > 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'actions', actions })}\n\n`
            )
          );
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        );
        controller.close();
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: errMessage })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
