-- 24-Hour Inactivity Auto-Close — scheduler setup for
-- supabase/functions/sweep-open-play-sessions.
--
-- NOT APPLIED. Run this once in the Supabase SQL Editor AFTER deploying
-- the Edge Function (`supabase functions deploy sweep-open-play-sessions`),
-- the same "run once in the SQL editor" convention this project already
-- uses for supabase/schema.sql — there is no CLI-managed migrations
-- directory in this repo to add this to instead.
--
-- This project has no existing pg_cron/pg_net usage — this is new
-- infrastructure, per the approved Option (C) decision. It uses Supabase's
-- documented pg_cron + pg_net pattern to invoke the deployed Edge Function
-- over HTTP on a schedule, since Postgres itself can't reach an Edge
-- Function directly.

-- 1) Enable the two extensions this needs (idempotent — safe to run even
--    if already enabled).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2) Store the values the scheduled call needs, without hardcoding secrets
--    into a cron job definition (which is visible to anyone with SQL
--    Editor / cron.job table access). Supabase Vault keeps these as
--    encrypted secrets, read back by name inside the job body below.
--    Replace the two placeholder values before running, then this
--    statement itself never needs to be re-run.
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co/functions/v1/sweep-open-play-sessions', 'sweep_open_play_sessions_url');
select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'sweep_open_play_sessions_service_key');

-- 3) Schedule the sweep every 15 minutes (see SESSION_INACTIVITY_AGE_MS's
--    own comment in src/lib/constants.js: "24 hours" means "becomes
--    eligible at 24h inactive, closed on the next run" — not millisecond-
--    exact, exactly as approved).
select cron.schedule(
  'sweep-open-play-sessions',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sweep_open_play_sessions_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sweep_open_play_sessions_service_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect scheduled runs later: select * from cron.job_run_details
-- order by start_time desc limit 20;
-- To remove the schedule entirely: select cron.unschedule('sweep-open-play-sessions');
