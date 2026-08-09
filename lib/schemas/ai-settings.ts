import { z } from 'zod';
import { AI_WORKLOADS } from '@/lib/ai/workloads';

const workloadIds = Object.keys(AI_WORKLOADS) as [
  keyof typeof AI_WORKLOADS,
  ...(keyof typeof AI_WORKLOADS)[],
];

export const aiWorkloadIdSchema = z.enum(workloadIds);

export const openRouterCredentialSchema = z.object({
  apiKey: z.string().trim().min(16).max(512).refine(
    value => !/\s/.test(value),
    'API key must not contain whitespace',
  ),
}).strict();

const providerNameListSchema = z.array(
  z.string().trim().min(1).max(100),
).max(25).optional();

export const openRouterProviderPreferencesSchema = z.object({
  order: providerNameListSchema,
  only: providerNameListSchema,
  ignore: providerNameListSchema,
  require_parameters: z.boolean().optional(),
  data_collection: z.enum(['allow', 'deny']).optional(),
  zdr: z.boolean().optional(),
  max_price: z.object({
    prompt: z.number().nonnegative().optional(),
    completion: z.number().nonnegative().optional(),
    image: z.number().nonnegative().optional(),
    request: z.number().nonnegative().optional(),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.only && value.ignore) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provider only and ignore lists cannot be used together',
    });
  }
});

export const openRouterConnectionConfigSchema = z.object({
  provider: openRouterProviderPreferencesSchema.optional(),
}).strict();

export const aiConnectionCreateSchema = z.object({
  connector: z.literal('openrouter'),
  name: z.string().trim().min(1).max(100),
  endpointUrl: z.literal('https://openrouter.ai/api/v1').optional(),
  region: z.string().trim().min(1).max(100).nullable().optional(),
  config: openRouterConnectionConfigSchema.optional().default({}),
  credential: openRouterCredentialSchema,
}).strict();

export const aiConnectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  region: z.string().trim().min(1).max(100).nullable().optional(),
  config: openRouterConnectionConfigSchema.optional(),
  status: z.enum(['active', 'disabled']).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required');

export const aiDeploymentCreateSchema = z.object({
  connectionId: z.string().uuid(),
  catalogTemplateId: z.string().trim().min(1).max(150),
  name: z.string().trim().min(1).max(100).optional(),
  config: z.object({
    provider: openRouterProviderPreferencesSchema.optional(),
  }).strict().optional().default({}),
}).strict();

export const aiRoutePolicySchema = z.object({
  experimentalUseAccepted: z.boolean().optional().default(false),
  mutationTools: z.enum(['verified_only', 'allow_experimental']).optional().default('verified_only'),
  fallbackOn: z.array(
    z.enum(['rate_limited', 'deployment_unavailable', 'timeout']),
  ).max(3).optional().default(['rate_limited', 'deployment_unavailable']),
  provider: openRouterProviderPreferencesSchema.optional(),
}).strict();

const deploymentTargetSchema = z.object({
  kind: z.literal('deployment'),
  deploymentId: z.string().uuid(),
}).strict();

const platformTargetSchema = z.object({
  kind: z.literal('platform_default'),
}).strict();

export const aiRouteTargetSchema = z.discriminatedUnion('kind', [
  deploymentTargetSchema,
  platformTargetSchema,
]);

export const aiRouteReplaceSchema = z.object({
  workloadId: aiWorkloadIdSchema,
  isEnabled: z.boolean().optional().default(true),
  policy: aiRoutePolicySchema.optional().default({}),
  targets: z.array(aiRouteTargetSchema).min(1).max(10),
}).strict().superRefine((value, context) => {
  const deployments = value.targets
    .filter((target): target is z.infer<typeof deploymentTargetSchema> => target.kind === 'deployment')
    .map(target => target.deploymentId);
  if (new Set(deployments).size !== deployments.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targets'], message: 'Deployment targets must be unique' });
  }
  if (value.targets.filter(target => target.kind === 'platform_default').length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targets'], message: 'Platform default may appear only once' });
  }
  if (value.policy.mutationTools === 'allow_experimental' && !value.policy.experimentalUseAccepted) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['policy', 'experimentalUseAccepted'],
      message: 'Experimental mutation tools require explicit acceptance',
    });
  }
});

export type AIRoutePolicy = z.infer<typeof aiRoutePolicySchema>;
export type AIRouteTargetInput = z.infer<typeof aiRouteTargetSchema>;
