-- WARNING: Credentials have been redacted. See deployment docs for setup.
-- Schedule news fetching to run daily at 6 AM UTC
-- This requires the pg_cron extension to be enabled

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Schedule the job to run daily at 6 AM UTC
SELECT cron.schedule(
  'fetch-news-daily',
  '0 6 * * *',  -- Cron expression: 6 AM UTC every day
  $$
  SELECT
    extensions.http_post(
      -- SECURITY: Replace with your project URL and service key
      -- DO NOT commit real credentials here
      -- URL: https://<your-project>.supabase.co
      -- KEY: <set via environment variable, not hardcoded>
      url := current_setting('app.supabase_url') || '/functions/v1/fetch-news',
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
      )::jsonb
    ) as request_id;
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'fetch-news-daily';
