import type { AICapability, AIConnectorId, AIWorkloadId } from '@/lib/ai/workloads';

export interface DeploymentVerificationEvidence {
  evalSuiteVersion: string;
  verifiedAt: string;
  result: 'passed' | 'conditional';
}

export interface VerifiedDeploymentTemplate {
  id: string;
  connector: AIConnectorId;
  providerModelId: string;
  displayName: string;
  modelVendor: string;
  openWeight: boolean;
  versionPolicy: 'pinned' | 'moving_alias';
  advertisedCapabilities: readonly AICapability[];
  verifiedWorkloads: Partial<Record<AIWorkloadId, DeploymentVerificationEvidence>>;
  notes?: string;
}

/**
 * Templates are discoverable configuration, not verification claims. Workload
 * verification remains empty until a dated platform evaluation artifact is
 * committed and linked here.
 */
export const AI_DEPLOYMENT_CATALOG: readonly VerifiedDeploymentTemplate[] = [
  {
    id: 'openrouter-anthropic-claude-sonnet',
    connector: 'openrouter',
    providerModelId: 'anthropic/claude-sonnet-4.5',
    displayName: 'Claude Sonnet 4.5',
    modelVendor: 'anthropic',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
  },
  {
    id: 'openrouter-openai-gpt-4o',
    connector: 'openrouter',
    providerModelId: 'openai/gpt-4o',
    displayName: 'GPT-4o',
    modelVendor: 'openai',
    openWeight: false,
    versionPolicy: 'moving_alias',
    advertisedCapabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    verifiedWorkloads: {},
  },
] as const;

export function getAIDeploymentTemplate(id: string): VerifiedDeploymentTemplate {
  const template = AI_DEPLOYMENT_CATALOG.find(candidate => candidate.id === id);
  if (!template) throw new Error(`Unknown AI deployment catalog template: ${id}`);
  return template;
}
