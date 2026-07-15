# Contributing

Thanks for working on Open Play Manager. This doc covers how to get set up, how the codebase is organized day-to-day, and the Git workflow we use. For a description of the architecture itself, see [PROJECT.md](PROJECT.md).

## Prerequisites

- [Node.js](https://nodejs.org/) (includes npm)
- A [Supabase](https://supabase.com) project (free tier is fine) — see `backend/README.md` for one-time setup (create a project, run `supabase/schema.sql`, copy your API keys into `.env.local`)

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

Other useful scripts:

```bash
npm run build     # production bundle
npm run preview   # preview the production bundle locally
```

There is no test suite or linter configured yet. Verify changes by exercising the app in the browser (see "Before opening a PR" below).

## Coding conventions

- **JavaScript/JSX, functional React components with hooks.** No class components.
- **Formatting:** follow the style already in the file you're editing (2-space indentation, double quotes in JSX/imports, semicolons). There's no Prettier/ESLint config in the repo yet, so match surrounding code by eye.
- **Styling:** inline style objects, not a CSS framework. Shared design tokens (colors, spacing, etc.) live in `src/styles.js` — reuse them rather than hardcoding new values.
- **Screens live under `src/components/`, one file per screen/view.** `src/PickleballOpenPlay.jsx` holds the top-level state and mutating functions and passes them down as props. Keep that split — don't inline a new screen's JSX back into `PickleballOpenPlay.jsx`, and don't move state down into a leaf component if other screens need it too.
- **Storage access always goes through `src/storage.js`** (`window.storage.get/set/delete/list/subscribeToKey`). Never call the Supabase client directly from application/component code — that keeps the door open for changing the backend later without touching the rest of the app (see [backend/README.md](backend/README.md)).
- **Comments:** keep them rare and purposeful — explain *why*, not *what*. The existing comments in `storage.js` explaining the Claude.ai `window.storage` origin are a good example of the bar to meet.
- **No new dependencies without a reason.** This is a small, dependency-light project on purpose; prefer what's already available (React, lucide-react) before reaching for a new package.

## Before opening a PR

Since there's no automated test suite, manually verify the flow(s) you touched in the browser:

1. `npm run dev` and walk through the affected screen(s) — landing, organizer panel, session setup, check-in, live board, scorer, standings.
2. Check both the "happy path" and at least one edge case (e.g., empty state, PIN entry, walk-in registration).
3. If you touched `storage.js`, confirm data still persists correctly across a page reload.

## Git workflow

- **Default branch:** `master`.
- **Feature branches:** create a branch off `master` for any non-trivial change, e.g. `feature/live-board-polling` or `fix/scorer-pin-check`. Small, obvious fixes can go straight to `master` if you're working solo; use your judgement.
- **Commits:** keep them focused and descriptive. Explain *why* a change was made when it's not obvious from the diff alone.
- **Before pushing:** make sure `npm run build` succeeds and you've manually verified the change per the section above.
- **Pushing/merging:** open a PR against `master` for review when working with others; merge once it looks good. When working solo, pushing directly to `master` after local verification is fine.
- **Do not commit:**
  - `node_modules/`, `dist/`, `.env*`, `*.log` (already covered by `.gitignore`)
  - Real secrets or production PINs/access codes — the current `SCORER_PIN`/`ADMIN_PIN` are demo values only; if these are ever replaced with real credentials, they must not be committed to the repo (see [backend/README.md](backend/README.md))
