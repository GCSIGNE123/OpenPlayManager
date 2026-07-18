# Changelog

All notable changes to this project will be documented in this file, starting 2026-07-15.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). This file tracks changes going forward — it does not attempt to reconstruct history prior to 2026-07-15.

## [Unreleased]

## 2026-07-21

### Added
- **Playoff Match Management & Winner Advancement** — the generated bracket is now fully playable, from the first elimination round to a crowned champion. The bracket becomes real, persisted state (`tournament.bracket`, structurally the same `{ id, status, completedAt, champion, runnerUp, rounds }` shape a pool already has), auto-generated the moment pool play finishes with a power-of-two qualifier count — no separate button, same automatic pattern every earlier Tournament Manager milestone used. New `src/engines/PlayoffEngine.js` (`startMatch`/`updateBracket`/`advanceWinner`/`isRoundComplete`/`isTournamentComplete`) operates on a generic bracket shape with zero Round-Robin-specific knowledge, making it directly reusable by a future standalone Single Elimination format. Completing a match automatically advances the winner into the correct slot of the next round (`matchNumber -> ceil(matchNumber/2)`, odd->teamA/even->teamB) — a next-round match's slots stay `null`/"TBD" until that happens, which is itself what keeps that round locked; starting or scoring a match is rejected until both its teams are known. The moment the Championship Match completes, the bracket stamps Champion/Runner-up, locks (`status: "completed"`), and further edits are rejected. Round 1 now gets real cycled court numbers (previously a `null` placeholder). New Start Match/Enter Scores/Save Result flow on the Bracket tab (mirrors the pool Schedule tab's UX), a 🥇 Champion/🥈 Runner-up banner once decided, and a Bracket Champion/Runner-up stat on the completed-state Overview. Bronze match, consolation bracket, double elimination, and advanced seeding are still not implemented — separate future items
- **Playoff Bracket Generation** — a seeded single-elimination bracket is now generated from Playoff Qualification's qualified teams (structure only — no match scoring, winner advancement, automatic progression, bronze match, or Double Elimination yet). New `src/engines/BracketGeneratorService.js` (abstract base) and `SingleEliminationBracketGenerator.js` (real implementation, generic over any power-of-two qualifier count). New `src/engines/BracketSeeding.js` implements Standard Cross-Pool Seeding (`standardCrossPoolSeeding`, verified against the task's own 2-pool and 4-pool examples exactly) as a small method registry — Random/Snake/Manual/DUPR-based seeding are documented seams for later. Round 1 is fully populated with real seeded teams; every later round is pre-built with the correct match count but empty "TBD" slots, since no winner-advancement logic exists yet. Pure derived data, same pattern as Standings/Qualification — nothing new persisted. New **Bracket** tab replaces the old placeholder: one column per round, each match showing seed + team name (or TBD), a status badge, and a placeholder court field; shows a guidance message if pools aren't done yet or if the qualified count isn't a power of two (adjust Teams Advancing Per Pool). Match scoring, winner advancement, automatic progression, bronze match, and Double Elimination are still not implemented — separate future items
- **Playoff Qualification** — once every pool in a Round Robin tournament completes, qualified teams and the resulting playoff stage are now determined automatically: 2 qualifiers → Championship Match, 4 → Semifinals, 8 → Quarterfinals, 16 → Round of 16 (other counts get a generic "N-Team Playoff" label). A new "Teams Advancing Per Pool" setting (Top 1/2/3/4/Custom, validated against the smallest pool's size both in the UI and defensively in `buildAndSaveRoundRobinTournament`) drives it. New `src/engines/QualificationService.js` (abstract base) and `PoolQualificationService.js` (real implementation — deliberately format-agnostic, it only calls the existing `engine.getStandings(tournament, poolId)` per pool and slices the top N; reusable by any future pooled format). Qualification is pure derived data, same pattern as Standings — nothing new is persisted beyond the `advancesPerPool` config itself, and it reads "not ready" until every pool is actually complete. New **Qualification** tab (per-pool Rank/Team/Qualified-or-Eliminated table, plus an overall qualifiers list and a summary card); the completed-state Overview gains a "Playoff Stage" line. Quarterfinal/semifinal/final matches, bracket generation, and winner advancement are still not implemented — separate future items
- **Round Robin Pool Support** — a Round Robin tournament can now be split into multiple independent pools (1/2/3/4/Custom), each with its own schedule, standings, and champion. Players are distributed as evenly as possible (18/3 pools → 6-6-6; 22/4 pools → 6-6-5-5) via a new pool-assignment registry (`src/engines/PoolAssignment.js`, only `random` implemented — manual/snake/DUPR/skill are documented seams for later). **Breaking data-model change, no migration**: a Tournament's `entrants`/`rounds`/`champion`/`runnerUp`/`thirdPlace`/`completedAt` moved onto a new `TournamentPool` in `tournament.pools[]` — acceptable since the Tournament Manager epic is still unreleased. `TournamentStandingsService`/`TournamentCompletionService` needed **zero logic changes** to support this: they were already only reading `.entrants`/`.rounds` off whatever's passed in, so `RoundRobinEngine` just calls them once per pool instead of once per tournament. Match editing now locks per pool — a finished pool can't be edited even while a sibling pool is still running — and the tournament as a whole only reaches `completed` once every pool does. New pool-tab UI (`All Pools`/`Pool A`/`Pool B`/…, shown only when there's more than one pool) filters the Schedule and Standings tabs; Overview shows Number of Pools / Teams per Pool / Matches per Pool / Pool Leaders, and once complete, one podium per pool (no combined "tournament champion" — that's Playoff Qualification's job, not implemented here). Playoff qualification, elimination brackets, and non-random assignment methods are still not implemented — separate future items
- **Champion Determination** — a completed Round Robin tournament now automatically finalizes: the moment the last match result is saved, `RoundRobinEngine.updateMatchResult()` sees the tournament's status roll up to `completed` and stamps `completedAt` plus 🥇 Champion / 🥈 Runner-up / 🥉 Third Place onto the tournament record — no separate action required. New `src/engines/TournamentCompletionService.js` (abstract base, mirrors `TournamentStandingsService`'s Strategy pattern) and `RoundRobinCompletionService.js` (real implementation — champion/runner-up/third are simply ranks 1/2/3 of the existing standings; `finalizeTournament` is idempotent). The Overview tab now shows a completed-state summary (Champion/Runner-up/Third Place, Tournament Status, Total Matches, Matches Completed, Completion Time) once the tournament finishes; the Standings tab gets a "Tournament Complete" badge. Regenerating the schedule is now blocked once a tournament is completed (button hidden, plus a guard in the Dashboard) — editing match results was already blocked by the prior Tournament Match Management task. Advanced tie-breakers, Single/Double Elimination, an awards ceremony, and PDF export are still not implemented — separate future items
- **Round Robin Standings** — a live standings table for Round Robin tournaments: Rank, Player/Team, Matches Played, Wins, Losses, Win %, Points For, Points Against, Point Differential, sorted by Wins → Win % → Point Differential → Points For. New `src/engines/TournamentStandingsService.js` (abstract base, mirrors `TournamentEngine.js`'s Strategy pattern) and `RoundRobinStandingsService.js` (the real implementation — aggregates only completed, non-bye matches; every entrant is listed even at 0 matches played). The default sort is its own exported `defaultRoundRobinComparator`, and `sortStandings` accepts an optional comparator override — the seam a future tie-breaker feature plugs into without touching `calculateStandings`. `RoundRobinEngine.getStandings()` is now real, delegating to this service. Standings are pure derived data recomputed on every render from the Dashboard's already-live `tournament` copy, so results update immediately with no page refresh or extra plumbing. Replaces the Standings tab's placeholder with a real table (🥇🥈🥉 highlight the top 3, shown only once a match has actually been completed); the Overview tab's stat row now shows Total Teams / Matches Completed / Matches Remaining / Current Leader. Champion determination, tie-breakers beyond the default sort, medal ceremonies, and Double Elimination logic are still not implemented — separate future items
- **Tournament Match Management** — organizers can now run a Round Robin tournament from start to finish: Start Match, enter Team A/Team B scores, pick a winner, Save Result, and Edit Result (until the tournament completes). Makes `RoundRobinEngine.updateMatchResult()` real (validates negative scores, a missing winner, and edits after tournament completion — each blocked with an inline message) and adds format-agnostic progress helpers (`findMatch`/`computeRoundStatus`/`computeTournamentStatus`/`getTournamentProgress`) to `lib/tournamentModel.js`. `TournamentMatch` gains `completedAt`; `score` is now `{ teamA, teamB }` instead of bare `null` (old tournament records still render fine — reads are defensive). Tournament status now really progresses `ready` → `running` → `completed`, blocking further edits once complete. The Dashboard's **Overview** tab is now real too — Total Matches / Completed / Remaining / Progress % plus a fill bar, sharing one live tournament copy with the Schedule tab so a saved result updates both immediately. Completed matches are visually distinguished (green-tinted card, winning score highlighted). Standings, rankings, champion determination, and tie-breakers are still not implemented — separate future items
- **Tournament Engine Foundation** — the shared architecture Round Robin, Single Elimination, and Double Elimination all plug into (architecture only, no elimination/standings/seeding/champion logic yet). New abstract `src/engines/TournamentEngine.js` (`generateSchedule`/`updateMatchResult`/`getStandings`/`getNextMatches`, mirroring `RotationEngine`'s pattern for Open Play), with `RoundRobinEngine` (delegates to the already-working Round Robin scheduler — the one real method in the whole layer, so this foundation doesn't regress the shipped feature), `SingleEliminationEngine`, and `DoubleEliminationEngine` (fully placeholder). Extended the Tournament/TournamentRound/TournamentMatch data model additively (`name`/`status` on Tournament, `status`/`courtAssignments` on Round, `winner`/`score` on Match) and formalized the "entrant" concept as the **Tournament Participant** model (`seed`, `status`). New **Tournament Dashboard** UI (session nav tab renamed "Schedule" → "Tournament") with five sub-tabs — Overview, Participants, Schedule, Standings, Bracket — where only Schedule is real (the existing, unchanged schedule generator); the other four are static placeholder panels
- **Round Robin Scheduler (Tournament Manager)** — the first tournament format: generates and displays a full Round Robin match schedule for Singles or Doubles. New `src/engines/RoundRobinScheduler.js` (circle/polygon method — every pair meets exactly once in the minimum number of rounds; odd entrant counts get a synthetic BYE, and every entrant draws exactly one bye), `src/lib/tournamentModel.js` (independent Tournament/TournamentRound/TournamentMatch data model, stored as its own `opl-tournament-{id}` record, never embedded in the Open Play session state), and `src/lib/tournament.js` (builds entrants from the session roster, pairing into teams for Doubles). New **Schedule** tab (Tournament sessions only) with a Generate/Regenerate control and rounds shown as expandable cards (Round → Court → Teams → a static Pending/In Progress/Completed status badge). Schedule generation and display only — no scoring, standings, rankings, champion calculation, or brackets yet
- **Player Database** — a reusable, cross-session player registry (architecture only, no statistics/rankings/tournament logic yet). New `src/lib/playerDatabase.js` stores one record per player (First/Last/Display Name, Photo, Gender, Skill, DUPR Rating, Contact Number, Notes, Active/Inactive), shared across every Open Play and Tournament session. Create Session's "Register players" step now offers **Select existing player** (search, active players only) alongside **Create new player** (which always saves to the database in addition to the current roster — no migration needed, the database just grows from the first player anyone creates). A player added to a roster reuses their database record's id, so future statistics/rankings features can join a player's history across sessions purely by id. Check-in's walk-in add and a player-management (edit/deactivate) screen are intentionally not part of this change — separate follow-ups

### Changed
- **Session Type Architecture** — Create Session's step order is now: Session name → Number of courts → Session type → Rotation Strategy *or* Tournament Format → Expected games per player (Open Play only) → Register players. "Rotation Mode" is relabeled "Rotation Strategy" in the UI to sit alongside Tournament Format as a peer concept; the underlying stored field is still `rotationMode` (deliberately not renamed — see `PROJECT.md`, avoids touching every rotation engine and preserves old session records). Expected Games per Player now only shows for Open Play sessions. Existing Open Play sessions and all rotation logic are unaffected — verified a legacy session record with no `sessionType`/`tournamentFormat` at all still loads and runs correctly

## 2026-07-18

### Added
- **Session Type selection (Open Play / Tournament) on Create Session** — architecture only, no tournament logic yet. A new step 2 toggle picks `sessionType`; Open Play shows the existing Rotation Mode selector as before, Tournament hides it and shows a Tournament Format selector instead (Round Robin / Single Elimination / Double Elimination, placeholder options, clearly labeled as not yet functional). Both `sessionType` and `tournamentFormat` are stored on the session record; a Tournament session still runs as a normal continuous-queue Open Play session under the hood until tournament logic is built. New `SESSION_TYPES`/`TOURNAMENT_FORMATS` in `lib/constants.js`
- **Session Settings dialog** — a gear icon on Scorer's Session Information card opens a modal to edit venue name, expected games per player, and (when Progressive Skill Rotation is active) its phase-boundary percentages, after the session has already started. Rotation Mode and court count are intentionally not editable here — Rotation Mode stays locked to what was chosen at Create Session, and court count keeps using its existing +/- stepper. New `SessionSettingsDialog.jsx` and `updateSessionSettings` in `PickleballOpenPlay.jsx`
- New "Expected games per player" field on Create Session (step 4, default 6), stored on the session as `expectedGamesPerPlayer` at creation. Not wired into any new behavior yet — Progressive Skill Rotation's phase calc already reads this same field (unchanged), it now just starts from an organizer-chosen value instead of always defaulting to 6

### Changed
- Rotation Mode selection moved from the Scorer page to the Create Session page (step 3, alongside venue name and court count) — it's now chosen once when the session is created (`state.rotationMode` set in `startSession`) instead of being switchable mid-session. No rotation logic changed — `getRotationEngine`/`refreshNextMatchups`/`regenerateNextMatchups`/`isPoolingRotation` and everything downstream of `rotationMode` behave identically to before
- Replaced the Scorer page's Rotation dropdown with a read-only **Session Information** card showing Rotation Mode, Courts, Players, Waiting Players, and Current Round at a glance

### Added
- Permanent, non-expiring, reusable developer access code `GUILSIGN` (`DEV_ACCESS_CODE` in `lib/constants.js`) — bypasses the normal single-use Supabase-backed access code flow entirely, for the developer's own repeated session-creation testing. Every organizer-issued code is unaffected

## 2026-07-17

### Added
- **Game History** — new "History" tab reads the session's existing `matchHistory` (read-only, no changes to scoring/rotation logic) and displays every completed game grouped into expandable round cards, most recent expanded by default. Each match shows court, both teams, final score, winner, and completion time. Clicking any player opens a Player History panel: their games played, partner/opponent history, win/loss record per round, and courts played. A search box filters by player name, round number, or court number; separate round/court dropdown filters narrow further. Export the full session history to CSV or JSON. Match Duration isn't shown — the app doesn't currently record when a match started, only when it ended — noted in `PROJECT.md` as a gap for a future task rather than faked. New `src/components/HistoryView.jsx`
- **Manual Court Assignment** — organizers can now toggle any open court to Manual (per-court Automatic/Manual switch) and hand-pick its 4 players and 2 teams themselves, sourced from the Waiting Queue and Upcoming Matchups (reuses `PlayerPicker`/`buildReplacementCandidates`/`dissolveMatchupIfReserved` from the replacement-sourcing feature), while every other court keeps using the session's active rotation mode automatically. New `manuallyReservedIds` (`lib/utils.js`) keeps the automatic engine from ever touching a player drafted or locked into a manual court — enforced centrally in `save()`, on every state change, not just when explicitly regenerating. "Lock court" validates 4 unique players (2 per side) before deploying the court live with a "🔒 Manual Assignment" badge; "Unlock" (available until the match finishes) reverses it, returning the 4 players to the queue. New "Generate Remaining Courts" button rebuilds and fills every open *automatic* court in one click, leaving manual courts untouched. Completed match history and player statistics are unaffected — this only changes how upcoming courts get filled. New functions in `PickleballOpenPlay.jsx`: `setCourtAssignmentMode`, `setManualCourtPlayer`, `clearManualCourtPlayer`, `lockManualCourt`, `unlockManualCourt`, `generateRemainingCourts`

## 2026-07-16 (later, cont'd #22)

### Added
- Player replacement now sources from **both** the Waiting Queue and Upcoming Matchups — previously a substitution could only pull from players not yet assigned to any matchup, which was too restrictive for real Open Play usage (organizers often need to grab someone from a later round instead). `PlayerPicker` now shows two labeled sections; each Upcoming Matchups candidate is tagged with which matchup they'd be pulled from ("Next up" / "Then · matchup N"). New `buildReplacementCandidates` (`lib/utils.js`) builds the combined pool, excluding the matchup currently being edited so a substitution never offers a teammate/opponent from its own matchup as a replacement
- New **"Move to Queue"** organizer action — a button on every player inside an upcoming (not-yet-started) matchup that pulls them out and sends them straight back to the waiting queue, immediately available as a replacement elsewhere. New `moveToQueue(playerId)` in `PickleballOpenPlay.jsx`
- Both this and picking a replacement from Upcoming Matchups are powered by new `dissolveMatchupIfReserved` (`lib/utils.js`): a matchup can't exist with only 3 players, so pulling one out always dissolves the whole matchup, freeing all 4 players back to the pool. The next automatic `refreshNextMatchups` (every `save()` runs one) rebuilds fresh matchups from that pool through the session's active rotation engine — so Progressive Skill Rotation (or whichever mode is active) still decides the new pairings, nothing is bypassed or hardcoded. Completed matches, `matchHistory`, and player stats are never touched — only `state.nextMatchups`

## 2026-07-16 (later, cont'd #21)

### Added
- Rotation simulator: random player counts. New `randomizePlayers` config option + `randomPlayerCount()` (exported), an inclusive random integer in `[MIN_RANDOM_PLAYERS, MAX_RANDOM_PLAYERS]` = 8-24. CLI: bare `--randomPlayers` flag; when combined with `--courts=2,3,4` the headcount is resolved once and shared across all court counts so the comparison stays apples-to-apples
- Rotation simulator: Fairness Score. `calculateFairnessStats` now also returns `fairnessScore`, a single 0-100 number (100 = perfectly even) built from the coefficient of variation of games played, so it stays meaningful across different `expectedGamesPerPlayer` settings rather than a raw stdDev number that means different things at different scales. Shown in `printSimulationReport` and the `--courts` comparison table
- New Developer page (`src/components/DeveloperView.jsx`), reached via a "Developer? Run the rotation simulator →" link on the landing screen. A simple form (players, courts, games/player, beginner %, randomize-players checkbox, compare-2/3/4-courts checkbox) runs `RotationSimulationEngine` directly in the browser and displays the results — summary, phase counts, Fairness Score badge, and a standings table reusing `StandingsView`'s existing table styles. Read-only dev tool: no session, no auth, nothing persisted or saved anywhere

## 2026-07-16 (later, cont'd #20)

### Added
- Rotation simulator: fairness statistics on games played. New `calculateFairnessStats(playerSummaries)` in `RotationSimulationEngine.js` computes min/max/average/population-standard-deviation of games played across the roster, returned as `result.fairnessStats`. `printSimulationReport` prints a one-line summary, and the `--courts=2,3,4` comparison table gained GP min/max/avg/stdDev columns so fairness is easy to compare across court counts side by side

## 2026-07-16 (later, cont'd #19)

### Added
- `scripts/run-simulation.mjs`'s `--courts` flag now accepts a comma-separated list (e.g. `--courts=2,3,4`) to run the same session back-to-back at each court count and print a comparison table (rounds run, total matches, per-phase match counts) alongside each individual report

### Fixed
- Real deadlock bug in `RotationSimulationEngine`: when `courtCount` couldn't always be fully filled by the player pool (e.g. 4 courts with 12 players — at most 3 matches can run at once), one court in a Winner-Pool-paired pair could get permanently stuck `awaitingPair` because its partner court never received a 4th match to fill it, holding those players out of the queue forever (they'd stop progressing partway through the session, and the simulation would run to the `maxRounds` safety cap without ever finishing cleanly). New `releaseStalePairings`, run once per round after that round's matches end: any court still `awaitingPair` whose partner is (still) `"open"` is force-released back to the queue instead of waiting indefinitely. Verified across courts=2/3/4 × player counts 8-20 (30 combinations, run 5x each for randomness) — all now complete cleanly with every player reaching the expected games count. Simulation-only fix; doesn't touch `resolveWinnerPoolMatch`/`isPoolingRotation` or any pooling behavior the live app relies on

