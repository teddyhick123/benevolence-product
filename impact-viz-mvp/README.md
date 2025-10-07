# Impact Viz MVP

Next.js + Supabase + D3.js web app for impact portfolio management with AI-powered document ingestion.

## Stack
- Next.js 15 (App Router)
- Supabase (Postgres, Auth, Storage, RLS)
- D3.js (charts & map primitives)
- OpenAI API (GPT-4o for extraction, Whisper for voice input)
- Tailwind CSS v4

## Quickstart
```bash
npm install
cp .env.example .env.local
# fill your Supabase keys and OpenAI API key
npm run dev
```

## Folders
- `app/` — routes (dashboard, admin, profile)
- `lib/` — Supabase clients, OpenAI extraction, AI assistant
- `components/` — UI components (visualizations, widgets, AI chat)
- `db/` — SQL migrations
- `hooks/` — React hooks (audio recorder, etc.)

## Key Features
- Portfolio & holding management with multi-user access controls
- AI document ingestion (extracts holdings, facts, locations)
- Interactive KPI tracking with D3 visualizations
- Configurable dashboard widgets
- AI portfolio assistant (Ben) with voice input
- News integration for holdings
- Contact management with photo uploads

## API routes
- Portfolio APIs: `/api/portfolio/[id]/*` (overview, holdings, map, KPIs, widgets)
- Admin APIs: `/api/admin/*` (upload, portfolios, users)
- AI APIs: `/api/ai/chat`, `/api/ai/transcribe`
- Profile APIs: `/api/profile/*`

## Notes
- Row Level Security (RLS) is implemented for multi-tenant access control
- AI assistant supports undo/redo for all actions
