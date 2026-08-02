// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCustomFieldRepository } from '@/lib/api/repositories/custom-fields';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc, mockRunAutomation } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockRunAutomation: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/tasks/automation/dynamic-rules', () => ({
  runAutomationRulesForEvent: mockRunAutomation,
}));

const db = { from: mockFrom, rpc: mockRpc };
const scope = { orgId: 'org-1', actorId: 'actor-1' };
const ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const definition = {
  id: 'field-1',
  org_id: 'org-1',
  entity_type: 'grant',
  field_key: 'strategic_alignment',
  field_label: 'Strategic alignment',
  field_type: 'integer',
  enum_options: null,
  required_at_stage: null,
  is_ai_readable: true,
  sort_order: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRpc.mockResolvedValue({ data: 'org-1', error: null });
  mockRunAutomation.mockResolvedValue({});
});

describe('createCustomFieldRepository', () => {
  it('forces organization scope when listing definitions', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await createCustomFieldRepository(scope).listDefinitions('grant');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['entity_type', 'grant'] });
  });

  it('scopes both definition lookup and update to the authorized org', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'field-1', entity_type: 'grant', field_type: 'text' }, error: null } }
    );
    const update = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'field-1', field_label: 'Updated' }, error: null } }
    );
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(update);

    await createCustomFieldRepository(scope).updateDefinition(
      'field-1',
      { field_label: 'Updated' }
    );

    for (const query of [lookup, update]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'field-1'] });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    }
  });

  it('conceals an entity resolved to another organization before reading values', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'org-2', error: null });

    await expect(
      createCustomFieldRepository(scope).getEntityValues('grant', ENTITY_ID)
    ).rejects.toEqual(expect.objectContaining({ message: 'Entity not found', status: 404 }));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('scopes value writes and automation events to the authorized org and actor', async () => {
    const definitions = stubQuery({ data: [definition], error: null });
    const upsert = stubQuery({ data: null, error: null });
    const loadedDefinitions = stubQuery({ data: [definition], error: null });
    const loadedValues = stubQuery({
      data: [{
        id: 'value-1',
        field_definition_id: 'field-1',
        value_text: null,
        value_numeric: 4,
        value_boolean: null,
        value_date: null,
      }],
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(definitions)
      .mockReturnValueOnce(upsert)
      .mockReturnValueOnce(loadedDefinitions)
      .mockReturnValueOnce(loadedValues);

    const result = await createCustomFieldRepository(scope).setEntityValues(
      'grant',
      ENTITY_ID,
      { strategic_alignment: 4 }
    );

    expect(upsert.calls).toContainEqual({
      method: 'upsert',
      args: [expect.objectContaining({
        org_id: 'org-1',
        entity_type: 'grant',
        entity_id: ENTITY_ID,
        field_definition_id: 'field-1',
        value_numeric: 4,
      }), { onConflict: 'entity_id,field_definition_id' }],
    });
    expect(mockRunAutomation).toHaveBeenCalledWith(db, expect.objectContaining({
      orgId: 'org-1',
      entityId: ENTITY_ID,
      payload: expect.objectContaining({ actor_id: 'actor-1' }),
    }));
    expect(result.values).toEqual({ strategic_alignment: 4 });
  });

  it('verifies every batch entity against the authorized organization', async () => {
    const grants = stubQuery({ data: [{ id: ENTITY_ID }], error: null });
    const definitions = stubQuery({ data: [], error: null });
    const values = stubQuery({ data: [], error: null });
    mockFrom
      .mockReturnValueOnce(grants)
      .mockReturnValueOnce(definitions)
      .mockReturnValueOnce(values);

    await createCustomFieldRepository(scope).getBatchValues('grant', [ENTITY_ID]);

    expect(grants.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(grants.calls).toContainEqual({ method: 'in', args: ['id', [ENTITY_ID]] });
    for (const query of [definitions, values]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['entity_type', 'grant'] });
    }
  });

  it('does not expose elevated database access', () => {
    const repository = createCustomFieldRepository(scope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
