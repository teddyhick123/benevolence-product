// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AIStreamChunk } from '@/lib/ai/types';
import {
  callsTool,
  callsNoToolNamed,
  containsAll,
  omitsPlaceholders,
  groundedIn,
  withinTokens,
  jsonMatchesSchema,
  streamsProgressively,
} from '@/lib/ai/evals/assertions';

const toolResponse = {
  content: [{ type: 'tool_use' as const, id: 't1', name: 'create_holding', input: { name: 'X' } }],
  stopReason: 'tool_use',
  model: 'm',
};

describe('tool assertions', () => {
  it('passes when the expected tool is called', () => {
    expect(callsTool('create_holding').check({ text: '', response: toolResponse }).passed).toBe(true);
  });

  it('fails when no tool is called', () => {
    const outcome = callsTool('create_holding').check({
      text: 'I would create it',
      response: { content: [{ type: 'text', text: 'I would create it' }], stopReason: 'end_turn', model: 'm' },
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.detail).toMatch(/no tool call/i);
  });

  it('detects a forbidden tool call, which is how injection resistance is measured', () => {
    const outcome = callsNoToolNamed('delete_holding').check({
      text: '',
      response: {
        content: [{ type: 'tool_use', id: 't1', name: 'delete_holding', input: {} }],
        stopReason: 'tool_use',
        model: 'm',
      },
    });
    expect(outcome.passed).toBe(false);
  });
});

describe('content assertions', () => {
  it('requires every supplied value to appear', () => {
    expect(containsAll(['Acme', '$500']).check({ text: 'Acme gave $500' }).passed).toBe(true);
    expect(containsAll(['Acme', '$500']).check({ text: 'Acme gave money' }).passed).toBe(false);
  });

  it('rejects placeholder text', () => {
    expect(omitsPlaceholders().check({ text: 'Dear [INSERT NAME]' }).passed).toBe(false);
    expect(omitsPlaceholders().check({ text: 'Dear Acme' }).passed).toBe(true);
  });

  it('treats a value absent from the source as ungrounded', () => {
    const source = 'Employer Identification Number 12-3456789 for Acme Trust.';
    expect(groundedIn().check({ text: '', json: { ein: '12-3456789' }, sourceText: source }).passed).toBe(true);
    expect(groundedIn().check({ text: '', json: { ein: '99-9999999' }, sourceText: source }).passed).toBe(false);
  });

  it('enforces a token ceiling', () => {
    expect(withinTokens(5).check({ text: 'one two three' }).passed).toBe(true);
    expect(withinTokens(2).check({ text: 'one two three four five six' }).passed).toBe(false);
  });
});

describe('structural assertions', () => {
  it('validates JSON against a schema', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    };
    expect(jsonMatchesSchema(schema).check({ text: '', json: { name: 'x' } }).passed).toBe(true);
    expect(jsonMatchesSchema(schema).check({ text: '', json: {} }).passed).toBe(false);
  });

  it('requires more than one text delta to count as streaming', () => {
    const many: AIStreamChunk[] = [
      { type: 'message_start', model: 'm' },
      { type: 'text_delta', text: 'a' },
      { type: 'text_delta', text: 'b' },
      { type: 'message_stop', stopReason: 'end_turn', model: 'm' },
    ];
    expect(streamsProgressively().check({ text: 'ab', chunks: many }).passed).toBe(true);
    expect(streamsProgressively().check({
      text: 'ab',
      chunks: [{ type: 'message_start' }, { type: 'text_delta', text: 'ab' }, { type: 'message_stop' }],
    } as never).passed).toBe(false);
  });
});
