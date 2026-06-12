// lib/tasks/entity-links.ts
// Pure function: maps a task_entity_links row + sibling links to a destination URL.

export type EntityLink = {
  entity_type: string;
  entity_id: string;
  relationship: string;
};

// Grant sub-entity types that resolve through a context 'grant' link.
const GRANT_SUB_TYPES = new Set(['grant_milestone', 'grant_report', 'grant_payment']);

export function getEntityUrl(
  link: EntityLink,
  allLinks: EntityLink[],
  orgId: string
): string | null {
  const { entity_type, entity_id } = link;

  if (entity_type === 'grant') {
    return `/dashboard/grants/${entity_id}`;
  }

  if (GRANT_SUB_TYPES.has(entity_type)) {
    const grantLink = allLinks.find(l => l.entity_type === 'grant');
    if (!grantLink) return null;
    return `/dashboard/grants/${grantLink.entity_id}`;
  }

  if (entity_type === 'filing' || entity_type === 'state_registration') {
    return '/dashboard/compliance';
  }

  if (entity_type === 'donor') {
    return `/org/${orgId}/donors/${entity_id}`;
  }

  if (entity_type === 'pledge' || entity_type === 'pledge_installment') {
    return '/dashboard/pledges';
  }

  if (entity_type === 'holding') {
    return `/dashboard/holdings/${entity_id}`;
  }

  if (entity_type === 'portfolio') {
    return `/dashboard?portfolio_id=${entity_id}`;
  }

  if (entity_type === 'import_job') {
    return '/admin/upload';
  }

  return null;
}
