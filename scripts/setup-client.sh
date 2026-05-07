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

read -p "Onboarding Assistant Name [Ben]: " onboarding_name
onboarding_name=${onboarding_name:-"Ben"}

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
echo "  Configuration Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Add logo files to /public/ (logo.svg, logo-light.svg, icon.svg)"
echo "2. Update colors in tailwind.config.js if needed"
echo "3. Run database migrations: supabase db push"
echo "4. Install dependencies: npm install"
echo "5. Start development server: npm run dev"
echo ""
echo "For full setup guide, see: docs/PROVISIONING.md"
