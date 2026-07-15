# Changelog

All notable changes to this project will be documented in this file, starting 2026-07-15.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). This file tracks changes going forward — it does not attempt to reconstruct history prior to 2026-07-15.

## [Unreleased]

## 2026-07-16

### Added
- Skill level at registration: organizers choose Beginner or Intermediate for each pre-registered player (session setup) and each walk-in (Check In); shown as a BEG/INT badge wherever players are listed
- Matchmaking: a beginner is now always teamed with an intermediate, and matches are between two such beginner+intermediate tandems, whenever there are at least 2 of each skill waiting — falls back to skill-blind pairing only when that mix isn't available (e.g. all-beginner queue)
- Scorer view: a "Next matchups" panel showing upcoming matchups before they're sent to a court, with "Fix teams" and per-player "Substitute" controls — these matchups are now real, persisted, editable state (`state.nextMatchups`) instead of a randomly recomputed preview, and "Assign match"/"Fill all open courts" deploy exactly what was reviewed

### Changed
- Matchmaking: winners (and separately, losers) advancing from different courts are now cross-paired with each other instead of simply replaying with their just-finished partner — e.g. court 1's winner and court 2's winner become new teammates rather than court 1's winning pair staying together
- Scorer view: substituting a player mid-match now always sends the outgoing player back to the waiting queue automatically, removing the old "send back to queue?" checkbox

## 2026-07-15

### Added
- `CONTRIBUTING.md` documenting local setup, coding conventions, and the Git workflow
- `PROJECT.md` documenting repository structure and architecture
- `CHANGELOG.md` (this file)
- Scorer view: add/remove courts while a session is running (can't remove a court with a match in progress)
- Scorer view: "End session" button with a confirmation prompt that deletes the session and returns to the home screen
- Supabase-backed storage: replaced the `localStorage` shim in `src/storage.js` with a Postgres-backed one (`supabase/schema.sql`), so session and access-code data is shared across every device instead of being per-browser
- Supabase Realtime: session updates (scores, check-ins, court changes) now push to every connected device within about a second, replacing the previous 3-second polling
- `.env.example` and `backend/README.md` walkthrough for setting up a Supabase project

### Changed
- Refactored `src/PickleballOpenPlay.jsx` into smaller components under `src/components/`, with shared helpers in `src/lib/` and styles in `src/styles.js` — no behavior change
