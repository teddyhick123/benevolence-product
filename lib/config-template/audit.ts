import { templateSha256 } from '@/lib/config-template/canonical';
import type { ConfigTemplate } from '@/lib/config-template/types';
import type { Tx } from '@/lib/org-import/connection';

/** Record an export only when its supplied actor is an active org member. */
export async function auditConfigExport(
  tx: Tx,
  input: { orgId: string; actorId: string; template: ConfigTemplate },
): Promise<void> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT user_id
     FROM public.organization_members
     WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL
     FOR UPDATE`,
    [input.orgId, input.actorId],
  );
  if (!rows[0]) {
    throw new Error('The export audit actor must be an active organization member.');
  }
  await tx.query(
    `INSERT INTO public.org_audit_log (org_id, actor_id, actor_subject_id, action, metadata)
     VALUES ($1, $2, $2, 'configuration_template_exported', $3::jsonb)`,
    [input.orgId, input.actorId, JSON.stringify({
      template_sha256: templateSha256(input.template),
      source_org_name: input.template.metadata.sourceOrgName,
    })],
  );
}
