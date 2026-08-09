# Getting Started

This guide provides instructions for developers on how to set up and deploy Benevolence for a client.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

*   **Node.js:** Version 18 or higher.
*   **npm:** Use the lockfile-managed npm version bundled with your supported Node.js release.
*   **Supabase Account:** A Supabase project is required for the database, authentication, and storage.
*   **AI Provider API Key:** Required for AI assistant features. The default provider is Anthropic, configured with `ANTHROPIC_API_KEY`; provider selection is controlled by `AI_PROVIDER`.
*   **QuickBooks Developer Account (Optional):** If you plan to use the QuickBooks integration, you'll need a developer account to register your application and obtain client ID and secret.

## Clone and Install

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/teddyhick123/benevolence-product.git
    cd benevolence-product
    ```

2.  **Install dependencies:**
    ```bash
    npm ci
    ```

## Environment Variables

Create a `.env` file in the root of the `benevolence-product` directory and populate it with the following variables.

| Name                             | Required | Description                                                                    |
| -------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`       | Yes      | Your Supabase project URL (e.g., `https://abcdefghjklmno.supabase.co`)         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Yes      | Your Supabase anon/public key                                                  |
| `SUPABASE_SERVICE_ROLE`          | Yes      | Your Supabase service role key (for server-side operations)                     |
| `AI_PROVIDER`                    | No       | AI provider to use. Defaults to `anthropic`                                    |
| `ANTHROPIC_API_KEY`              | Yes*     | Required when `AI_PROVIDER=anthropic`                                          |
| `QB_CLIENT_ID`                   | No       | QuickBooks app client ID (for integration)                                    |
| `QB_CLIENT_SECRET`               | No       | QuickBooks app client secret (for integration)                                |
| `QB_REDIRECT_URI`                | No       | OAuth callback URL (e.g., `https://yourdomain.com/api/integrations/quickbooks/callback`) |
| `QB_ENVIRONMENT`                 | No       | Environment for QuickBooks ('sandbox' or 'production')                         |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`| No       | Google Maps API key for the holdings map widget                              |

## Database Setup

1.  **Run Migrations:**
    The canonical schema lives in `db/migrations`. For local Supabase, the
    repo tracks `supabase/migrations` as a symlink to that directory, so the
    Supabase CLI applies the same canonical files:
    ```bash
    supabase db push
    ```
    For a hosted client project, use the migration runner:
    ```bash
    SUPABASE_URL=https://xxx.supabase.co SUPABASE_ACCESS_TOKEN=sbp_xxx \
    ./scripts/run-migrations.sh
    ```
    Alternatively, run each SQL file from `db/migrations/` in order in the
    Supabase SQL editor. Files in `db/scripts/`, `db/demo/`, and `db/seeds/`
    are not a second migration history. Git history is the archive for retired
    SQL; do not recreate a `db/legacy/` tree.

## Load Demo Data

To populate your database with sample data for testing and demonstration purposes:

*   **Option A (Admin Console):** If deployed, use the "Load Demo Data" button available in the admin console.
*   **Option B (SQL Editor):** Execute the `db/demo/seed_demo_org.sql` script directly in your Supabase SQL editor.

## Run Locally

Start the development server:
```bash
npm run dev
```
Access the application at `http://localhost:3000`.

## Deploy to Vercel

1.  **Build and Deploy:**
    ```bash
    vercel --prod
    ```
2.  **Configure Environment Variables:** In your Vercel project dashboard, set all the required environment variables listed in the "Environment Variables" section. Make sure to connect your Supabase project to Vercel.

## First Login and Setup

1.  **Create an Account:** Navigate to your deployed application's URL and create a new user account via the sign-up page.
2.  **Complete Onboarding:** Follow the onboarding flow to create your organization and initial portfolio.
3.  **Bootstrap Admin Access:** On a fresh deployment with no existing admin, call the bootstrap endpoint to promote yourself:
    ```bash
    curl -X POST https://your-app.vercel.app/api/admin/bootstrap \
      -H "Cookie: <your session cookie>"
    ```
    Or from the browser console after logging in:
    ```js
    await fetch('/api/admin/bootstrap', { method: 'POST' }).then(r => r.json())
    ```
    This endpoint only works when **no app admin exists yet** — it is a no-op (returns 403) on any subsequent call, so it cannot be used to self-promote after an admin is established.
4.  **Load Demo Data (optional):** In the admin console at `/admin`, use "Load Demo Data" to populate sample holdings and metrics.
5.  **Invite Users:** From the admin console, create additional user accounts and assign them to your organization.

## Deploying for a Client

### Quick Start (Automated)

Use the provisioning script to set up a new client deployment in minutes:

```bash
# Demo environment (uses your current Supabase project)
npm run provision -- --org-name "Ashford Foundation" --admin-email admin@ashford.org --mode demo

# Production environment (creates a new Supabase project)
SUPABASE_ACCESS_TOKEN=your_token npm run provision -- \
  --org-name "Ashford Foundation" \
  --admin-email admin@ashford.org \
  --mode production \
  --send-invite
```

This generates:
- `deployment-ashford-foundation.env` — all environment variables
- `DEPLOYMENT_CHECKLIST-ashford-foundation.md` — step-by-step deployment guide

### Client Handoff

After deployment, package the codebase for client handoff:

```bash
npm run handoff -- --org-name "Ashford Foundation" --slug ashford-foundation
```

This creates `handoff-ashford-foundation.zip` with full source code, migrations, and docs.

### Updating Existing Clients

When new migrations are available, apply them to a client deployment:

```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx \
npm run migrate-client -- --from 0062 --to latest
```
