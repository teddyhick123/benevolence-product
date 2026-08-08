// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SCHEMA_START = '<!-- schema-change-protocol:start -->';
const SCHEMA_END = '<!-- schema-change-protocol:end -->';
const CLIENT_START = '<!-- client-data-protocol:start -->';
const CLIENT_END = '<!-- client-data-protocol:end -->';

function markedSection(file: string, startMarker: string, endMarker: string): string {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${file} is missing the marked schema change protocol`);
  }

  return source.slice(start, end + endMarker.length);
}

describe('agent schema-change instructions', () => {
  const agents = markedSection('AGENTS.md', SCHEMA_START, SCHEMA_END);
  const claude = markedSection('CLAUDE.md', SCHEMA_START, SCHEMA_END);

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

describe('agent client-data instructions', () => {
  const agents = markedSection('AGENTS.md', CLIENT_START, CLIENT_END);
  const claude = markedSection('CLAUDE.md', CLIENT_START, CLIENT_END);

  it('keeps the shared client-data protocol identical across agent entrypoints', () => {
    expect(claude).toBe(agents);
  });

  it.each([
    'lib/api/client.ts',
    'requestJson',
    'uploadJson',
    'requestDownload',
    'requestStream',
    'lib/<domain>/hooks.ts',
    'must not define local SWR fetchers or call raw `fetch`',
    'must not be recreated',
    'never authority',
    'requestId',
    'at-most-once tool side effects',
  ])('retains required client-data guardrail: %s', (rule) => {
    expect(agents).toContain(rule);
  });
});
