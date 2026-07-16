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
│   │   ├── utils.js              Pure helpers: codes, formatting, and the matchmaking entry points (refreshNextMatchups, regenerateNextMatchups, recordRotationHistory)
│   │   ├── winnerPoolRound.js    Court-pairing orchestration for Winner Pool Rotation mode (holds a finished court until its pair partner also finishes, then pools/redeploys)
│   │   ├── progressiveSkillPhase.js  Session-progress/phase calc for Progressive Skill Rotation (mentorship/transition/competitive) — feeds ProgressiveSkillRotationStrategy's pairing choice, see below
│   │   └── performanceRating.js  Session-only Performance Rating (win %, point differential, streak) shown next to players in Standings and Scorer's waiting players list
│   ├── engines/                  Pluggable matchmaking strategies (Strategy pattern) — see Architecture below
│   │   ├── RotationEngine.js                  The interface
│   │   ├── BalancedRotationEngine.js          Continuous-queue mode's team/matchup builder
│   │   ├── WinnerPoolRotationEngine.js        Winner Pool Rotation mode's per-pool team builder (composes BalancedRotationEngine)
│   │   └── ProgressiveSkillRotationStrategy.js  Progressive Skill Rotation mode's team/matchup builder — Mentorship phase composes BalancedRotationEngine, Transition/Competitive still a random placeholder
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
- **Matchmaking is a pluggable Strategy (Strategy pattern), not hardcoded logic.** `src/engines/RotationEngine.js` defines the interface (`generateMatchups({ waitingIds, players, existingMatchups })` → new matchup objects); `src/engines/BalancedRotationEngine.js` is the main concrete implementation (always teams a beginner with an intermediate, avoids repeat partners/opponents by recency, greedy with randomized-restart tie-breaking — see the file's doc comments for the full priority order). `src/lib/utils.js`'s `getRotationEngine(rotationMode)` maps `state.rotationMode` to an engine instance, and `refreshNextMatchups`/`regenerateNextMatchups` are the only things that call it; swapping in a different mode later (King of the Court, DUPR Rotation, ...) means adding a new `RotationEngine` subclass and a case in `getRotationEngine`, not touching the app around it.
- **Matchups are built continuously, not in synchronized rounds.** Courts run independently and pick up a new match whenever they're free — there's no "everyone finishes round 3, then round 4 starts" lockstep. `refreshNextMatchups` runs after every state change and is deliberately *strict*: it only forms a matchup from a genuine 2-beginner + 2-intermediate group, never a same-skill fallback, because players check in one at a time and an eager fallback would permanently lock two beginners together moments before an intermediate arrives (matchups are immutable once built — only `reassignMatchup`/`substituteInMatchup`/the scorer's manual edits touch them). The same-skill fallback (last resort when the beginner/intermediate counts are genuinely unequal) is opt-in, and only runs from the explicit "Regenerate matchups" control in Scorer.
- **Per-player rotation history feeds the scoring.** Each player record tracks `partnerCounts`/`recentPartnerIds`, `opponentCounts`/`lastOpponentIds`/`recentOpponentIds`, and `courtCounts`/`lastCourt`, updated by `recordRotationHistory` when a match ends (see `PickleballOpenPlay.jsx`'s `endMatch`). `state.matchHistory` logs one record per completed match.
- **Three rotation modes, switchable per session from Scorer.** `state.rotationMode` ("continuous" | "winnerPool" | "progressiveSkill") picks between:
  - **Continuous queue** (default) — the model described above: every court draws independently from one shared waiting queue.
  - **Winner Pool Rotation** — courts pair up by fixed adjacent position (court 1 & 2, 3 & 4, ...). When *both* courts in a pair have finished, `src/lib/winnerPoolRound.js`'s `resolveWinnerPoolMatch` pools their 4 winners into one new match (via `WinnerPoolRotationEngine`, always 1 beginner + 1 intermediate per team, avoiding the immediately-previous partner and opponent) and their 4 losers into another. Both courts in the pair open up (not redeployed to directly) and the two new matchups join the *back* of `nextMatchups` — so anyone else who's been waiting gets first claim on the now-open courts via the normal "Assign match"/"Fill all open courts" flow, and the just-finished 8 players don't just keep replaying each other while everyone else sits out. A court that finishes before its partner shows a distinct "WAITING" state (`court.awaitingPair`) with the final score locked in, rather than being emptied — see `CourtCard.jsx`. This is the one deliberate, explicitly-scoped exception to "continuous, not lockstep" above: it's a hard requirement of the mode itself (pooling needs both courts' results at once), not incidental round-based phrasing, and it's pairwise (only the 2 courts in a pool wait on each other) rather than a full-session lockstep. The odd court out, when the courts array has an odd length, falls back to the continuous model's normal per-court requeue.
  - **Progressive Skill Rotation** — selectable end-to-end (picker, engine wiring, matchup generation, standard continuous-queue court lifecycle) and now phase-aware. `state.expectedGamesPerPlayer` (organizer-configurable in Scorer, default 6) and `src/lib/progressiveSkillPhase.js`'s `calculateSessionProgress`/`getProgressivePhase` compute the average games-played-so-far across checked-in players as a percentage of that target, and classify it into one of three phases — Mentorship (0–30%), Transition (31–60%), Competitive (61–100%) — shown as a badge in Scorer next to the rotation picker. The active phase is threaded through `refreshNextMatchups`/`regenerateNextMatchups` (as `phase`, computed by `progressiveSkillPhaseFor` in `PickleballOpenPlay.jsx`) into `ProgressiveSkillRotationStrategy.generateMatchups({ ..., phase })`:
    - **Mentorship** — pairing delegates straight to `BalancedRotationEngine` (composed, not duplicated): prioritize beginner+intermediate teams, avoid repeating a player's most recent partner, minimize repeated opponents — the same scoring Continuous queue mode uses.
    - **Transition / Competitive** — not implemented yet; still the placeholder "Random" behavior (shuffle the waiting pool, pair 2-and-2, no skill or history awareness). Swap in real per-phase logic later inside the same `generateMatchups` branch; nothing else needs to change.
- **Session-only Performance Rating.** `src/lib/performanceRating.js`'s `calculatePerformanceRating(player)` derives a single 0-100 number from stats already tracked per player — wins, losses, games played, current streak, and point differential (`pointsFor - pointsAgainst`) — weighted so win rate dominates, with average point differential and streak as smaller adjustments; `null` until a player's first completed game. It's not a real skill rating (like DUPR), just an at-a-glance "who's playing well today" indicator. Shown as a colored badge next to each player in Standings (with a new RTG column) and in Scorer's waiting players list. Session-only by construction — every input stat already resets to 0 when a session is created (see the `players` object built in `createSession`) and nothing persists beyond that session's own storage key, so no separate reset logic was needed.

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
- Progressive Skill Rotation's Mentorship phase has real pairing logic (delegates to `BalancedRotationEngine`); Transition and Competitive are still the placeholder random pairing — no skill-progression logic exists for those phases yet
- Adding a *fourth* rotation strategy is straightforward — the Strategy pattern (`RotationEngine` subclass + a case in `getRotationEngine`) and the mode picker both already support more being added
- No "undo previous round" — ending a match, substituting, or removing a player are all one-way; there's no state snapshot/rollback (the one exception is "Undo regenerate" in Scorer, which is deliberately narrow and device-local)
- Winner Pool Rotation's pairwise synchronization (holding a finished court until its pair partner also finishes) is resolved client-side on whichever device clicks "Confirm result" last; two scorers on different devices confirming both paired courts within the same ~1s Realtime sync window could theoretically race — not handled, same trust model as the rest of the app's optimistic concurrency
- No dedicated stats screen for partner/opponent frequency or court usage — that history is tracked per-player (`partnerCounts`, `opponentCounts`, `courtCounts`) but only Standings (games/wins/losses/streak) is surfaced in the UI today

These are documented in more detail in [README.md](README.md) and [backend/README.md](backend/README.md).
