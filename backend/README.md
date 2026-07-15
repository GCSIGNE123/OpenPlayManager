# Backend

This app is backed by [Supabase](https://supabase.com) — a hosted Postgres database plus Realtime — instead of running a custom server.

## How it works

The app was originally built as a Claude.ai artifact, where a built-in `window.storage` API gave it a real shared, server-backed key/value store for free — that's what let two different phones both see the same live court scores update in real time.

`src/storage.js` stands in for that API, backed by a single Postgres table (`opl_kv`, see `supabase/schema.sql`) instead of the browser's `localStorage`. It exposes the exact same function signatures (`get`, `set`, `delete`, `list`, each with a `shared` flag), so nothing else in the app needed to change. It also adds `subscribeToKey`, which uses [Supabase Realtime](https://supabase.com/docs/guides/realtime) (Postgres change streams over a WebSocket) so every device viewing a session sees updates — scores, check-ins, new courts — within about a second, with no polling.

## Setting it up

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, go to **SQL Editor → New query**, paste in the contents of `supabase/schema.sql`, and run it. This creates the `opl_kv` table, its row-level security policies, and adds it to the Realtime publication.
3. Go to **Project Settings → API** and copy the **Project URL** and **anon public** key.
4. Copy `.env.example` to `.env.local` and fill in those two values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Vite only exposes env vars prefixed `VITE_` to client code, so both must keep that prefix.
5. `npm run dev` — the app will now read/write through Supabase instead of `localStorage`, and two different devices pointed at the same project will see each other's changes live.

For a Vercel deployment, add the same two variables under **Project Settings → Environment Variables**, then redeploy.

## Trust model — worth knowing before charging real money

- The Scorer PIN (`1234`) and Organizer/admin PIN (`918273`) are hardcoded in `src/lib/constants.js` (`SCORER_PIN`, `ADMIN_PIN`). They're client-side-only checks — anyone who reads the source can find them, and nothing on the Supabase side enforces them.
- Because there's no real authentication, the `opl_kv` table's row-level security policies grant the anon key full read/write access (see the comments in `supabase/schema.sql`). This is the same trust boundary the old `localStorage` version had — anyone with the (public, client-bundled) anon key can read or write session/access-code data directly via the Supabase REST API, not just through this app's UI.
- Before accepting real payments, replace the PIN gates with real Supabase auth (e.g. magic-link or password login for the Organizer role) and tighten the RLS policies so only authenticated requests can write access codes.
