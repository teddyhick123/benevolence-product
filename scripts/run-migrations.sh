#!/usr/bin/env bash
# =============================================================================
# scripts/run-migrations.sh
# Apply all pending migrations to a Supabase project.
# Wraps migrate-client.ts with sane defaults for new deployments.
#
# Usage:
#   # Apply all migrations (new deployment)
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_ACCESS_TOKEN=sbp_xxx \
#   ./scripts/run-migrations.sh
#
#   # Dry run (print SQL without executing)
#   ./scripts/run-migrations.sh --dry-run
#
#   # Seed demo data after migrations (local dev only)
#   ./scripts/run-migrations.sh --seed-demo
#
#   # Apply from a specific migration number
#   ./scripts/run-migrations.sh --from 0010
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/db/migrations"
DEMO_SEED="$PROJECT_ROOT/db/demo/seed_demo_org.sql"

DRY_RUN=false
SEED_DEMO=false
FROM_ARG=""

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --seed-demo)  SEED_DEMO=true ;;
    --from)       shift; FROM_ARG="$1" ;;
    --from=*)     FROM_ARG="${arg#*=}" ;;
    --help|-h)
      sed -n '2,25p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

# Ensure required tools are available
if ! command -v npx &>/dev/null; then
  echo "Error: npx not found. Install Node.js first." >&2
  exit 1
fi

# Validate required env (unless dry-run)
if ! $DRY_RUN; then
  if [ -z "${SUPABASE_URL:-}" ]; then
    echo "Error: SUPABASE_URL is required." >&2
    echo "  export SUPABASE_URL=https://your-ref.supabase.co" >&2
    exit 1
  fi
  if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
    echo "Error: SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_KEY is required." >&2
    exit 1
  fi
fi

echo "========================================"
echo "  Impact Platform Migration Runner"
echo "  Migrations: $MIGRATIONS_DIR"
if ! $DRY_RUN; then
  echo "  Target: ${SUPABASE_URL:-local}"
fi
echo "========================================"
echo ""

# Build migrate-client args
MIGRATE_ARGS=""
if $DRY_RUN; then
  MIGRATE_ARGS="$MIGRATE_ARGS --dry-run"
fi
if [ -n "$FROM_ARG" ]; then
  MIGRATE_ARGS="$MIGRATE_ARGS --from $FROM_ARG"
fi

# Run migrations
npx ts-node "$SCRIPT_DIR/migrate-client.ts" --to latest $MIGRATE_ARGS

# Optionally seed demo data
if $SEED_DEMO && ! $DRY_RUN; then
  echo ""
  echo "Seeding demo data…"
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "Warning: DATABASE_URL not set — cannot seed demo data via psql."
    echo "  Set DATABASE_URL=postgresql://... and re-run with --seed-demo"
  else
    psql "$DATABASE_URL" -f "$DEMO_SEED"
    echo "Demo data seeded."
  fi
fi

echo ""
echo "Done."
