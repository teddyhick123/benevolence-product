#!/usr/bin/env bash
# Post-reset sanity: the canonical migrations produced a populated public schema
# on the local walkthrough stack (port 54322 per supabase/config.toml).
set -euo pipefail
DB_URL="${VERIFY_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
count=$(psql "$DB_URL" -Atc "select count(*) from pg_tables where schemaname='public'")
if [ "${count:-0}" -lt 10 ]; then
  echo "migrations-assert: expected >=10 public tables after reset, got ${count}" >&2
  exit 1
fi
echo "migrations-assert: ${count} public tables present"
