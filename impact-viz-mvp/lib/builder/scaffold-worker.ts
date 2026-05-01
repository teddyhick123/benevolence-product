// lib/builder/scaffold-worker.ts
import { Queue, Worker, type Job } from 'bullmq';
import { createAdminClient } from '@/lib/supabase';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import type { ScaffoldPlanContent } from './tools';

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const scaffoldQueue = new Queue('scaffold-jobs', { connection: redisConnection });

export interface ScaffoldBuildJobData {
  proposalId: string;
  orgId: string;
}

export async function enqueueScaffoldBuildJob(data: ScaffoldBuildJobData): Promise<string> {
  const job = await scaffoldQueue.add('scaffold-build', data, {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  });
  return job.id ?? '';
}

export function createScaffoldWorker(): Worker {
  const worker = new Worker(
    'scaffold-jobs',
    async (job: Job) => {
      if (job.name === 'scaffold-build') {
        await runBuildPhase(job.data as ScaffoldBuildJobData);
      }
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[scaffold-worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[scaffold-worker] Job ${job.id} (${job.name}) completed`);
  });

  return worker;
}

async function runBuildPhase(data: ScaffoldBuildJobData): Promise<void> {
  const { proposalId } = data;
  const supabase = createAdminClient();

  const { data: proposal, error: fetchError } = await supabase
    .from('builder_proposals')
    .select('plan_content, org_id')
    .eq('id', proposalId)
    .single();

  if (fetchError || !proposal?.plan_content) {
    throw new Error(`Proposal ${proposalId} not found or has no plan_content`);
  }

  const planContent = proposal.plan_content as ScaffoldPlanContent;

  // Mark as building
  await supabase
    .from('builder_proposals')
    .update({ phase: 'building' })
    .eq('id', proposalId);

  let indexStr = '';
  try {
    const index = getCodebaseIndex();
    indexStr = formatIndexForPrompt(index);
  } catch { /* proceed without index */ }

  const scaffoldCtx = buildScaffoldContext(indexStr);
  const contextPrompt = formatScaffoldContextForPrompt(scaffoldCtx);
  const systemPrompt = `You are a senior software engineer implementing a module for the Benevolence platform.${contextPrompt}`;

  const provider = createAIProvider();
  const generatedFiles: Array<{ path: string; content: string }> = [];

  for (const file of planContent.files) {
    const userPrompt = `Module plan:\n${JSON.stringify(planContent, null, 2)}\n\nImplement this specific file: ${file.path}\n${file.description}\n\nReturn ONLY the complete file content with no explanation or markdown fences.`;

    const response = await provider.createMessage({
      model: AI_MODELS.scaffoldBuild,
      maxTokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : '';
    generatedFiles.push({ path: file.path, content });

    await supabase
      .from('builder_proposals')
      .update({ generated_code: { files: generatedFiles } })
      .eq('id', proposalId);
  }

  await supabase
    .from('builder_proposals')
    .update({ phase: 'build_ready' })
    .eq('id', proposalId);

  await runReviewPhase(proposalId, planContent, generatedFiles);
}

async function runReviewPhase(
  proposalId: string,
  planContent: ScaffoldPlanContent,
  generatedFiles: Array<{ path: string; content: string }>
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('builder_proposals')
    .update({ phase: 'reviewing' })
    .eq('id', proposalId);

  const provider = createAIProvider();

  const filesText = generatedFiles
    .map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join('\n\n');

  const reviewPrompt = `Review this generated module implementation against the plan and Benevolence codebase standards.

Module plan:
${JSON.stringify(planContent, null, 2)}

Generated files:
${filesText}

Check for:
1. Missing auth guards (routes must use is_org_admin or is_org_member checks)
2. RLS policy gaps (every new table needs read/write/service_role policies)
3. Naming inconsistencies (slug, table names, component names must be consistent)
4. Type mismatches (TypeScript types should match DB column definitions)

Respond with ONLY a valid JSON object (no markdown fences):
{
  "score": 85,
  "findings": [
    { "severity": "error", "description": "..." },
    { "severity": "warning", "description": "..." }
  ]
}

Score: 0=unusable, 60=has issues, 80=minor issues only, 95+=production ready`;

  const response = await provider.createMessage({
    model: AI_MODELS.scaffoldReview,
    maxTokens: 2048,
    messages: [{ role: 'user', content: reviewPrompt }],
    system: 'You are a senior code reviewer. Return only valid JSON.',
  });

  const textBlock = response.content.find(b => b.type === 'text');
  let reviewReport: { score: number; findings: Array<{ severity: string; description: string }> } = {
    score: 0,
    findings: [{ severity: 'error', description: 'Review failed to produce output.' }],
  };

  if (textBlock?.type === 'text') {
    try {
      const raw = textBlock.text.replace(/^```json?\n?|```$/gm, '').trim();
      reviewReport = JSON.parse(raw);
    } catch {
      reviewReport = { score: 50, findings: [{ severity: 'warning', description: 'Could not parse review output.' }] };
    }
  }

  await supabase
    .from('builder_proposals')
    .update({ phase: 'ready_to_apply', review_report: reviewReport })
    .eq('id', proposalId);
}
