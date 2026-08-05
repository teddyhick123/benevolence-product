// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/0033_ai_sessions.sql'),
  'utf8',
);

describe('AI chat session security contract', () => {
  it('binds session creation to the authenticated user and a visible portfolio', () => {
    const functionSql = migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_or_create_ai_session[\s\S]*?\n\$\$;/,
    )?.[0];

    expect(functionSql).toContain(
      "auth.role() IS DISTINCT FROM 'service_role'",
    );
    expect(functionSql).toContain('auth.uid() IS DISTINCT FROM p_user_id');
    expect(functionSql).toContain(
      'public.can_view_portfolio(p_portfolio_id) IS NOT TRUE',
    );
    expect(functionSql).toContain("RAISE EXCEPTION 'Access denied'");
  });

  it.each([
    'get_or_create_ai_session(UUID, UUID)',
    'begin_ai_turn(UUID, UUID, UUID, JSONB)',
    'complete_ai_turn(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB)',
    'fail_ai_turn(UUID, UUID, UUID, TEXT, TEXT)',
    'undo_ai_action(UUID)',
    'redo_ai_action(UUID)',
  ])('revokes public execution of %s', (signature) => {
    expect(migration).toContain(
      `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`,
    );
    expect(migration).toContain(
      `GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`,
    );
  });

  it('normalizes messages behind an immutable request-id turn boundary', () => {
    expect(migration).not.toMatch(/ai_sessions \([\s\S]*?messages\s+JSONB/);
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.ai_turns');
    expect(migration).toContain('UNIQUE (user_id, request_id)');
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS public.ai_messages',
    );
    expect(migration).toContain('UNIQUE (turn_id, role)');
    expect(migration).toContain(
      'GRANT SELECT ON public.ai_turns TO authenticated',
    );
    expect(migration).toContain(
      'GRANT SELECT ON public.ai_messages TO authenticated',
    );
    expect(migration).not.toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_turns TO authenticated',
    );
  });

  it('rejects an idempotency key reused with a different request payload', () => {
    const functionSql = migration.match(
      /CREATE OR REPLACE FUNCTION public\.begin_ai_turn[\s\S]*?\n\$\$;/,
    )?.[0];

    expect(functionSql).toContain(
      "p_user_id::TEXT || ':' || p_request_id::TEXT",
    );
    expect(functionSql).toContain(
      'v_existing_content IS DISTINCT FROM p_content',
    );
    expect(functionSql).toContain(
      "RAISE EXCEPTION 'Idempotency key reused for a different request'",
    );
  });

  it.each(['begin_ai_turn', 'complete_ai_turn', 'fail_ai_turn'])(
    '%s fixes portfolio and user scope inside its security-definer boundary',
    (name) => {
      const functionSql = migration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0];
      expect(functionSql).toContain(
        "auth.role() IS DISTINCT FROM 'service_role'",
      );
      expect(functionSql).toContain('auth.uid() IS DISTINCT FROM p_user_id');
      expect(functionSql).toContain(
        'public.can_view_portfolio(p_portfolio_id) IS NOT TRUE',
      );
    },
  );
});
