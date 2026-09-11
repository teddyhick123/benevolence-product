// lib/org-import/connection.ts
// A real Postgres transaction for archive import.
//
// supabase-js commits every call separately, so it cannot express the
// all-or-nothing load this phase requires. A direct pg connection can.
//
// This directory is the archive importer. lib/import/ is the unrelated
// spreadsheet ETL pipeline and shares nothing with it.

import { Client } from 'pg';

export type Tx = {
  query: <T = unknown>(_sql: string, _params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

export function databaseUrl(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL is required for archive import. For the local stack it is ' +
      'printed by `supabase status` as the DB URL.',
    );
  }
  return url;
}

export async function withTransaction<T>(fn: (_tx: Tx) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    const tx: Tx = {
      query: async <R = unknown>(sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
      },
    };
    const value = await fn(tx);
    await client.query('COMMIT');
    return value;
  } catch (err) {
    // Rollback must not mask the original failure.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}
