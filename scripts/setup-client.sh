#!/bin/bash

# =============================================================================
# Client Setup Script
# =============================================================================
# Usage: ./scripts/setup-client.sh
#
# This script helps set up a new client instance by:
# 1. Copying .env.example to .env.local
# 2. Prompting for required values
# 3. Creating initial configuration
# =============================================================================

set -e

echo "=================================================="
echo "  Impact Platform - Client Setup"
echo "=================================================="
echo ""

# Check if .env.local already exists
if [ -f ".env.local" ]; then
    read -p ".env.local already exists. Overwrite? (y/N): " overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Copy template
cp .env.example .env.local
echo "Created .env.local from template"
echo ""

# Prompt for branding
echo "== Branding Configuration =="
read -p "Application Name [Impact Platform]: " app_name
app_name=${app_name:-"Impact Platform"}

read -p "Company Name [Impact Platform Inc.]: " company_name
company_name=${company_name:-"Impact Platform Inc."}

read -p "Tagline [Manage your impact portfolio]: " tagline
tagline=${tagline:-"Manage your impact portfolio"}

read -p "Support Email [support@example.com]: " support_email
support_email=${support_email:-"support@example.com"}

read -p "Assistant Name [Assistant]: " assistant_name
assistant_name=${assistant_name:-"Assistant"}

read -p "Onboarding Assistant Name [Guide]: " onboarding_name
onboarding_name=${onboarding_name:-"Guide"}

echo ""
echo "== Supabase Configuration =="
read -p "Supabase URL (https://xxx.supabase.co): " supabase_url
read -p "Supabase Anon Key: " supabase_anon
read -p "Supabase Service Role Key: " supabase_service

echo ""
echo "== API Keys =="
read -p "Anthropic API Key: " anthropic_key
read -p "Google Maps API Key (optional, press enter to skip): " google_maps_key

# Update .env.local with values
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|NEXT_PUBLIC_APP_NAME=.*|NEXT_PUBLIC_APP_NAME=\"$app_name\"|" .env.local
    sed -i '' "s|NEXT_PUBLIC_COMPANY_NAME=.*|NEXT_PUBLIC_COMPANY_NAME=\"$company_name\"|" .env.local
    sed -i '' "s|NEXT_PUBLIC_TAGLINE=.*|NEXT_PUBLIC_TAGLINE=\"$tagline\"|" .env.local
    sed -i '' "s|NEXT_PUBLIC_SUPPORT_EMAIL=.*|NEXT_PUBLIC_SUPPORT_EMAIL=\"$support_email\"|" .env.local
    sed -i '' "s|NEXT_PUBLIC_ASSISTANT_NAME=.*|NEXT_PUBLIC_ASSISTANT_NAME=\"$assistant_name\"|" .env.local
    sed -i '' "s|NEXT_PUBLIC_ONBOARDING_ASSISTANT_NAME=.*|NEXT_PUBLIC_ONBOARDING_ASSISTANT_NAME=\"$onboarding_name\"|" .env.local
    sed -i '' "s|NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=\"$supabase_url\"|" .env.local
    sed -i '' "s|NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=\"$supabase_anon\"|" .env.local
    sed -i '' "s|SUPABASE_SERVICE_ROLE=.*|SUPABASE_SERVICE_ROLE=\"$supabase_service\"|" .env.local
    sed -i '' "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=\"$anthropic_key\"|" .env.local
    [ -n "$google_maps_key" ] && sed -i '' "s|GOOGLE_MAPS_API_KEY=.*|GOOGLE_MAPS_API_KEY=\"$google_maps_key\"|" .env.local
else
    # Linux
    sed -i "s|NEXT_PUBLIC_APP_NAME=.*|NEXT_PUBLIC_APP_NAME=\"$app_name\"|" .env.local
    sed -i "s|NEXT_PUBLIC_COMPANY_NAME=.*|NEXT_PUBLIC_COMPANY_NAME=\"$company_name\"|" .env.local
    sed -i "s|NEXT_PUBLIC_TAGLINE=.*|NEXT_PUBLIC_TAGLINE=\"$tagline\"|" .env.local
    sed -i "s|NEXT_PUBLIC_SUPPORT_EMAIL=.*|NEXT_PUBLIC_SUPPORT_EMAIL=\"$support_email\"|" .env.local
    sed -i "s|NEXT_PUBLIC_ASSISTANT_NAME=.*|NEXT_PUBLIC_ASSISTANT_NAME=\"$assistant_name\"|" .env.local
    sed -i "s|NEXT_PUBLIC_ONBOARDING_ASSISTANT_NAME=.*|NEXT_PUBLIC_ONBOARDING_ASSISTANT_NAME=\"$onboarding_name\"|" .env.local
    sed -i "s|NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=\"$supabase_url\"|" .env.local
    sed -i "s|NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=\"$supabase_anon\"|" .env.local
    sed -i "s|SUPABASE_SERVICE_ROLE=.*|SUPABASE_SERVICE_ROLE=\"$supabase_service\"|" .env.local
    sed -i "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=\"$anthropic_key\"|" .env.local
    [ -n "$google_maps_key" ] && sed -i "s|GOOGLE_MAPS_API_KEY=.*|GOOGLE_MAPS_API_KEY=\"$google_maps_key\"|" .env.local
fi

echo ""
echo "=================================================="
echo "  Running database migrations…"
echo "=================================================="
echo ""

# Run all migrations via Supabase Management API (requires SUPABASE_ACCESS_TOKEN)
# or fall back to instructions if not available.
read -p "Supabase Management API token (from supabase.com/dashboard/account/tokens, or press enter to skip): " access_token

if [ -n "$access_token" ]; then
  SUPABASE_URL="$supabase_url" \
  SUPABASE_ACCESS_TOKEN="$access_token" \
  SUPABASE_SERVICE_KEY="$supabase_service" \
  npx --yes ts-node --project "$(dirname "$0")/../tsconfig.scripts.json" \
    "$(dirname "$0")/migrate-client.ts" --to latest
else
  echo ""
  echo "Skipped. Run migrations manually when ready:"
  echo "  SUPABASE_URL=$supabase_url \\"
  echo "  SUPABASE_ACCESS_TOKEN=<token> \\"
  echo "  pnpm migrate-client --to latest"
fi

echo ""
echo "=================================================="
echo "  Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Run: pnpm install && pnpm dev"
echo "2. Open http://localhost:3000, sign up, complete onboarding"
echo "3. In browser console: fetch('/api/admin/bootstrap',{method:'POST'}).then(r=>r.json())"
echo "4. Reload — you now have admin access at /admin"
echo ""
echo "Optional:"
echo "- Add logo files to /public/ (logo.svg, logo-light.svg, icon.svg)"
echo "- Load demo data from /admin after bootstrapping"
echo ""
echo "For full deployment guide, see: docs/PROVISIONING.md"
