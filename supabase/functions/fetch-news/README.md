# Fetch News Edge Function

This Supabase Edge Function fetches news articles for all holdings using NewsAPI and stores them in the database.

## Setup

1. **Get a NewsAPI key:**
   - Sign up at https://newsapi.org/
   - Free tier: 100 requests/day (sufficient for testing)

2. **Set environment variables in Supabase:**
   ```bash
   # Using Supabase CLI
   supabase secrets set NEWSAPI_KEY=your_newsapi_key_here
   ```

3. **Deploy the function:**
   ```bash
   supabase functions deploy fetch-news
   ```

4. **Test the function manually:**
   ```bash
   supabase functions invoke fetch-news
   ```

## Scheduling

To run this function automatically (e.g., daily), set up a cron job in Supabase:

1. Go to your Supabase Dashboard
2. Navigate to Database > Extensions
3. Enable `pg_cron` extension
4. Run this SQL in the SQL Editor:

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

-- To check scheduled jobs:
SELECT * FROM cron.job;

-- To unschedule:
SELECT cron.unschedule('fetch-news-daily');
```

## Alternative: Vercel Cron (if using Vercel)

You can also trigger this from a Vercel cron job by creating an API route that calls the Edge Function.

## Notes

- The function fetches the last 5 articles from the past 7 days for each holding
- Articles are deduplicated by URL + holding_id
- Rate limiting: 1 second delay between each holding
- Free tier NewsAPI limits: 100 requests/day
