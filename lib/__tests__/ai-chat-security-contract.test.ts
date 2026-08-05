// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/0033_ai_sessions.sql'),
  'utf8'
);

describe('AI chat session security contract', () => {
  it('binds session creation to the authenticated user and a visible portfolio', () => {
    const functionSql = migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_or_create_ai_session[\s\S]*?\n\$\$;/
    )?.[0];

    expect(functionSql).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(functionSql).toContain('auth.uid() IS DISTINCT FROM p_user_id');
    expect(functionSql).toContain('public.can_view_portfolio(p_portfolio_id) IS NOT TRUE');
    expect(functionSql).toContain("RAISE EXCEPTION 'Access denied'");
  });

  it.each([
    'get_or_create_ai_session(UUID, UUID)',
    'undo_ai_action(UUID)',
    'redo_ai_action(UUID)',
  ])('revokes public execution of %s', (signature) => {
    expect(migration).toContain(
      `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`
    );
    expect(migration).toContain(
      `GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`
    );
  });
});
