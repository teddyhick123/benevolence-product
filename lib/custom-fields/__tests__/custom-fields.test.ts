import { describe, expect, it, vi } from 'vitest';
import {
  checkRequiredGrantCustomFields,
  normalizeFieldKey,
  typedValuePatch,
  valueFromRow,
} from '@/lib/custom-fields';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const GRANT_ID = '22222222-2222-2222-2222-222222222222';

describe('custom field helpers', () => {
  it('normalizes labels to stable field keys', () => {
    expect(normalizeFieldKey('Strategic Alignment Score')).toBe('strategic_alignment_score');
    expect(normalizeFieldKey(' 2026 Priority ')).toBe('field_2026_priority');
  });

  it('coerces typed values into the correct storage column', () => {
    expect(typedValuePatch({ field_type: 'text', enum_options: null }, 'hello')).toMatchObject({ value_text: 'hello' });
    expect(typedValuePatch({ field_type: 'integer', enum_options: null }, '4')).toMatchObject({ value_numeric: 4 });
    expect(typedValuePatch({ field_type: 'decimal', enum_options: null }, '4.25')).toMatchObject({ value_numeric: 4.25 });
    expect(typedValuePatch({ field_type: 'boolean', enum_options: null }, false)).toMatchObject({ value_boolean: false });
    expect(typedValuePatch({ field_type: 'date', enum_options: null }, '2026-07-08')).toMatchObject({ value_date: '2026-07-08' });
    expect(typedValuePatch({
      field_type: 'enum',
      enum_options: [{ value: 'high', label: 'High' }],
    }, 'high')).toMatchObject({ value_text: 'high' });
  });

  it('rejects invalid integer, date, and enum values', () => {
    expect(() => typedValuePatch({ field_type: 'integer', enum_options: null }, '4.25')).toThrow(/integer/);
    expect(() => typedValuePatch({ field_type: 'date', enum_options: null }, 'July 8')).toThrow(/YYYY-MM-DD/);
    expect(() => typedValuePatch({
      field_type: 'enum',
      enum_options: [{ value: 'high', label: 'High' }],
    }, 'low')).toThrow(/Invalid enum/);
  });

  it('reads the first populated typed value from a row', () => {
    expect(valueFromRow({ value_text: null, value_numeric: '3.5', value_boolean: null, value_date: null })).toBe(3.5);
    expect(valueFromRow({ value_text: null, value_numeric: null, value_boolean: false, value_date: null })).toBe(false);
  });
});

describe('checkRequiredGrantCustomFields', () => {
  function makeDb(definitions: any[], values: any[] = []) {
    return {
      from: (table: string) => {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          in: vi.fn(() => Promise.resolve({ data: values, error: null })),
          then: (resolve: any) => Promise.resolve({
            data: table === 'org_custom_field_definitions' ? definitions : values,
            error: null,
          }).then(resolve),
        };
        return b;
      },
    } as any;
  }

  it('blocks when a required grant custom field is missing', async () => {
    const reasons = await checkRequiredGrantCustomFields(makeDb([
      { id: 'field-1', field_label: 'Strategic Alignment Score', field_key: 'strategic_alignment_score' },
    ]), ORG_ID, GRANT_ID, 'due_diligence');

    expect(reasons).toEqual(['Custom field required: Strategic Alignment Score']);
  });

  it('does not block when the required custom field value is set', async () => {
    const reasons = await checkRequiredGrantCustomFields(makeDb(
      [{ id: 'field-1', field_label: 'Strategic Alignment Score', field_key: 'strategic_alignment_score' }],
      [{ field_definition_id: 'field-1', value_text: null, value_numeric: 4, value_boolean: null, value_date: null }]
    ), ORG_ID, GRANT_ID, 'due_diligence');

    expect(reasons).toEqual([]);
  });
});
