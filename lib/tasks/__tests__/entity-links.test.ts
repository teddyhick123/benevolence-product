// lib/tasks/__tests__/entity-links.test.ts
import { describe, it, expect } from 'vitest';
import { getEntityUrl } from '../entity-links';

const GRANT_ID     = 'gggggggg-gggg-gggg-gggg-gggggggggggg';
const MILESTONE_ID = 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';
const DONOR_ID     = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const HOLDING_ID   = 'hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh';
const PORTFOLIO_ID = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const IMPORT_ID    = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii';
const ORG_ID       = 'oooooooo-oooo-oooo-oooo-oooooooooooo';

const GRANT_LINK = { entity_type: 'grant' as const, entity_id: GRANT_ID, relationship: 'context' as const };

describe('getEntityUrl', () => {
  it('links a grant entity to /dashboard/grants/[id]', () => {
    expect(getEntityUrl({ entity_type: 'grant', entity_id: GRANT_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('links grant_milestone to the context grant page', () => {
    const links = [
      { entity_type: 'grant_milestone' as const, entity_id: MILESTONE_ID, relationship: 'primary' as const },
      GRANT_LINK,
    ];
    expect(getEntityUrl(links[0], links, ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('returns null for grant_milestone when no context grant link exists', () => {
    const links = [{ entity_type: 'grant_milestone' as const, entity_id: MILESTONE_ID, relationship: 'primary' as const }];
    expect(getEntityUrl(links[0], links, ORG_ID)).toBeNull();
  });

  it('links grant_report to the context grant page', () => {
    const reportId = 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr';
    const links = [
      { entity_type: 'grant_report' as const, entity_id: reportId, relationship: 'primary' as const },
      GRANT_LINK,
    ];
    expect(getEntityUrl(links[0], links, ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('links grant_payment to the context grant page', () => {
    const payId = 'payyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy';
    const links = [
      { entity_type: 'grant_payment' as const, entity_id: payId, relationship: 'primary' as const },
      GRANT_LINK,
    ];
    expect(getEntityUrl(links[0], links, ORG_ID))
      .toBe(`/dashboard/grants/${GRANT_ID}`);
  });

  it('links filing and state_registration to /dashboard/compliance', () => {
    expect(getEntityUrl({ entity_type: 'filing', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/compliance');
    expect(getEntityUrl({ entity_type: 'state_registration', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/compliance');
  });

  it('links donor to /org/[orgId]/donors/[id]', () => {
    expect(getEntityUrl({ entity_type: 'donor', entity_id: DONOR_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/org/${ORG_ID}/donors/${DONOR_ID}`);
  });

  it('links pledge and pledge_installment to /dashboard/pledges', () => {
    expect(getEntityUrl({ entity_type: 'pledge', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/pledges');
    expect(getEntityUrl({ entity_type: 'pledge_installment', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBe('/dashboard/pledges');
  });

  it('links holding to /dashboard/holdings/[id]', () => {
    expect(getEntityUrl({ entity_type: 'holding', entity_id: HOLDING_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/dashboard/holdings/${HOLDING_ID}`);
  });

  it('links portfolio to /dashboard?portfolio_id=[id]', () => {
    expect(getEntityUrl({ entity_type: 'portfolio', entity_id: PORTFOLIO_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe(`/dashboard?portfolio_id=${PORTFOLIO_ID}`);
  });

  it('links import_job to /admin/upload', () => {
    expect(getEntityUrl({ entity_type: 'import_job', entity_id: IMPORT_ID, relationship: 'primary' }, [], ORG_ID))
      .toBe('/admin/upload');
  });

  it('returns null for workflow_instance (no dedicated page)', () => {
    expect(getEntityUrl({ entity_type: 'workflow_instance', entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBeNull();
  });

  it('returns null for unknown entity types', () => {
    expect(getEntityUrl({ entity_type: 'unknown_type' as any, entity_id: 'x', relationship: 'primary' }, [], ORG_ID))
      .toBeNull();
  });
});
