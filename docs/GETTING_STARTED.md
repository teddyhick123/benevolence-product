# Getting Started

This guide provides instructions for developers on how to set up and deploy Benevolence for a client.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

*   **Node.js:** Version 18 or higher.
*   **pnpm:** A fast, reliable, and disk-efficient package manager. Install with `npm install -g pnpm`.
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
    pnpm install
    ```

## Environment Variables

Create a `.env` file in the root of the `benevolence-product` directory and populate it with the following variables.

| Name                             | Required | Description                                                                    |
| -------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`       | Yes      | Your Supabase project URL (e.g., `https://abcdefghjklmno.supabase.co`)         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Yes      | Your Supabase anon/public key                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`      | Yes      | Your Supabase service role key (for server-side operations)                     |
| `AI_PROVIDER`                    | No       | AI provider to use. Defaults to `anthropic`                                    |
| `ANTHROPIC_API_KEY`              | Yes*     | Required when `AI_PROVIDER=anthropic`                                          |
| `QB_CLIENT_ID`                   | No       | QuickBooks app client ID (for integration)                                    |
| `QB_CLIENT_SECRET`               | No       | QuickBooks app client secret (for integration)                                |
| `QB_REDIRECT_URI`                | No       | OAuth callback URL (e.g., `https://yourdomain.com/api/integrations/quickbooks/callback`) |
| `QB_ENVIRONMENT`                 | No       | Environment for QuickBooks ('sandbox' or 'production')                         |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`| No       | Google Maps API key for the holdings map widget                              |

## Database Setup

1.  **Run Migrations:**
    You can apply database migrations using the Supabase CLI:
    ```bash
    supabase db push
    ```
    Alternatively, you can run the SQL commands directly in your Supabase project's SQL editor.
    **Note:** Files in `db/scripts/` are one-off utilities and not part of the migration sequence.

## Load Demo Data

To populate your database with sample data for testing and demonstration purposes:

*   **Option A (Admin Console):** If deployed, use the "Load Demo Data" button available in the admin console.
*   **Option B (SQL Editor):** Execute the `db/demo_data.sql` script directly in your Supabase SQL editor.

## Run Locally

Start the development server:
```bash
pnpm dev
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
2.  **Promote to Admin:** An existing administrator must promote the newly created user to an admin role within the admin panel.
3.  **Load Demo Data (if not done):** If you haven't already, ensure demo data is loaded to populate the portfolio for the user. This step can also be performed after the user logs in if needed.

## Deploying for a Client

### Quick Start (Automated)

Use the provisioning script to set up a new client deployment in minutes:

```bash
# Demo environment (uses your current Supabase project)
pnpm provision --org-name "Ashford Foundation" --admin-email admin@ashford.org --mode demo

# Production environment (creates a new Supabase project)
SUPABASE_ACCESS_TOKEN=your_token pnpm provision \
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
pnpm handoff --org-name "Ashford Foundation" --slug ashford-foundation
```

This creates `handoff-ashford-foundation.zip` with full source code, migrations, and docs.

### Updating Existing Clients

When new migrations are available, apply them to a client deployment:

```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx \
pnpm migrate-client --from 0062 --to latest
```
