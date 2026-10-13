-- Starflow scheduled publishing worker.
-- Apply only after 20261013090000_growth_tools_wave1.sql.
-- Runs in PostgreSQL once per minute; no Cloudflare API key is required.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
 'starflow-scheduled-text-posts-v1',
 '* * * * *',
 'SELECT public.sf_dispatch_scheduled_posts();'
);
-- Never expose cron management to browser users.
REVOKE ALL ON SCHEMA cron FROM PUBLIC,anon,authenticated;
