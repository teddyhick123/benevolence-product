# News Feature Setup Guide

This guide will help you set up the automated news fetching feature for holdings.

## Overview

The news feature automatically fetches relevant news articles for each holding using NewsAPI and displays them on the holding detail pages. It consists of:

1. **Database table** (`news_articles`) - stores news articles
2. **API endpoint** - serves news for the frontend
3. **Supabase Edge Function** - fetches news periodically
4. **UI Component** - displays news on holding pages

## Setup Steps

### 1. Run Database Migration

First, apply the database migration to create the `news_articles` table:

```bash
# If using Supabase CLI
supabase db push

# Or run the SQL file directly in Supabase Dashboard > SQL Editor
# File: db/0010_news_articles.sql
```

### 2. Get NewsAPI Key

1. Sign up for a free account at [newsapi.org](https://newsapi.org/)
2. Get your API key from the dashboard
3. **Free tier limits:** 100 requests/day (sufficient for ~20 holdings checked daily)

### 3. Set Up Supabase Edge Function

#### Install Supabase CLI (if not already installed)

```bash
npm install -g supabase
```

#### Login to Supabase

```bash
supabase login
```

#### Link to your project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

#### Set the NewsAPI secret

```bash
supabase secrets set NEWSAPI_KEY=a9d3f0a8cb9144c58c18825a2ef4ab40
```

#### Deploy the Edge Function

```bash
supabase functions deploy fetch-news
```

#### Test the function manually

```bash
supabase functions invoke fetch-news
```

You should see output like:
```json
{
  "success": true,
  "message": "Fetched news for 5 holdings",
  "articlesAdded": 12
}
```

### 4. Schedule Automatic Fetching

To run the news fetch automatically every day:

#### Enable pg_cron extension

1. Go to your Supabase Dashboard
2. Navigate to **Database > Extensions**
3. Search for `pg_cron` and enable it
4. Also enable `http` extension (for making HTTP requests)

#### Create the scheduled job

Run this SQL in **SQL Editor**:

```sql
-- Schedule to run daily at 6 AM UTC
SELECT cron.schedule(
  'fetch-news-daily',
  '0 6 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/fetch-news',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

**Replace:**
- `YOUR_PROJECT_REF` with your Supabase project reference (found in project settings)
- `YOUR_ANON_KEY` with your anon/public key (found in project settings > API)

#### Verify the scheduled job

```sql
-- Check scheduled jobs
SELECT * FROM cron.job;

-- Check job run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

#### Manage scheduled jobs

```sql
-- To unschedule
SELECT cron.unschedule('fetch-news-daily');

-- To change schedule (e.g., run every 6 hours)
SELECT cron.schedule(
  'fetch-news-daily',
  '0 */6 * * *',
  $$ ... $$
);
```

### 5. Manual Testing

You can manually add a test article to verify the UI:

```sql
INSERT INTO news_articles (holding_id, title, url, source, published_at, summary)
VALUES (
  'YOUR_HOLDING_ID',
  'Test Article Title',
  'https://example.com/article',
  'Test Source',
  NOW(),
  'This is a test article summary to verify the news section displays correctly.'
);
```

Then visit the holding detail page to see it displayed.

## Monitoring & Maintenance

### Check function logs

```bash
supabase functions logs fetch-news
```

### Check for errors

```sql
-- See recent news articles
SELECT holding_id, title, source, published_at, created_at
FROM news_articles
ORDER BY created_at DESC
LIMIT 20;

-- Count articles per holding
SELECT h.name, COUNT(n.id) as article_count
FROM holdings h
LEFT JOIN news_articles n ON n.holding_id = h.id
GROUP BY h.id, h.name
ORDER BY article_count DESC;
```

### Adjust rate limits

If you have many holdings and hit rate limits:

1. **Upgrade NewsAPI plan** (paid plans have higher limits)
2. **Filter holdings** - only fetch news for active/important holdings
3. **Reduce frequency** - run less often (e.g., weekly instead of daily)

## Troubleshooting

**No articles appearing:**
- Check Edge Function logs: `supabase functions logs fetch-news`
- Verify NewsAPI key is set: `supabase secrets list`
- Test function manually: `supabase functions invoke fetch-news`

**Rate limit errors:**
- Check your NewsAPI usage at newsapi.org dashboard
- Reduce number of holdings or fetch frequency

**Permission errors:**
- Verify RLS policies are applied correctly
- Check user is a member of the portfolio

## Future Enhancements

Consider adding:
- **Sentiment analysis** - Use AI to classify article sentiment
- **Relevance scoring** - Filter out low-relevance articles
- **Manual curation** - Allow admins to manually add/remove articles
- **Alternative sources** - Add more news APIs for better coverage
- **Email digests** - Send weekly news summaries to portfolio managers
