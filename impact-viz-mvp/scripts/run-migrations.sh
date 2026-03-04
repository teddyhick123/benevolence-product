#!/bin/bash

# =============================================================================
# Run Database Migrations
# =============================================================================
# Usage: ./scripts/run-migrations.sh
#
# Runs all SQL migration files in /db/ directory in order.
# Requires SUPABASE_DB_URL environment variable or Supabase CLI setup.
# =============================================================================

set -e

DB_DIR="./db"

echo "=================================================="
echo "  Running Database Migrations"
echo "=================================================="
echo ""

# Check if db directory exists
if [ ! -d "$DB_DIR" ]; then
    echo "Error: $DB_DIR directory not found"
    exit 1
fi

# Get sorted list of SQL files
migrations=$(ls -1 "$DB_DIR"/*.sql 2>/dev/null | sort)

if [ -z "$migrations" ]; then
    echo "No migration files found in $DB_DIR"
    exit 0
fi

echo "Found migrations:"
echo "$migrations" | while read f; do echo "  - $(basename $f)"; done
echo ""

# Check for Supabase CLI
if command -v supabase &> /dev/null; then
    echo "Using Supabase CLI..."
    echo ""

    for file in $migrations; do
        filename=$(basename "$file")
        echo "Running: $filename"
        supabase db execute --file "$file" 2>&1 || {
            echo "Warning: Migration $filename may have already been applied or had an error"
        }
    done
else
    # Alternative: use psql if SUPABASE_DB_URL is set
    if [ -n "$SUPABASE_DB_URL" ]; then
        echo "Using psql with SUPABASE_DB_URL..."
        echo ""

        for file in $migrations; do
            filename=$(basename "$file")
            echo "Running: $filename"
            psql "$SUPABASE_DB_URL" -f "$file" 2>&1 || {
                echo "Warning: Migration $filename may have already been applied or had an error"
            }
        done
    else
        echo "Error: Neither Supabase CLI nor SUPABASE_DB_URL available"
        echo ""
        echo "Options:"
        echo "1. Install Supabase CLI: npm install -g supabase"
        echo "2. Set SUPABASE_DB_URL environment variable"
        echo "3. Run migrations manually via Supabase Dashboard > SQL Editor"
        exit 1
    fi
fi

echo ""
echo "=================================================="
echo "  Migrations Complete"
echo "=================================================="
