# Backend

There is no backend server in this project yet — and that's worth understanding before you rely on this for real money-collecting use.

## What's here instead

The app was originally built as a Claude.ai artifact, where a built-in `window.storage` API gave it a real shared, server-backed key/value store for free — that's what let two different phones both see the same live court scores update in real time.

Outside of Claude.ai, `src/storage.js` stands in for that API using the browser's `localStorage`. It has the exact same function signatures (`get`, `set`, `delete`, `list`), so nothing else in the app needed to change to run locally. But `localStorage` only exists inside one browser on one device — it does **not** sync across phones. Running `npm run dev` and opening the app on two different phones will **not** show the same session data, matches, or scores.

This matters most for two features that depend on multi-device sync:
- Live Board / Scorer views — meant to be viewed simultaneously on many phones at the courts
- Access codes for paid session creation — meant to be validated against a single shared source of truth, not per-device storage

## What you'd need for real multi-device sync

A small backend that exposes the same four operations, backed by a real database:

- `GET /kv/:key?shared=true|false` → returns `{ key, value, shared }` or 404
- `PUT /kv/:key?shared=true|false` with a JSON body `{ value }` → upserts
- `DELETE /kv/:key?shared=true|false` → deletes
- `GET /kv?prefix=...&shared=true|false` → returns `{ keys, prefix, shared }`

Reasonable options, roughly ordered by how fast you could get this running:

1. **Firebase Firestore / Realtime Database** — no server to run yourself, generous free tier, real-time listeners would even let you replace the current 3-second polling with instant push updates.
2. **Supabase** (Postgres + realtime) — similar tradeoffs to Firebase, SQL if you prefer that.
3. **A tiny Express + SQLite/Postgres server you run yourself** — most control, most work.

Whichever you pick, the only file that needs to change is `src/storage.js` — keep the same four exported function names and shapes, and the rest of the app (session creation, check-in, scoring, standings, access codes) works unmodified.

## Also worth doing before charging real money

- The scorer PIN (`1234`) and organizer/admin PIN (`918273`) are hardcoded in `src/PickleballOpenPlay.jsx` (search for `SCORER_PIN` and `ADMIN_PIN`). Anyone who reads the source can find them. Move these behind real authentication once there's a backend.
- Access codes currently live in the same unauthenticated shared storage as everything else — a backend with proper access control would let you enforce that only you can generate codes, rather than relying on a PIN alone.
