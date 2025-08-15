# Impact Viz MVP

Next.js + Supabase + D3.js web app scaffold with n8n ingestion workflow.

## Stack
- Next.js (App Router)
- Supabase (Postgres, Auth, Storage)
- D3.js (charts & map primitives)
- OpenAI API (extraction/summarization)
- n8n (ingestion workflow)

## Quickstart
```bash
pnpm i   # or npm i / yarn
cp .env.example .env.local
# fill your Supabase keys
pnpm dev
```

## Folders
- `app/` — routes (dashboard + admin)
- `lib/` — Supabase clients & utils
- `components/` — UI components
- `db/` — SQL migrations (tables from our schema)
- `n8n/` — workflow export JSON

## API routes
- `GET /api/portfolio/[id]/overview`
- `GET /api/portfolio/[id]/holdings`
- `GET /api/portfolio/[id]/map`
- `GET /api/portfolio/[id]/targets`
- `POST /api/admin/upload` (multipart)
- `POST /api/admin/extract/[fileId]` (triggers n8n)
- `GET /api/admin/jobs/[jobId]`

## Notes
- This is a scaffold: wire to real Supabase tables and n8n credentials.
- Add Row Level Security (RLS) before production.
