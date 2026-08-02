// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/0033_ai_sessions.sql'),
  'utf8'
);

function functionBody(name: string): string {
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`
  ));
  if (!match) throw new Error(`Missing ${name}`);
  return match[0];
}

describe('AI action replay security contract', () => {
  it.each(['undo_ai_action', 'redo_ai_action'])(
    '%s requires portfolio edit access inside its security-definer boundary',
    (name) => {
      const sql = functionBody(name);
      expect(sql).toContain("auth.role() IS DISTINCT FROM 'service_role'");
      expect(sql).toContain('public.can_edit_portfolio(v_action.portfolio_id) IS NOT TRUE');
      expect(sql).toContain("jsonb_build_object('success', false, 'error', 'Action not found')");
    }
  );
});
