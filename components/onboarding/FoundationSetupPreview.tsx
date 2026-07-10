'use client';

import type { FoundationBlueprintData } from './FoundationBlueprint';

interface FoundationSetupPreviewProps {
  blueprint: FoundationBlueprintData;
  selectedModules: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export default function FoundationSetupPreview({ blueprint, selectedModules }: FoundationSetupPreviewProps) {
  const workflows = asRecord(blueprint.workflows);
  const viewPreferences = asRecord(workflows.view_preferences);
  const dashboardLayout = asRecord(viewPreferences.dashboard_layout);
  const sections = asArray(dashboardLayout.sections).filter((section): section is string => typeof section === 'string');
  const workflowNames = Object.keys(workflows).filter((key) => !['view_preferences', 'automation_preferences', 'org_context'].includes(key));
  const grantCycle = asRecord(workflows.grant_cycle);
  const customFields = asArray(grantCycle.custom_fields);
  const automationPreferences = asRecord(workflows.automation_preferences);
  const automationRules = asArray(automationPreferences.rules);
  const orgContext = workflows.org_context;
  const memoryCount = Array.isArray(orgContext) ? orgContext.length : Object.keys(asRecord(orgContext)).length;

  const changes = [
    {
      label: 'Dashboard sections',
      value: sections.length > 0 ? sections.join(', ') : selectedModules.length > 0 ? `${selectedModules.length} selected capabilities` : 'No dashboard preferences captured yet',
    },
    {
      label: 'Workflows',
      value: workflowNames.length > 0 ? `${workflowNames.length} workflow area${workflowNames.length === 1 ? '' : 's'} from your Blueprint` : 'No custom workflow rules captured yet',
    },
    {
      label: 'Custom fields',
      value: customFields.length > 0 ? `${customFields.length} field${customFields.length === 1 ? '' : 's'} prepared` : 'No custom fields captured yet',
    },
    {
      label: 'Automations',
      value: automationRules.length > 0 ? `${automationRules.length} follow-up rule${automationRules.length === 1 ? '' : 's'} prepared` : 'No automations captured yet',
    },
    {
      label: 'AI memory',
      value: memoryCount > 0 ? `${memoryCount} operating norm${memoryCount === 1 ? '' : 's'} or preference${memoryCount === 1 ? '' : 's'} to remember` : 'No durable AI memory captured yet',
    },
  ];

  return (
    <section className="border border-azure/20 bg-azure/5 p-5" aria-label="Foundation setup preview">
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Review your foundation setup</h3>
        <p className="mt-1 text-sm text-neutral-600">These are the changes Builder will prepare from this conversation when you continue.</p>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {changes.map((change) => (
          <div key={change.label} className="border border-neutral-200 bg-white px-3 py-2.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">{change.label}</dt>
            <dd className="mt-1 text-sm text-neutral-800">{change.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
