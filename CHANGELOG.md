# Changelog

All notable changes to this project will be documented in this file, starting 2026-07-15.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). This file tracks changes going forward — it does not attempt to reconstruct history prior to 2026-07-15.

## [Unreleased]

## 2026-07-16 (later, cont'd #5)

### Added
- Progressive Skill Rotation: phase engine. Organizer-configurable "Expected games per player" (default 6, editable from Scorer next to the Rotation dropdown). `src/lib/progressiveSkillPhase.js` calculates session progress as the average games played by checked-in players over that target, and classifies it into a phase — Mentorship (0–30%), Transition (31–60%), Competitive (61–100%) — shown as a badge in Scorer. Display-only for now: pairing logic is unchanged (still the random placeholder from `ProgressiveSkillRotationStrategy`)

## 2026-07-16 (later, cont'd #4)

### Added
- New rotation mode: **Progressive Skill Rotation**, added to the Rotation dropdown in Scorer alongside Continuous queue and Winner Pool Rotation. Implemented as `src/engines/ProgressiveSkillRotationStrategy.js`, a new `RotationEngine` subclass wired in via `getRotationEngine(rotationMode)` in `src/lib/utils.js`. This is a placeholder: it shuffles the waiting pool and pairs players 2-and-2 with no skill awareness or partner/opponent avoidance (matching a bare random strategy), so the mode is fully selectable end-to-end without pretending to implement the eventual real "progressive skill" matching logic

## 2026-07-16 (later, cont'd #3)

### Changed
- Winner Pool Rotation: pooled winner/loser teams no longer redeploy straight back onto the same two courts they just played on — both courts open up instead, and the two new matchups join the *back* of the waiting queue. Anyone else who's been waiting gets first claim on the newly-open courts via the normal "Assign match"/"Fill all open courts" flow; the just-finished 8 players wait their turn like everyone else instead of looping between the same two courts indefinitely

## 2026-07-16 (later, cont'd #2)

### Added
- New rotation mode: **Winner Pool Rotation**, selectable per session from a "Rotation" dropdown in Scorer alongside the existing Continuous queue mode. Courts pair up by fixed adjacent position (1&2, 3&4, ...). When both courts in a pair finish, their 4 winners pool into one new match and their 4 losers pool into another — each always 1 beginner + 1 intermediate per team, never repeating the immediately-previous partner and avoiding the immediately-previous opponent where possible (`src/engines/WinnerPoolRotationEngine.js`, composing the existing `BalancedRotationEngine`'s scoring). A court that finishes before its pair partner shows a new "WAITING" state with the final score locked in and a "Waiting for Court N to finish" message, instead of being emptied. An odd court out (odd total court count) falls back to the normal continuous-queue requeue, per the spec's "handle gracefully" note
- Scorer view: "Confirm result" replaces "End match & requeue players" as the end-match button label in Winner Pool Rotation mode, since players don't get individually requeued in that mode — they wait to be pooled

## 2026-07-16 (later, cont'd)

### Added
- Scorer view: "Undo regenerate" button, shown right after clicking "Regenerate matchups" — restores the exact upcoming matchups from immediately before that regenerate. Device-local and one-shot by design (not synced to Supabase): it's cleared the moment anything could make restoring it unsafe — a matchup being deployed to a court, a Fix Teams/Substitute edit, skipping or removing a player, another regenerate, or leaving the session — so it can never resurrect a player who's since moved on to a live court

## 2026-07-16 (later)

### Added
- New pluggable matchmaking architecture (Strategy pattern): `src/engines/RotationEngine.js` defines the interface, `src/engines/BalancedRotationEngine.js` is the concrete "Balanced Beginner+Intermediate Rotation" implementation, replacing the ad hoc pairing helpers previously in `lib/utils.js`. Scores candidate pairings by partner/opponent recency (never partnered: +100, partnered last round: -100, partnered within 2 rounds: -75, partnered often: -50; symmetric opponent-avoidance scoring), with randomized-restart tie-breaking so greedy selection doesn't paint itself into a forced bad pairing
- Per-player rotation history: `partnerCounts`/`recentPartnerIds`, `opponentCounts`/`lastOpponentIds`/`recentOpponentIds`, `courtCounts`/`lastCourt`, recorded automatically when a match ends. `state.matchHistory` now logs one record per completed match (round, court, teams, winner, score)
- Scorer view: "Regenerate matchups" — rebuilds every not-locked upcoming matchup from scratch using the current pool of waiting players
- Scorer view: per-matchup "Lock" toggle — protects a matchup from "Regenerate matchups" (everything else, like Fix teams/Substitute, still works on a locked matchup)
- Scorer view: "Waiting players" panel — "Skip" a player (sits out, stays visible, excluded from matchmaking until un-skipped) or "Remove" them from the session entirely (for players not currently on a live court)

### Changed
- Matchmaking now allows a same-skill (beginner+beginner or intermediate+intermediate) team as a last resort, but only when the beginner/intermediate counts are genuinely unequal *and* the organizer explicitly clicks "Regenerate matchups" — the passive, automatic matchup-building that runs after every check-in stays strict (mixed teams only) so a same-skill pairing never gets permanently locked in just because players happened to check in one at a time
- When an odd number of teams would leave one benched, a same-skill fallback team is now always the one held back over a properly mixed team, rather than the two being treated as equally disposable

### Deferred (called out explicitly, not silently dropped)
- No UI to pick a different rotation strategy — only one engine exists; the interface supports adding more (Random Mixer, King of the Court, Winner-Up/Loser-Down, DUPR Rotation, Challenge Court, Round Robin) without changing the rest of the app, but building those specific modes and a picker UI is future work
- No "undo previous round" — ending a match, substituting, or removing a player are all one-way actions
- No dedicated stats screen for partner/opponent frequency or court usage — the history is tracked per-player but not yet surfaced beyond Standings' games/wins/losses/streak
- "Swap two players" / "swap entire teams" are covered by the existing Fix Teams / Substitute controls rather than being separate new features

## 2026-07-16

### Added
- Skill level at registration: organizers choose Beginner or Intermediate for each pre-registered player (session setup) and each walk-in (Check In); shown as a BEG/INT badge wherever players are listed
- Matchmaking: a beginner is now always teamed with an intermediate, and matches are always between two such beginner+intermediate tandems — never beginner+beginner vs. beginner+beginner, and never intermediate+intermediate vs. intermediate+intermediate. If there aren't at least 2 beginners and 2 intermediates waiting, no matchup is formed from those players; they simply wait rather than playing a same-skill-vs-same-skill match
- Scorer view: a "Next matchups" panel showing upcoming matchups before they're sent to a court, with "Fix teams" and per-player "Substitute" controls — these matchups are now real, persisted, editable state (`state.nextMatchups`) instead of a randomly recomputed preview, and "Assign match"/"Fill all open courts" deploy exactly what was reviewed

### Changed
- Matchmaking: winners (and separately, losers) advancing from different courts are now cross-paired with each other instead of simply replaying with their just-finished partner — e.g. court 1's winner and court 2's winner become new teammates rather than court 1's winning pair staying together
- Scorer view: substituting a player mid-match now always sends the outgoing player back to the waiting queue automatically, removing the old "send back to queue?" checkbox
- Scorer view: the player picker for both live-court and next-matchup substitutions now has a search box and lists candidates alphabetically by default, instead of an unsorted list

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
