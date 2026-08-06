#!/usr/bin/env bash
# Post-reset sanity: the canonical migrations produced a populated public schema
# on the local walkthrough stack (port 54322 per supabase/config.toml).
set -euo pipefail
DB_URL="${VERIFY_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DB_CONTAINER="${VERIFY_LOCAL_DB_CONTAINER:-supabase_db_benevolence-walkthrough}"
query="select count(*) from pg_tables where schemaname='public'"

if command -v psql >/dev/null 2>&1; then
  count=$(psql "$DB_URL" -Atc "$query")
  psql "$DB_URL" -f scripts/verify/schema-behavior.sql >/dev/null
elif command -v docker >/dev/null 2>&1; then
  count=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc "$query")
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    < scripts/verify/schema-behavior.sql >/dev/null
else
  echo "migrations-assert: requires psql or Docker" >&2
  exit 1
fi
if [ "${count:-0}" -lt 10 ]; then
  echo "migrations-assert: expected >=10 public tables after reset, got ${count}" >&2
  exit 1
fi
echo "migrations-assert: ${count} public tables present"
echo "migrations-assert: schema behavior checks passed"
npm run db:types:check
