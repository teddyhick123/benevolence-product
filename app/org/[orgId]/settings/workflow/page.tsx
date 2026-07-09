import Link from 'next/link';
import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  params: Promise<{ orgId: string }>;
}

type WorkflowConfigRow = {
  id: string;
  config_type: 'stage_checklist' | 'stage_label' | 'required_field' | 'approval_requirement';
  stage_key: string;
  config_key: string;
  config_value: Record<string, unknown>;
  sort_order: number;
};

function stageLabel(stage: string) {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function loadWorkflowSettings(orgId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!role) return { error: 'Not authorized', rows: [], isAdmin: false, hasModule: false };
  if (!['owner', 'admin'].includes(role)) {
    return { error: 'Admin access required', rows: [], isAdmin: false, hasModule: false };
  }

  const db = createAdminClient();
  const { data: hasModule, error: moduleError } = await db.rpc('org_has_module', {
    p_org_id: orgId,
    p_module: 'grant_management',
  });
  if (moduleError) return { error: moduleError.message, rows: [], isAdmin: true, hasModule: false };
  if (!hasModule) return { error: null, rows: [], isAdmin: true, hasModule: false };

  const { data, error } = await db
    .from('org_workflow_config')
    .select('id, config_type, stage_key, config_key, config_value, sort_order')
    .eq('org_id', orgId)
    .eq('module', 'grant_management')
    .order('stage_key')
    .order('sort_order');

  if (error) return { error: error.message, rows: [], isAdmin: true, hasModule: true };
  return { error: null, rows: (data ?? []) as WorkflowConfigRow[], isAdmin: true, hasModule: true };
}

export default async function WorkflowSettingsPage({ params }: Props) {
  const { orgId } = await params;
  const { error, rows, hasModule } = await loadWorkflowSettings(orgId);

  if (error) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-red-600">Workflow Settings</h1>
        <p className="mt-2 text-sm text-neutral-600">{error}</p>
        <Link href={`/org/${orgId}/settings`} className="mt-4 inline-block text-sm text-azure hover:underline">
          Back to settings
        </Link>
      </div>
    );
  }

  const rowsByStage = new Map<string, WorkflowConfigRow[]>();
  for (const row of rows) {
    if (!rowsByStage.has(row.stage_key)) rowsByStage.set(row.stage_key, []);
    rowsByStage.get(row.stage_key)!.push(row);
  }

  const configuredStages = LIFECYCLE_STAGES.filter(stage => rowsByStage.has(stage));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workflow Settings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Grant stage labels, checklist gates, required fields, and approval notes configured for this organization.
          </p>
        </div>
        <Link
          href="/settings/builder"
          className="inline-flex items-center justify-center rounded-lg bg-azure px-4 py-2 text-sm font-medium text-white hover:bg-azure/90"
        >
          Configure in Builder
        </Link>
      </div>

      {!hasModule && (
        <div className="card p-6">
          <h2 className="text-lg font-medium">Grant management is not enabled</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Enable the grant management module before configuring grant workflow rules.
          </p>
        </div>
      )}

      {hasModule && configuredStages.length === 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-medium">No workflow configuration yet</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Builder can add checklist items, required fields, stage labels, and approval notes for grant stages.
          </p>
        </div>
      )}

      {configuredStages.map(stage => {
        const stageRows = rowsByStage.get(stage) ?? [];
        const labelRow = stageRows.find(row => row.config_type === 'stage_label');
        const checklistRows = stageRows.filter(row => row.config_type === 'stage_checklist');
        const requiredRows = stageRows.filter(row => row.config_type === 'required_field');
        const approvalRow = stageRows.find(row => row.config_type === 'approval_requirement');
        const labelOverride = labelRow?.config_value.value;

        return (
          <section key={stage} className="card p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-lg font-medium">
                {typeof labelOverride === 'string' && labelOverride ? labelOverride : stageLabel(stage)}
              </h2>
              <span className="font-mono text-xs text-neutral-400">{stage}</span>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Checklist Items</h3>
                {checklistRows.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-400">None</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {checklistRows.map(row => (
                      <li key={row.id} className="text-sm text-neutral-700">
                        <span className="font-medium">{String(row.config_value.label ?? row.config_key)}</span>
                        {row.config_value.required === true && (
                          <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            required
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Required Fields</h3>
                {requiredRows.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-400">None</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {requiredRows.map(row => (
                      <li key={row.id} className="text-sm text-neutral-700">
                        <span className="font-mono text-xs">{row.config_key}</span>
                        {typeof row.config_value.error_message === 'string' && row.config_value.error_message && (
                          <p className="mt-0.5 text-xs text-neutral-500">{row.config_value.error_message}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Approval</h3>
                {approvalRow ? (
                  <p className="mt-2 text-sm text-neutral-700">
                    {String(approvalRow.config_value.description || 'Approval noted for this stage')}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-neutral-400">None</p>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
