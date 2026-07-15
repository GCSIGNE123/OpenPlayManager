# Open Play Manager — Ormoc City Pickleball

A web app for running pickleball open plays: session check-in with player photos, automatic doubles matchmaking (winners play winners, losers play losers), live scoring by court, standings, and a paid access-code gate for creating new sessions.

This started as a Claude.ai artifact prototype and has been packaged here as a standalone Vite + React project you can run locally.

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

To build a production bundle:

```bash
npm run build
npm run preview
```

## ⚠️ Before you rely on this — read this first

This package runs locally out of the box, but **one important piece of behavior changed** in the process of taking it out of Claude.ai: the original artifact used a host-provided `window.storage` API that synced data across every device viewing it in real time. That's how two different phones at the courts could both see the same live score.

Outside Claude.ai, there's no such API, so `src/storage.js` stands in for it using your browser's `localStorage`. The app runs and works correctly on a single device/browser, but **it will not sync across multiple phones** the way the original did — each device would have its own isolated session data.

Read `backend/README.md` for what a real fix looks like (a small backend + swapping out `src/storage.js`, nothing else needs to change).

Also worth knowing: this app currently uses hardcoded demo PINs for the Scorer role (`1234`) and the Organizer/admin role that generates paid access codes (`918273`). Anyone who reads the source code can find these. Fine for testing, not fine for actually taking payments — see `backend/README.md` for what to do before that.

## What's included

- **Landing page** — create a new session (behind a paid access code) or join an existing one by 6-character code
- **Organizer panel** — PIN-gated; generate single-use access codes to sell, and look up whether a code has been redeemed
- **Session setup** — name the open play, set number of courts, pre-register players with photos (separate from check-in)
- **Live Board** — public/spectator view: live scores per court, plus the waiting queue already grouped into upcoming 2v2 matchups
- **Check In** — registered players tap to check in, or walk-ins register + check in on the spot
- **Scorer** — PIN-gated; assign matches, adjust scores (first to 11 wins, sudden death), fix mismatched team pairings, substitute a player mid-game (injury/emergency), end matches
- **Standings** — ranked by wins, then point differential, then fewest losses; players on a 3+ game win streak get a 🔥 icon

## Project structure

```
openplay-manager/
├── index.html              Vite entry HTML
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx             App entry point — loads the storage shim first
│   ├── App.jsx               Thin wrapper around the main component
│   ├── PickleballOpenPlay.jsx   The entire application (UI + logic)
│   ├── storage.js            localStorage-backed stand-in for window.storage
│   └── index.css
└── backend/
    └── README.md            Explains the storage limitation and how to add a real backend
```

Everything the app does — sessions, players, matches, standings, access codes — lives inside the single `PickleballOpenPlay.jsx` component, using React state plus the `storage.js` persistence layer. There's no build step beyond what Vite does automatically.

## Tech stack

- [React](https://react.dev/) 18
- [Vite](https://vitejs.dev/) for dev server and bundling
- [lucide-react](https://lucide.dev/) for icons
- Plain inline styles (no CSS framework) — all design tokens live at the bottom of `PickleballOpenPlay.jsx`

## Known limitations (carried over from the prototype)

- No real authentication — Scorer and Organizer roles are gated by hardcoded PINs, not accounts
- No true real-time push — the Live Board polls for updates every 3 seconds rather than updating instantly
- Player photos are stored as compressed base64 thumbnails inside the same storage as everything else, which is fine at open-play scale but wouldn't scale to a large multi-club deployment
- Access codes and session data currently share the same trust boundary — anyone with basic technical knowledge and browser dev tools could inspect what's in `localStorage`
