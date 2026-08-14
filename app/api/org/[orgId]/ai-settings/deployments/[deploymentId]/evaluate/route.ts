import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAICredentialRepository } from '@/lib/api/repositories/ai-credentials';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { aiDeploymentEvaluationLimiter } from '@/lib/api/rate-limit';
import { aiWorkloadIdSchema, openRouterProviderPreferencesSchema } from '@/lib/schemas/ai-settings';
import { getAIDeploymentTemplate } from '@/lib/ai/catalog';
import { getAIWorkload } from '@/lib/ai/workloads';
import { resolveAIExecution } from '@/lib/ai/resolver';
import { OpenRouterConnector } from '@/lib/ai/connectors/openrouter';

type RouteParams = { params: Promise<{ orgId: string; deploymentId: string }> };
const inputSchema = z.object({ workloadId: aiWorkloadIdSchema }).strict();

export async function POST(request: Request, { params }: RouteParams) {
  const { orgId, deploymentId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const actorId = access.context.principal.userId;
  const limit = await aiDeploymentEvaluationLimiter.limit(`${orgId}:${actorId}:${deploymentId}`);
  if (!limit.success) return jsonError('Deployment evaluation limit reached', 429, { reset: limit.reset });
  const settings = createAISettingsRepository(access.context);
  try {
    const { deployment, connection } = await settings.getDeploymentForEvaluation(deploymentId);
    if (deployment.status !== 'active' || connection.status !== 'active') {
      return jsonError('Deployment and connection must be active', 409);
    }
    if (!deployment.catalog_template_id || connection.connector !== 'openrouter') {
      return jsonError('Deployment cannot be evaluated by the Phase 1 suite', 400);
    }
    const template = getAIDeploymentTemplate(deployment.catalog_template_id);
    const workload = getAIWorkload(parsed.data.workloadId);
    const missing = workload.requiredCapabilities.filter(
      capability => !template.advertisedCapabilities.includes(capability),
    );
    if (missing.length > 0) return jsonError(`Deployment is missing: ${missing.join(', ')}`, 400);
    const provider = openRouterProviderPreferencesSchema.parse({
      ...(((connection.config as Record<string, unknown>).provider as Record<string, unknown>) ?? {}),
      ...(((deployment.config as Record<string, unknown>).provider as Record<string, unknown>) ?? {}),
    });
    const basePlan = resolveAIExecution({ kind: 'organization', orgId }, parsed.data.workloadId);
    const plan = {
      ...basePlan,
      connector: 'openrouter' as const,
      requestedModel: deployment.provider_model_id,
      connectionId: connection.id,
      deploymentId: deployment.id,
      modelVendor: template.modelVendor,
      providerPreferences: provider,
    };
    const result = await createAICredentialRepository({ orgId, actorId })
      .withCredential(connection.id, credential => new OpenRouterConnector({
        apiKey: credential.apiKey,
        provider,
      }).generateText(plan, {
        system: 'This is a bounded model compatibility check. Follow the requested output exactly.',
        messages: [{ role: 'user', content: 'Reply with exactly: BENE_OK' }],
        maxOutputTokens: 16,
        temperature: 0,
        signal: AbortSignal.timeout(20_000),
      }));
    if (result.text.trim() !== 'BENE_OK') return jsonError('Deployment did not pass the compatibility check', 422);
    const evidence = await settings.recordDeploymentEvaluation(
      deploymentId,
      parsed.data.workloadId,
      {
        evalSuiteVersion: 'phase1-compatibility-v1',
        verifiedAt: new Date().toISOString(),
        result: 'conditional',
      },
    );
    return jsonOk({ evidence });
  } catch {
    return jsonError('Deployment evaluation failed', 502);
  }
}
