# Running Client Demos

This guide is for Teddy, focusing on how to best showcase Benevolence during prospect meetings. Demo environments leverage the sample data from `db/demo_data.sql`, which provides a realistic foundation portfolio complete with diverse asset types, historical data, and tax records.

## Scenario Overviews

### Scenario 1: Foundation Executive Director (15 minutes)

*   **Persona:** Executive Director of a $25-50M family foundation. Currently uses Blackbaud, frustrated by its cost and complexity.
*   **Goal:** Demonstrate a superior, owned system that simplifies operations.
*   **Flow:**
    1.  **Dashboard Overview:** Highlight portfolio value, key KPIs, and recent activity.
    2.  **Holdings Map:** Showcase the geographic distribution of investments.
    3.  **Board Report:** Generate and download a professional PDF board report.
    4.  **Tax Center:** Demonstrate contribution history tracking and export options.
    5.  **AI Assistant:** Ask a probing question like, "What is our total grant exposure?" or "Summarize our impact this year."
*   **Talking Points:** "You own this software outright. No recurring SaaS fees, no vendor lock-in. Your board will receive clear, concise reports every quarter."

### Scenario 2: Finance Director / CFO (20 minutes)

*   **Persona:** Finance Director at a family office with strong ties to QuickBooks and responsibility for tax compliance and audits.
*   **Goal:** Prove the platform's accounting integration and data accuracy.
*   **Flow:**
    1.  **QuickBooks Connection:** Walk through the OAuth 2.0 connection process (use a sandbox account).
    2.  **Account Sync:** Display the synchronization of the chart of accounts.
    3.  **Contribution Export:** Show how journal entries are generated and exported to QuickBooks.
    4.  **Tax Center:** Emphasize TurboTax TXF export, the carryforward schedule, and AGI limit visualization.
    5.  **XIRR Calculation:** Display investment performance metrics like XIRR on holdings.
*   **Talking Points:** "Your accounting team receives clean, accurate journal entries. Tax preparers get a properly formatted TXF file. Eliminate manual data re-entry and reduce errors."

### Scenario 3: IT Director / Implementation Evaluation (30 minutes)

*   **Persona:** IT Director or CTO at a foundation evaluating Benevolence for long-term maintainability, security, and deployment.
*   **Goal:** Assure stakeholders that the platform is robust, secure, and entirely under their control.
*   **Flow:**
    1.  **Deployment:** Show the ease of deploying to Vercel in minutes, hosted on their own Supabase project.
    2.  **Code Ownership:** Briefly walk through the repository structure, emphasizing that they receive and own the full source code.
    3.  **Security:** Highlight Row Level Security (RLS) on all tables, role-based access control, and freedom from vendor data hostage scenarios.
    4.  **Blackbaud Import:** Demonstrate the AI-powered importer, focusing on field mapping, validation, and reconciliation reports.
    5.  **Per-Tenant Configuration:** Illustrate how the platform can be customized per organization (e.g., module toggles, branding).
*   **Talking Points:** "You own the source code. You own your data. You control the hosting environment. If your organization's needs evolve, you have the freedom to modify and extend the software yourself."

## Demo Prep Checklist

Before any prospect meeting, ensure the following steps are completed for the demo environment:

*   [ ] Clone the latest `docs/cleanup-and-rewrite` branch and run `pnpm install`.
*   [ ] Set up a dedicated Supabase project for the demo.
*   [ ] Run all migrations in `db/` (execute in numeric order, skip `db/scripts/`): `supabase migration up`.
*   [ ] Configure all required environment variables as detailed in `docs/GETTING_STARTED.md`.
*   [ ] Load demo data either via the admin console's "Load Demo Data" button or by executing `db/demo_data.sql` in the Supabase SQL editor.
*   [ ] Create a dedicated demo user account and assign it to the demo portfolio.
*   [ ] **For Finance Director Demo:** Connect a QuickBooks *sandbox* account via `Settings → Integrations`.
*   [ ] Verify that the Board Report PDF generation works correctly (`Portfolio → Board Report PDF`).
*   [ ] Verify that the Tax Center export functions as expected (`Tax Center → Export → TurboTax`).
*   [ ] Prepare a few example questions for the AI Assistant to demonstrate its capabilities.
