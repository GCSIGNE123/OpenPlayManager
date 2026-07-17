# Changelog

All notable changes to this project will be documented in this file, starting 2026-07-15.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). This file tracks changes going forward — it does not attempt to reconstruct history prior to 2026-07-15.

## [Unreleased]

## 2026-07-16 (later, cont'd #16)

### Added
- CONNECT.PH rebrand — new centralized theme in `src/styles.js`'s `fontImport` `:root` block, with the full palette extracted from the CONNECT.PH logo: `--color-primary` (navy), `--color-secondary` (orange), `--color-accent`, `--color-success`, `--color-warning`, `--color-error`, `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-text-faint`, `--color-on-primary`, plus per-phase tokens for Progressive Skill Rotation and a rotating avatar palette (`--color-avatar-1..6`). The pre-existing `--ink`/`--court`/`--court-dark`/`--chalk`/`--ball`/`--coral`/`--line` names are kept as aliases onto this new palette, so the whole app (every style object, every screen) picked up the rebrand without rewriting each one individually
- `--color-secondary-text`: a darkened, WCAG-AA-accessible variant of the brand orange (~4.8:1 vs. the vibrant orange's ~2.4:1 on a light background), used anywhere orange needs to be the text/foreground color on a light surface (the Landing/Access screens' kicker text) rather than a fill/badge background
- New CONNECT.PH-inspired icon/favicon set: a navy field, an open orange ring evoking the logo's "C", and a small orange connector dot — replaces the old pickleball-ball motif across `favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, and two new files, `favicon-16x16.png`/`favicon-32x32.png`, packaged into a new `favicon.ico`. `scripts/generate-pwa-icons.mjs` now also hand-encodes ICO (in addition to PNG), still with no image-processing dependency
- Manifest/PWA branding updated to match: `name` → "CONNECT.PH Open Play Manager", `theme_color` → navy `#16355E`, `background_color` → `#F5F7FA`; `index.html`'s `theme-color` meta and favicon `<link>` tags updated to match

### Changed
- Every hardcoded hex color literal outside `styles.js`'s `:root` block was replaced with a `var(--color-...)` reference — covers muted-gray text tones, white fills/borders, the Progressive Skill Rotation phase-zone tint colors, `lib/utils.js`'s avatar-color array, and two stray `color="#..."` props on lucide icons in `CheckinView.jsx`/`CreateSessionScreen.jsx`
- `resultTag`'s "win" badge and `ratingBadge`'s "high rating" badge now use `--color-success` (green) instead of the primary navy, and `StandingsView`'s point-differential coloring now uses `--color-success`/`--color-error` instead of primary/coral — small semantic correctness improvements that also put the newly-required Success color to actual use
- `src/index.css`'s `body` background (previously a hardcoded cream hex, outside `styles.js`'s reach) now reads `--color-bg` too, with a matching static fallback for the brief pre-mount window before React injects the theme `<style>` tag

### Notes
- No layout or functional changes — this is colors/branding/icons only, verified across Landing, session header, Scorer, Court Cards, Standings, and the Progressive Skill Rotation panel, plus a repeat of the earlier offline-PWA test (stopped the server entirely, reloaded, app still rendered fully from cache with the new branding)
- Apple splash-screen images (the per-device-size `apple-touch-startup-image` matrix) were judged out of scope for this pass — iOS auto-generates a basic splash from the manifest's icon/background_color/name when none is provided

## 2026-07-16 (later, cont'd #15)

