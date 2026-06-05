import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('0044_builder_events migration', () => {
  const sql = readFileSync('db/migrations/0044_builder_events.sql', 'utf8');

  it('creates the builder_events table', () => {
    expect(sql).toMatch(/CREATE TABLE.*builder_events/i);
  });

  it('has org_id foreign key to organizations', () => {
    expect(sql).toMatch(/org_id.*REFERENCES.*organizations/i);
  });

  it('has event_type CHECK constraint', () => {
    expect(sql).toMatch(/CHECK.*tool_call.*ai_request/s);
  });

  it('enables RLS on builder_events', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('has org admin read policy', () => {
    expect(sql).toMatch(/is_org_admin/);
  });

  it('has no authenticated INSERT policy — only service_role writes', () => {
    expect(sql).not.toMatch(/FOR INSERT TO authenticated/i);
  });

  it('creates v_builder_tool_usage with security_invoker', () => {
    expect(sql).toMatch(/v_builder_tool_usage/);
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
  });

  it('v_builder_tool_usage filters by is_app_admin()', () => {
    const idx = sql.indexOf('v_builder_tool_usage');
    const snippet = sql.slice(idx, idx + 600);
    expect(snippet).toMatch(/is_app_admin/);
  });

  it('creates v_builder_ai_requests with security_invoker and is_app_admin gate', () => {
    const idx = sql.indexOf('v_builder_ai_requests');
    expect(idx).toBeGreaterThan(-1);
    const snippet = sql.slice(idx, idx + 600);
    expect(snippet).toMatch(/security_invoker\s*=\s*true/i);
    expect(snippet).toMatch(/is_app_admin/);
  });
});

describe('builder_events instrumentation', () => {
  it('executeTool emits tool_call events via adminSupabase', () => {
    const src = readFileSync('lib/builder/tools.ts', 'utf8');
    expect(src).toMatch(/builder_events/);
    expect(src).toMatch(/eventType:.*tool_call/s);
    expect(src).toMatch(/event_type:\s*eventType/);
  });

  it('executeTool awaits builder event inserts and logs failures', () => {
    const src = readFileSync('lib/builder/tools.ts', 'utf8');
    expect(src).toMatch(/const \{ error \} = await adminSupabase\.from\('builder_events'\)\.insert/);
    expect(src).toMatch(/Failed to emit builder event/);
    expect(src).not.toMatch(/void\s+emitBuilderEvent/);
  });

  it('chat route emits ai_request event', () => {
    const src = readFileSync(
      'app/api/org/[orgId]/builder/chat/route.ts',
      'utf8'
    );
    expect(src).toMatch(/builder_events/);
    expect(src).toMatch(/ai_request/);
  });

  it('chat route awaits ai_request event insert and logs failures', () => {
    const src = readFileSync(
      'app/api/org/[orgId]/builder/chat/route.ts',
      'utf8'
    );
    expect(src).toMatch(/await adminSupabase\.from\('builder_events'\)\.insert/);
    expect(src).toMatch(/Failed to emit builder ai_request event/);
  });

  it('chat route emits event after auth check', () => {
    const src = readFileSync(
      'app/api/org/[orgId]/builder/chat/route.ts',
      'utf8'
    );
    const authIdx = src.indexOf('isAdmin');
    const eventIdx = src.indexOf('ai_request');
    expect(authIdx).toBeGreaterThan(-1);
    expect(eventIdx).toBeGreaterThan(authIdx);
  });
});
