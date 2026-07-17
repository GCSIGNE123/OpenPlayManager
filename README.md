# Open Play Manager — Ormoc City Pickleball

A web app for running pickleball open plays: session check-in with player photos, automatic doubles matchmaking (winners play winners, losers play losers), live scoring by court, standings, and a paid access-code gate for creating new sessions.

This started as a Claude.ai artifact prototype and has been packaged here as a standalone Vite + React project backed by [Supabase](https://supabase.com) for storage and real-time sync.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + anon key
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

You'll need a Supabase project and its schema set up first — see `backend/README.md` for the one-time setup (create a project, run `supabase/schema.sql`, copy your API keys).

To build a production bundle:

```bash
npm run build
npm run preview
```

## Multi-device sync

The original Claude.ai artifact used a host-provided `window.storage` API that synced data across every device viewing it in real time — that's how two different phones at the courts could both see the same live score.

`src/storage.js` now stands in for that API using Supabase (Postgres + Realtime) instead of a Claude.ai-only feature. Two different phones pointed at the same Supabase project see the same session data, and score/check-in updates show up on every connected device within about a second via Realtime — no polling, no manual refresh. See `backend/README.md` for how the table is structured and what the trust model is.

Also worth knowing: this app currently uses hardcoded demo PINs for the Scorer role (`1234`) and the Organizer/admin role that generates paid access codes (`918273`). Anyone who reads the source code can find these, and Supabase's row-level security currently doesn't enforce them either. Fine for testing, not fine for actually taking payments — see `backend/README.md` for what to do before that.

## What's included

- **Landing page** — create a new session (behind a paid access code) or join an existing one by 6-character code
- **Organizer panel** — PIN-gated; generate single-use access codes to sell, and look up whether a code has been redeemed
- **Session setup** — name the open play, set number of courts, pre-register players with photos (separate from check-in)
- **Live Board** — public/spectator view: live scores per court, plus the waiting queue already grouped into upcoming 2v2 matchups
- **Check In** — registered players tap to check in, or walk-ins register + check in on the spot
- **Scorer** — PIN-gated; assign matches, adjust scores (first to 11 wins, sudden death), fix mismatched team pairings, substitute a player mid-game (injury/emergency), end matches
- **Standings** — ranked by wins, then point differential, then fewest losses; players on a 3+ game win streak get a 🔥 icon
- **Installable PWA, CONNECT.PH-branded** — Add to Home Screen on Android/iOS launches standalone (no browser chrome); the app shell (HTML/JS/CSS/icons) is precached so it still opens with no connection. Session data itself always needs the network, same as before
- **CONNECT.PH theme** — every color in the app traces back to one centralized palette in `src/styles.js`, extracted from the CONNECT.PH logo (navy primary, orange secondary, plus success/warning/error and the usual neutrals)

## Project structure

```
openplay-manager/
├── index.html              Vite entry HTML — also carries the iOS PWA meta tags
├── package.json
├── vite.config.js          Includes the VitePWA plugin config (manifest + service worker)
├── .env.example             Template for your Supabase URL + anon key
├── public/
│   ├── favicon.svg          CONNECT.PH-inspired mark (navy field, orange "C" ring + connector dot)
│   ├── favicon.ico          16x16 + 32x32
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── icon-192.png         PWA icon (any)
│   ├── icon-512.png         PWA icon (any + maskable)
│   └── apple-touch-icon.png iOS home-screen icon (180x180)
├── scripts/
│   └── generate-pwa-icons.mjs  Regenerates every icon/favicon above from the CONNECT.PH palette — no deps, hand-encodes PNG + ICO
├── src/
│   ├── main.jsx             App entry point — loads the storage shim first
│   ├── App.jsx               Thin wrapper around the main component
│   ├── PickleballOpenPlay.jsx   The top-level app state/logic and screen router
│   ├── storage.js            Supabase-backed stand-in for window.storage
│   ├── lib/
│   │   ├── supabaseClient.js Supabase client setup (reads VITE_ env vars)
│   │   ├── constants.js      Shared constants and default state shapes
│   │   └── utils.js          Pure helper functions (matchmaking, codes, etc.)
│   ├── components/           Extracted screen and UI components
│   └── index.css
├── supabase/
│   └── schema.sql           Run once in the Supabase SQL editor to set up the database
└── backend/
    └── README.md            Explains the Supabase setup and trust model
```

Everything the app does — sessions, players, matches, standings, access codes — is driven from `PickleballOpenPlay.jsx`'s state, persisted through the `storage.js` layer and synced live via Supabase Realtime. There's no build step beyond what Vite does automatically.

## Tech stack

- [React](https://react.dev/) 18
- [Vite](https://vitejs.dev/) for dev server and bundling
- [Supabase](https://supabase.com) (Postgres + Realtime) for storage and live sync
- [lucide-react](https://lucide.dev/) for icons
- Plain inline styles (no CSS framework) — all design tokens live in `src/styles.js`
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox under the hood) for the Web App Manifest and service worker

## Known limitations (carried over from the prototype)

- No real authentication — Scorer and Organizer roles are gated by hardcoded PINs, not accounts, and Supabase row-level security doesn't enforce them either (see `backend/README.md`)
- Player photos are stored as compressed base64 thumbnails inside the same table as everything else, which is fine at open-play scale but wouldn't scale to a large multi-club deployment
- Access codes and session data currently share the same trust boundary — the Supabase anon key (public in the client bundle) has full read/write access to both
