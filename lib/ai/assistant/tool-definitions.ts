import type { ToolDefinition } from '@/lib/ai/types';
import type { ModuleId } from '@/lib/modules/types';
import { CORE_TOOLS } from './tool-definitions/core';
import { IMPACT_TOOLS } from './tool-definitions/impact';
import { REPORTING_TOOLS } from './tool-definitions/reporting';
import { EXTERNAL_DATA_TOOLS } from './tool-definitions/external-data';
import { TAX_TOOLS } from './tool-definitions/tax';
import { ANALYTICS_TOOLS } from './tool-definitions/analytics';
import { GRANT_TOOLS } from './tool-definitions/grants';
import { DONOR_TOOLS } from './tool-definitions/donors';
import { COMPLIANCE_TOOLS } from './tool-definitions/compliance';

export const TOOL_DEFINITIONS_BY_MODULE: Readonly<
  Partial<Record<ModuleId, readonly ToolDefinition[]>>
> = {
  core: CORE_TOOLS,
  impact_tracking: IMPACT_TOOLS,
  reporting: REPORTING_TOOLS,
  external_data: EXTERNAL_DATA_TOOLS,
  tax_optimization: TAX_TOOLS,
  analytics: ANALYTICS_TOOLS,
  grant_management: GRANT_TOOLS,
  donor_management: DONOR_TOOLS,
  compliance_regulatory: COMPLIANCE_TOOLS,
};

export const PORTFOLIO_TOOLS: ToolDefinition[] = Object.values(
  TOOL_DEFINITIONS_BY_MODULE,
).flatMap((definitions) => definitions ?? []);

export const TOOL_DEFINITION_BY_NAME = new Map(
  PORTFOLIO_TOOLS.map((definition) => [definition.name, definition] as const),
);
