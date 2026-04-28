# Client Provisioning Guide

Step-by-step guide for setting up a new client instance from the golden template.

## Overview

Each client gets:
- Their own GitHub repository (cloned from template)
- Their own Supabase project (database + auth)
- Their own Vercel deployment (hosting)
- Custom branding and domain

## Prerequisites

- GitHub account with access to template repo
- Supabase account (client pays for their project)
- Vercel account (client pays for their deployment)
- Anthropic API key (client provides or you manage)

---

## Step 1: Clone the Template

```bash
# Clone the golden template
git clone https://github.com/YOUR_ORG/impact-platform-template.git client-name-platform
cd client-name-platform

# Remove git history and reinitialize
rm -rf .git
git init
git add .
git commit -m "Initial commit from template"

# Create new repo for client and push
gh repo create client-org/platform --private
git remote add origin https://github.com/client-org/platform.git
git push -u origin main
```

---

## Step 2: Create Supabase Project

### 2.1 Create Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project for the client
3. Note the project URL and keys

### 2.2 Run Migrations
```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Link to project
supabase link --project-ref <project-id>

# Run all migrations
supabase db push
```

Or manually run migrations:
1. Go to Supabase Dashboard > SQL Editor
2. Run each migration file in order from `/db/`

### 2.3 Configure Authentication
1. Go to Authentication > Settings
2. Configure email templates with client branding
3. Set up OAuth providers if needed (Google, etc.)
4. Configure redirect URLs for production domain

---

## Step 3: Configure Environment

### 3.1 Copy Environment Template
```bash
cp .env.example .env.local
```

### 3.2 Fill in Values

```env
# Branding
NEXT_PUBLIC_APP_NAME="Client Platform Name"
NEXT_PUBLIC_COMPANY_NAME="Client Organization Inc."
NEXT_PUBLIC_TAGLINE="Their custom tagline"
NEXT_PUBLIC_SUPPORT_EMAIL="support@client.com"

# Supabase (from Step 2)
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE="eyJ..."

# Anthropic
ANTHROPIC_API_KEY="sk-ant-..."

# Optional integrations
GOOGLE_MAPS_API_KEY=""
NEWS_API_KEY=""
```

### 3.3 Update Tailwind Colors (Optional)
If client has specific brand colors, update `/tailwind.config.js`:

```javascript
colors: {
  creme: "#client-bg-color",
  azure: "#client-primary-color",
  coral: "#client-accent-color",
  // ...
}
```

---

## Step 4: Add Branding Assets

### 4.1 Replace Logos
Add client logos to `/public/`:
- `logo.svg` - Primary logo
- `logo-light.svg` - Light version for dark backgrounds
- `icon.svg` - Small icon/favicon
- `favicon.ico` - Browser favicon

### 4.2 Update Metadata
Update `/app/layout.tsx` if needed for custom fonts or additional metadata.

---

## Step 5: Deploy to Vercel

### 5.1 Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Import the client's GitHub repository
3. Configure project settings

### 5.2 Add Environment Variables
In Vercel dashboard, add all environment variables from `.env.local`

### 5.3 Configure Domain
1. Go to Project Settings > Domains
2. Add client's custom domain
3. Configure DNS records as instructed

---

## Step 6: Initial Data Setup

### 6.1 Create Admin User
1. Client signs up through the app
2. In Supabase dashboard, update their user role:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@client.com';
```

### 6.2 Create Organization
Either through onboarding flow or manually:
```sql
INSERT INTO organizations (id, name, type)
VALUES (gen_random_uuid(), 'Client Organization', 'foundation');
```

### 6.3 Enable Modules
Based on client needs:
```sql
INSERT INTO organization_modules (organization_id, module_id, enabled_by)
SELECT
  'org-uuid-here',
  unnest(ARRAY['impact_tracking', 'reporting', 'grant_management']),
  'admin-user-uuid';
```

---

## Step 7: Customize for Client

Use Claude Code or Constructor Mode to customize based on client requirements:

### Common Customizations
- Custom fields on entities
- Custom report templates
- Workflow configurations
- Dashboard layouts
- Additional modules

### Using Constructor Mode
```
"Client wants to track volunteer hours per grant"
→ Creates volunteer_logs table, form, summary widget

"Add a donor recognition tier system"
→ Creates donor_tiers table, automatic tier assignment
```

---

## Post-Setup Checklist

- [ ] Repository cloned and pushed to client's GitHub
- [ ] Supabase project created and migrations run
- [ ] Environment variables configured
- [ ] Branding assets uploaded (logo, favicon, colors)
- [ ] Deployed to Vercel
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Admin user created
- [ ] Organization created
- [ ] Modules enabled
- [ ] Client can log in and access dashboard
- [ ] AI assistant responds correctly

---

## Maintenance

### Pulling Template Updates
When the golden template is updated with new features:

```bash
# Add template as remote (one time)
git remote add template https://github.com/YOUR_ORG/impact-platform-template.git

# Fetch and merge updates
git fetch template
git merge template/main --allow-unrelated-histories

# Resolve conflicts if any, then push
git push origin main
```

### Database Migrations
For new migrations:
```bash
supabase db push
# Or run manually in SQL Editor
```

---

## Troubleshooting

### Auth Issues
- Check Supabase redirect URLs match Vercel domain
- Verify environment variables are set correctly
- Check browser console for CORS errors

### Database Issues
- Verify migrations ran successfully
- Check RLS policies aren't blocking access
- Verify user has correct organization membership

### AI Not Working
- Verify ANTHROPIC_API_KEY is set
- Check Vercel function logs for errors
- Verify module tools are enabled for organization
