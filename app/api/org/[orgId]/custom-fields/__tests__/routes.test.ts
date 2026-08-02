// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireOrgAccess,
  mockCreateRepository,
  mockListDefinitions,
  mockCreateDefinition,
  mockUpdateDefinition,
  mockDeleteDefinition,
  mockGetEntityValues,
  mockSetEntityValues,
  mockGetBatchValues,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateRepository: vi.fn(),
  mockListDefinitions: vi.fn(),
  mockCreateDefinition: vi.fn(),
  mockUpdateDefinition: vi.fn(),
  mockDeleteDefinition: vi.fn(),
  mockGetEntityValues: vi.fn(),
  mockSetEntityValues: vi.fn(),
  mockGetBatchValues: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/custom-fields', () => ({
  CustomFieldRepositoryError: class CustomFieldRepositoryError extends Error {},
  createCustomFieldRepository: mockCreateRepository,
}));

import {
  GET as getDefinitions,
  POST as createDefinition,
} from '@/app/api/org/[orgId]/custom-fields/route';
import { PATCH as updateDefinition } from '@/app/api/org/[orgId]/custom-fields/[fieldId]/route';
import {
  GET as getValues,
  PUT as setValues,
} from '@/app/api/org/[orgId]/custom-fields/values/route';
import { GET as getBatchValues } from '@/app/api/org/[orgId]/custom-fields/batch/route';

const ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const context = {
  orgId: 'org-1',
  role: 'admin',
  principal: { kind: 'user', userId: 'actor-1' },
  user: { id: 'actor-1' },
  db: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
  mockCreateRepository.mockReturnValue({
    listDefinitions: mockListDefinitions,
    createDefinition: mockCreateDefinition,
    updateDefinition: mockUpdateDefinition,
    deleteDefinition: mockDeleteDefinition,
    getEntityValues: mockGetEntityValues,
    setEntityValues: mockSetEntityValues,
    getBatchValues: mockGetBatchValues,
  });
  mockListDefinitions.mockResolvedValue([]);
  mockCreateDefinition.mockResolvedValue({ id: 'field-1' });
  mockUpdateDefinition.mockResolvedValue({ id: 'field-1', field_label: 'Updated' });
  mockGetEntityValues.mockResolvedValue({ fields: [], values: {} });
  mockSetEntityValues.mockResolvedValue({ fields: [], values: {} });
  mockGetBatchValues.mockResolvedValue({ fields: [], values_by_entity: { [ENTITY_ID]: {} } });
});

describe('organization custom-field routes', () => {
  it('denies before constructing elevated custom-field access', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await getDefinitions(
      new NextRequest('http://localhost/api/org/org-1/custom-fields'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mockCreateRepository).not.toHaveBeenCalled();
  });

  it('lists definitions for viewers through the guarded org repository', async () => {
    const response = await getDefinitions(
      new NextRequest('http://localhost/api/org/org-1/custom-fields?entity_type=grant'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'viewer');
    expect(mockCreateRepository).toHaveBeenCalledWith({ orgId: 'org-1', actorId: 'actor-1' });
    expect(mockListDefinitions).toHaveBeenCalledWith('grant');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('requires admin access to create and update definitions', async () => {
    const created = await createDefinition(
      new NextRequest('http://localhost/api/org/org-1/custom-fields', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'grant',
          field_label: 'Strategic alignment',
          field_type: 'integer',
        }),
      }),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );
    expect(mockRequireOrgAccess).toHaveBeenLastCalledWith('org-1', 'admin');
    expect(mockCreateDefinition).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'grant',
      field_key: 'strategic_alignment',
      field_type: 'integer',
    }));
    expect(created.status).toBe(201);

    await updateDefinition(
      new NextRequest('http://localhost/api/org/org-1/custom-fields/field-1', {
        method: 'PATCH',
        body: JSON.stringify({ field_label: 'Updated' }),
      }),
      { params: Promise.resolve({ orgId: 'org-1', fieldId: 'field-1' }) }
    );
    expect(mockRequireOrgAccess).toHaveBeenLastCalledWith('org-1', 'admin');
    expect(mockUpdateDefinition).toHaveBeenCalledWith('field-1', { field_label: 'Updated' });
  });

  it('allows viewers to read values but requires member access to write them', async () => {
    await getValues(
      new NextRequest(`http://localhost/api/org/org-1/custom-fields/values?entity_type=grant&entity_id=${ENTITY_ID}`),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );
    expect(mockRequireOrgAccess).toHaveBeenLastCalledWith('org-1', 'viewer');
    expect(mockGetEntityValues).toHaveBeenCalledWith('grant', ENTITY_ID);

    await setValues(
      new NextRequest('http://localhost/api/org/org-1/custom-fields/values', {
        method: 'PUT',
        body: JSON.stringify({
          entity_type: 'grant',
          entity_id: ENTITY_ID,
          values: { strategic_alignment: 4 },
        }),
      }),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );
    expect(mockRequireOrgAccess).toHaveBeenLastCalledWith('org-1', 'member');
    expect(mockSetEntityValues).toHaveBeenCalledWith(
      'grant',
      ENTITY_ID,
      { strategic_alignment: 4 }
    );
  });

  it('batch-loads only after viewer access is established', async () => {
    await getBatchValues(
      new NextRequest(`http://localhost/api/org/org-1/custom-fields/batch?entity_type=grant&entity_ids=${ENTITY_ID}`),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'viewer');
    expect(mockGetBatchValues).toHaveBeenCalledWith('grant', [ENTITY_ID]);
  });
});
