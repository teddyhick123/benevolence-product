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
      url := 'https://avqsnmsdrdtervserwar.supabase.co/functions/v1/fetch-news',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cXNubXNkcmR0ZXJ2c2Vyd2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyODY1NDYsImV4cCI6MjA3MDg2MjU0Nn0.z1lPteNp-iO3SMUX0tIK_yIjVrcVxFNmWo9zckOyqzM"}'::jsonb
    ) as request_id;
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'fetch-news-daily';
