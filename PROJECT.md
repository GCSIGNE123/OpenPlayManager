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
│   │   ├── random.js             uid()/shuffle() — split out to avoid a circular import with src/engines/
│   │   └── utils.js              Pure helpers: codes, formatting, and the matchmaking entry points (refreshNextMatchups, regenerateNextMatchups, recordRotationHistory)
│   ├── engines/                  Pluggable matchmaking strategies (Strategy pattern) — see Architecture below
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
- **Matchmaking is a pluggable Strategy (Strategy pattern), not hardcoded logic.** `src/engines/RotationEngine.js` defines the interface (`generateMatchups({ waitingIds, players, existingMatchups })` → new matchup objects); `src/engines/BalancedRotationEngine.js` is the one concrete implementation today (always teams a beginner with an intermediate, avoids repeat partners/opponents by recency, greedy with randomized-restart tie-breaking — see the file's doc comments for the full priority order). `src/lib/utils.js`'s `refreshNextMatchups`/`regenerateNextMatchups` are the only things that call the engine; swapping in a different mode later (Random Mixer, King of the Court, ...) means adding a new `RotationEngine` subclass and changing the one `defaultEngine = new BalancedRotationEngine()` line, not touching the app around it.
- **Matchups are built continuously, not in synchronized rounds.** Courts run independently and pick up a new match whenever they're free — there's no "everyone finishes round 3, then round 4 starts" lockstep. `refreshNextMatchups` runs after every state change and is deliberately *strict*: it only forms a matchup from a genuine 2-beginner + 2-intermediate group, never a same-skill fallback, because players check in one at a time and an eager fallback would permanently lock two beginners together moments before an intermediate arrives (matchups are immutable once built — only `reassignMatchup`/`substituteInMatchup`/the scorer's manual edits touch them). The same-skill fallback (last resort when the beginner/intermediate counts are genuinely unequal) is opt-in, and only runs from the explicit "Regenerate matchups" control in Scorer.
- **Per-player rotation history feeds the scoring.** Each player record tracks `partnerCounts`/`recentPartnerIds`, `opponentCounts`/`lastOpponentIds`/`recentOpponentIds`, and `courtCounts`/`lastCourt`, updated by `recordRotationHistory` when a match ends (see `PickleballOpenPlay.jsx`'s `endMatch`). `state.matchHistory` logs one record per completed match.

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
- No UI to switch rotation strategy — only `BalancedRotationEngine` exists today; the Strategy pattern makes adding a picker straightforward once a second engine exists
- No "undo previous round" — ending a match, substituting, or removing a player are all one-way; there's no state snapshot/rollback
- No dedicated stats screen for partner/opponent frequency or court usage — that history is tracked per-player (`partnerCounts`, `opponentCounts`, `courtCounts`) but only Standings (games/wins/losses/streak) is surfaced in the UI today

These are documented in more detail in [README.md](README.md) and [backend/README.md](backend/README.md).
