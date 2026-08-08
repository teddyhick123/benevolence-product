// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const START = '<!-- schema-change-protocol:start -->';
const END = '<!-- schema-change-protocol:end -->';

function protocol(file: string): string {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(START);
  const end = source.indexOf(END);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${file} is missing the marked schema change protocol`);
  }

  return source.slice(start, end + END.length);
}

describe('agent schema-change instructions', () => {
  const agents = protocol('AGENTS.md');
  const claude = protocol('CLAUDE.md');

  it('keeps the shared protocol identical across agent entrypoints', () => {
    expect(claude).toBe(agents);
  });

  it.each([
    'db/migrations',
    'never per-client DDL',
    'org_custom_field_definitions',
    'org_custom_field_values',
    'kpi_definitions',
    'org_view_config',
    'Prerelease corrections that require editing an owning migration',
    'lib/database.types.ts',
    'npm run verify:migrations',
    'repository boundaries',
    'ai_turns',
    'ai_messages',
    '(user_id, request_id)',
    'begin_ai_turn',
    'complete_ai_turn',
    'fail_ai_turn',
    'at-most-once',
  ])('retains required schema guardrail: %s', (rule) => {
    expect(agents).toContain(rule);
  });
});