### Added
- Converted Open Play Manager into an installable Progressive Web App, via `vite-plugin-pwa`:
  - Web App Manifest (`display: "standalone"`, name/short_name/description, theme/background colors matching the app's palette, 192x192 + 512x512 icons with both "any" and "maskable" purposes)
  - Workbox service worker precaching the built app shell (JS/CSS bundles, `index.html`, icons, favicon) so the app can still open with no connection; `navigateFallback` serves the cached shell for in-app navigation while offline
  - `CacheFirst` runtime caching for Google Fonts (stylesheet + woff2 files) so custom fonts still render offline after a first load — deliberately no caching rule for Supabase requests, so session/score data always comes from the network when available, never served stale
  - iOS-specific meta tags in `index.html` (`apple-mobile-web-app-capable`, `apple-touch-icon`, etc.) — iOS doesn't install from the manifest alone, and "Add to Home Screen" needs these to launch standalone
  - New `scripts/generate-pwa-icons.mjs`: a dependency-free script that hand-encodes the 192x192, 512x512, and 180x180 (`apple-touch-icon`) PNG placeholders, reusing the same pickleball motif and colors as the existing `favicon.svg` (raw RGBA pixels + Node's built-in `zlib.deflateSync` + a small CRC32 table — no image library needed)
  - No UI or business-logic changes; no `vercel.json` changes needed — the generated `sw.js`/`manifest.webmanifest`/`registerSW.js` are just more static output in `dist/`, which Vercel already serves as-is
  - Added an `openplay-manager-preview` entry to `.claude/launch.json` (`npm run preview`, port 4173) for testing the real production service worker — `npm run dev` intentionally doesn't register one, so offline behavior can only be verified against a built preview, not the dev server

## 2026-07-16 (later, cont'd #14)

### Changed
- Session header kicker text: "OPEN PLAY · ORMOC CITY, LEYTE" → "OPEN PLAY MANAGER - POWERED BY CONNECTPH"

## 2026-07-16 (later, cont'd #13)

### Added
- Progressive Skill Rotation: Winner Pool Rotation's pairwise pooling mechanic now applies during the Mentorship phase. New `isPoolingRotation(rotationMode, phase)` in `lib/winnerPoolRound.js` gates on standalone Winner Pool Rotation OR Progressive Skill Rotation while in Mentorship. Courts pair up 1&2/3&4/..., a court that finishes first holds ("WAITING") until its pair partner also finishes, then both courts' winners pool into one new match and both courts' losers into another (same `WinnerPoolRotationEngine`/`resolveWinnerPoolMatch` standalone Winner Pool Rotation uses), joining the back of the queue rather than redeploying straight onto the same two courts

### Changed
- `endMatch` now also resolves a held "awaitingPair" court's pooling even if the *current* phase has since moved past Mentorship by the time its partner finishes — otherwise a phase boundary crossed between the two courts finishing could strand the held court forever

## 2026-07-16 (later, cont'd #12)

### Added
- Scorer: "Won" button next to each team on a live court, for casual games that don't need point-by-point scoring — sets the declared winner's score to 11 and the other team's to 0 in one click and marks the court finished, ready for "End match". New `declareWinner(courtIdx, team)` in `PickleballOpenPlay.jsx`; a win recorded this way is indistinguishable from a normally-scored 11-0 game in stats, `matchHistory`, and rotation history, since it goes through the same score/status/`endMatch` flow

## 2026-07-16 (later, cont'd #11)

### Added
- Progressive Skill Rotation: new `ProgressiveSkillPanel` in Scorer, replacing the old inline phase badge with a full phase dashboard —
  - **Animations**: the phase badge pops in on every phase change (CSS `@keyframes phasePop`, restarted via a remount key); the progress bar's position marker glides smoothly (`transition: left 0.5s ease`) and pulses continuously; zone colors and the Settings panel fade/slide in with their own transitions
  - **Phase indicators**: a 3-zone progress bar (Mentorship/Transition/Competitive) showing the session's current position at a glance, replacing the plain "X% of expected games" text-only readout
  - **Statistics**: a per-phase match-count row (e.g. "Mentorship: 2 · Transition: 1 · Competitive: 0"), computed from `matchHistory` entries now tagged with the phase they were actually played under
  - **Settings**: a collapsible panel with the existing "Expected games/player" input plus two new organizer-configurable phase-boundary percentages ("Mentorship ends at", "Transition ends at")
  - **Configuration**: new `state.progressiveSkillThresholds` (default `{ mentorshipMax: 30, transitionMax: 60 }`), `setProgressiveSkillThresholds` in `PickleballOpenPlay.jsx`, and `buildPhases(thresholds)` in `lib/progressiveSkillPhase.js` — clamps/orders any input into a valid, non-zero-width set of phase zones so the boundaries can never invert or collapse
- `matchHistory` records now carry a `phase` field (Progressive Skill Rotation only, `null` otherwise), computed from the pre-match state in `endMatch` since a player's games-played count only increments after the match ends

## 2026-07-16 (later, cont'd #10)

### Added
- Scorer: "Undo last round" button, shown next to the Courts section header right after ending a match — restores the *entire* pre-match state in one click: the court back to live with its original teams/score, players' stats and rotation history reverted, the match removed from `matchHistory`, and `queueIds` back to not having those players requeued. One-shot and device-local (not synced to Supabase), same pattern as "Undo regenerate": cleared by any action that could make restoring it unsafe (deploying a matchup to a court, editing a matchup, another regenerate or end-match, skipping/removing a player, a new check-in, leaving the session)

### Changed
- Bonus fix while adding the above: ending a match now also invalidates a still-pending "Undo regenerate" snapshot, since a stale pre-regenerate `nextMatchups` list could no longer safely reflect the players a round just requeued
- Manual swap (Fix teams / Substitute, on both live courts and upcoming matchups), Lock/Unlock a matchup, Regenerate matchups, and previewing generated pairings before deploying them to a court (the "Next matchups" list in Scorer) were already implemented in earlier sessions — this entry rounds out the organizer control set with the one that was missing

## 2026-07-16 (later, cont'd #9)

### Added
- Progressive Skill Rotation: Competitive-phase pairing. New `src/engines/CompetitiveRotationEngine.js`, wired into `ProgressiveSkillRotationStrategy` for `phase === "competitive"`. Beginner/intermediate skill labels are ignored entirely — no bonus, no requirement. Players are paired primarily by current session Performance Rating closeness (weighted ~2x a full partner-recency swing, so it dominates), while a genuine repeated-partner penalty can still outweigh a small rating gap. Repeated opponents are still avoided at the matchup stage, same recency scoring as every other engine in the app

### Changed
- All three Progressive Skill Rotation phases (Mentorship, Transition, Competitive) now have real pairing logic — the "Random" placeholder pairing that used to back Competitive (and, before that, Transition) is gone

## 2026-07-16 (later, cont'd #8)

### Added
- Progressive Skill Rotation: Transition-phase pairing. New `src/engines/TransitionRotationEngine.js`, wired into `ProgressiveSkillRotationStrategy` for `phase === "transition"`. Beginner+intermediate teams are now a soft preference (a scoring bonus, not a requirement) so a same-skill pairing is never blocked when it's genuinely the best available option. Performance Rating (from the previous session's `performanceRating.js`) is used as a match-quality factor: the two teams' composite rating is compared when deciding which teams face off, penalizing a big gap so a hot team is less likely to run over a cold one. Repeated partners and repeated opponents are still avoided, same recency scoring as Mentorship/Continuous queue

## 2026-07-16 (later, cont'd #7)

### Added
- Session-only Performance Rating for each player. `src/lib/performanceRating.js` derives a single 0-100 rating from wins, losses, games played, current streak, and point differential (all already tracked per player and already reset to 0 whenever a new session starts) — weighted so win rate dominates, with average point differential and streak as smaller adjustments. Shown as a colored badge in Standings (new RTG column) and in Scorer's waiting players list; hidden for players who haven't finished a game yet

## 2026-07-16 (later, cont'd #6)

### Added
- Progressive Skill Rotation: Mentorship-phase pairing. When the session's phase (see `progressiveSkillPhase.js`) is Mentorship, `ProgressiveSkillRotationStrategy` now delegates matchup generation to `BalancedRotationEngine` — prioritizing beginner+intermediate teams, avoiding a player's most recently repeated partner, and minimizing repeated opponents, same scoring as Continuous queue mode. The active phase is threaded through `refreshNextMatchups`/`regenerateNextMatchups` as a new `phase` field in the engine's `generateMatchups` context

### Changed
- Transition and Competitive phases are unaffected — pairing there is still the random placeholder from before; only Mentorship-phase pairing changed

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
