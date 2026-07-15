# PROJECT.md

Reference doc for how this repository is organized and how the app works under the hood. For "how do I run this," see [README.md](README.md). For "how do I contribute a change," see [CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

Open Play Manager is a web app for running pickleball open-play sessions: check-in with player photos, automatic doubles matchmaking, live scoring by court, standings, and a paid access-code gate for creating new sessions. It started as a Claude.ai artifact prototype and now lives here as a standalone Vite + React project backed by Supabase.

## Repository layout

```
openplay-manager/
├── index.html                    Vite entry HTML
├── package.json                  Scripts and dependencies
├── vite.config.js                Vite configuration
├── .env.example                  Template for your Supabase URL + anon key
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx                  App entry point — loads the storage shim first
│   ├── App.jsx                   Thin wrapper around the main component
│   ├── PickleballOpenPlay.jsx    Top-level app state/logic and screen router
│   ├── storage.js                Supabase-backed stand-in for window.storage
│   ├── styles.js                 Design tokens and the shared style object
│   ├── lib/
│   │   ├── supabaseClient.js     Supabase client setup (reads VITE_ env vars)
│   │   ├── constants.js          Shared constants and default state shapes
│   │   └── utils.js              Pure helper functions (matchmaking, codes, etc.)
│   └── components/               One file per screen/UI component
├── supabase/
│   └── schema.sql                Run once in the Supabase SQL editor to set up the database
├── backend/
│   └── README.md                 Explains the Supabase setup and trust model
├── README.md                     Project overview and quick start
├── CONTRIBUTING.md               Development workflow and conventions
└── PROJECT.md                    This file
```

## Architecture

- **Screens and logic are split apart.** `src/PickleballOpenPlay.jsx` owns the top-level state (current screen, session data, auth) and the functions that mutate it (matchmaking, scoring, standings). Each screen (landing, organizer panel, session setup, live board, check-in, scorer, standings) is its own component under `src/components/`, receiving state and callbacks as props.
- **Persistence is abstracted behind `src/storage.js`.** The app calls `window.storage.get/set/delete/list(key, shared)` — a shim with the same signature as the key/value API that Claude.ai artifacts get for free from their host environment. It's backed by a single Postgres table (`opl_kv`) in Supabase; see `supabase/schema.sql` for the schema and `backend/README.md` for setup.
- **Real-time sync via Supabase Realtime.** `storage.js` also exposes `subscribeToKey(key, shared, onChange)`, which opens a Postgres change-stream subscription. `PickleballOpenPlay.jsx` uses this instead of polling — any device's write shows up on every other connected device within about a second.
- **Auth is PIN-based, not account-based.** Scorer and Organizer/admin roles are gated by hardcoded PINs in `src/lib/constants.js` (`SCORER_PIN`, `ADMIN_PIN`), checked entirely client-side. Supabase row-level security does not enforce these — see `backend/README.md` for the trust model and what a real fix looks like.

## Tech stack

- [React](https://react.dev/) 18
- [Vite](https://vitejs.dev/) 5 — dev server and bundling
- [Supabase](https://supabase.com) (`@supabase/supabase-js`) — Postgres storage + Realtime
- [lucide-react](https://lucide.dev/) — icons
- Plain inline styles (no CSS framework) — design tokens live in `src/styles.js`

## Known limitations

- No real authentication (PIN-gated roles only, unenforced server-side)
- The Supabase anon key has full read/write access to session and access-code data (see `backend/README.md`)
- Player photos stored as base64 thumbnails in the same table as everything else
- Access codes and session data share the same trust boundary

These are documented in more detail in [README.md](README.md) and [backend/README.md](backend/README.md).