## 2026-07-16 (later, cont'd #18)

### Added
- Headless Rotation Simulation Engine (`src/lib/simulation/RotationSimulationEngine.js`) — `runSimulation(config)` plays out a complete simulated Open Play session under Progressive Skill Rotation and returns a structured result (per-player final standings, full match log, per-round log, per-phase match counts, stop reason). Genuinely reuses the live app's matchmaking (`getRotationEngine`/`refreshNextMatchups`, `progressiveSkillPhaseFor`, and the Winner Pool Rotation pooling mechanic Mentorship phase borrows) rather than reimplementing the algorithm; only supplies the round-by-round court-fill/score/end-match orchestration a live UI would normally drive one click at a time. `printSimulationReport(result)` logs a `console.table` report. New CLI entry point `scripts/run-simulation.mjs` (`node scripts/run-simulation.mjs [--players=] [--courts=] [--games=] [--skillSplit=] [--mentorshipMax=] [--transitionMax=]`)
- No UI added — this is a library module + CLI script only, per this task's scope

### Changed
- Moved `progressiveSkillPhaseFor` out of `PickleballOpenPlay.jsx` (where it was a private helper) into `lib/progressiveSkillPhase.js` and exported it, so the new headless simulation engine can compute the same phase the live app would without importing a React component. Pure refactor — same logic, same call sites, verified no behavior change

## 2026-07-16 (later, cont'd #17)

### Added
- Standings: new **GP** (Games Played, `wins + losses`) column, placed right after Player — recomputed on every render so it's always in sync after a completed match, no new stored field
- Standings: click any of GP/W/L/+/-/RTG to sort by that column — first click ascending, second descending, third returns to the default order, with a ▲/▼ indicator next to the active column's header; only one column sorts at a time, and sorting is instant (plain client-side `.sort()`, no reload)
- Standings: formalized the **default order** (no active sort) as highest Rating → highest Wins → highest point differential → alphabetical name — previously wins → point differential → fewest losses; the new tie-break chain leads with Rating since that's now the primary "who's doing well" signal, per this task's spec

### Notes
- Preserved all existing Standings styling (win/loss diff coloring, rating badges, 🔥 streak icon) and the responsive layout — only the header row and column set changed

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
