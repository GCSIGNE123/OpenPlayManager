-- PickleKing — Supabase schema
-- -----------------------------------------------------------------------
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)
-- for a fresh project. It creates the single key/value table the app uses
-- in place of localStorage, and turns on Realtime so every connected
-- device sees changes (new scores, check-ins, etc.) within about a second.
--
-- The app talks to this table exactly the way it used to talk to
-- localStorage: get/set/delete a JSON blob by key, optionally scoped by a
-- `shared` flag. See src/storage.js for the client-side interface.
-- -----------------------------------------------------------------------

create table if not exists public.opl_kv (
  key text not null,
  shared boolean not null default true,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (key, shared)
);

comment on table public.opl_kv is
  'Generic key/value store backing PickleKing sessions and access codes. Replaces the localStorage shim in src/storage.js.';

-- Row Level Security
-- -----------------------------------------------------------------------
-- The app has no user accounts — access to the Scorer and Organizer roles
-- is gated client-side by PIN (see src/lib/constants.js), not by Supabase
-- auth. That means the anon key (public in the client bundle, same as any
-- Vite app) needs full read/write access to this table for the app to
-- function at all. This mirrors the original localStorage trust model:
-- anyone with basic technical knowledge could already read/write the data
-- from a browser's dev tools. Tightening this — e.g. real auth for the
-- Organizer role, or a server-side function that enforces the PIN checks
-- instead of trusting the client — is exactly the kind of change called
-- out as a known limitation in backend/README.md.
alter table public.opl_kv enable row level security;

create policy "opl_kv anon read" on public.opl_kv
  for select to anon, authenticated using (true);

create policy "opl_kv anon insert" on public.opl_kv
  for insert to anon, authenticated with check (true);

create policy "opl_kv anon update" on public.opl_kv
  for update to anon, authenticated using (true) with check (true);

create policy "opl_kv anon delete" on public.opl_kv
  for delete to anon, authenticated using (true);

-- Realtime
-- -----------------------------------------------------------------------
-- Adds this table to the `supabase_realtime` publication so postgres_changes
-- subscriptions (used by storage.js's subscribeToKey) receive inserts,
-- updates, and deletes as they happen.
alter publication supabase_realtime add table public.opl_kv;
