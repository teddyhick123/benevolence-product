import { NextRequest } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import {
  createOnboardingProvisioner,
  OnboardingProvisioningError,
} from '@/lib/api/repositories/onboarding-provisioning';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { ALL_MODULE_IDS, type ModuleId } from '@/lib/modules/types';
import type { OrgType } from '@/lib/types/org';

export const dynamic = 'force-dynamic';

const VALID_ORG_TYPES: OrgType[] = [
  'private_foundation',
  'family_office',
  'daf_sponsor',
  'community_foundation',
  'nonprofit',
  'corporation',
  'individual',
];

type ProvisioningBody = {
  name?: string;
  org_type?: string;
  ein?: string;
  modules?: Record<string, boolean> | null;
  module_ids?: string[];
  session_id?: string;
};

function walkthroughFailurePoint(req: NextRequest) {
  if (process.env.WALKTHROUGH_MODE !== '1') return null;
  return req.headers.get('x-walkthrough-fail-after');
}

export async function POST(req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  try {
    const body = await req.json() as ProvisioningBody;
    const { name, org_type: orgType, ein, modules, module_ids: moduleIds, session_id: sessionId } = body;

    if (!name?.trim()) return jsonError('name is required', 400);
    if (!orgType || !VALID_ORG_TYPES.includes(orgType as OrgType)) {
      return jsonError(`org_type must be one of: ${VALID_ORG_TYPES.join(', ')}`, 400);
    }

    const selectedModuleIds = Array.isArray(moduleIds)
      ? moduleIds.filter((moduleId): moduleId is ModuleId =>
          typeof moduleId === 'string' &&
          (ALL_MODULE_IDS as readonly string[]).includes(moduleId) &&
          moduleId !== 'core'
        )
      : [];
    const requestedModules = modules && typeof modules === 'object'
      ? { ...modules, portfolio: true }
      : selectedModuleIds.length > 0
        ? { portfolio: true }
        : null;

    const provisioner = createOnboardingProvisioner(access.context.principal.userId);
    const result = await provisioner.provision({
      name: name.trim(),
      orgType: orgType as OrgType,
      ein,
      requestedModules,
      selectedModuleIds,
      sessionId,
      failAfterPortfolio: walkthroughFailurePoint(req) === 'portfolio',
    });
    const partial = result.moduleErrors.length > 0 || result.setupErrors.length > 0;

    return jsonOk({
      org_id: result.orgId,
      portfolio_id: result.portfolioId,
      enabled_modules: result.enabledModules,
      module_errors: result.moduleErrors.length > 0 ? result.moduleErrors : undefined,
      setup_errors: result.setupErrors.length > 0 ? result.setupErrors : undefined,
    }, { status: partial ? 207 : 201 });
  } catch (error) {
    if (error instanceof OnboardingProvisioningError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }
}
