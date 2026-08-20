# Open Play Manager Roadmap

This file tracks direction at a higher level than `FEATURES.md`'s backlog —
what's stable, what's actively evolving, and what's next. See `FEATURES.md`
for the full feature-by-feature backlog and `CHANGELOG.md` for a dated
history of what shipped.

## Stable — do not redesign without explicit direction

These are considered production-stable, validated against real Open Play
sessions and simulation. Facilitator feedback should extend or complement
them, not replace their core algorithms:

- Adaptive Skill Rotation (division separation, promotion/relegation)
- Games-played fairness algorithm (the lexicographic avg/max-games tuple)
- Winner-vs-Winner preference
- Smart Queue Management (Hold/Resume/Skip Player, Hold/Resume/Cancel Match)
- Smart Court Dispatch (automatic dispatch, voice announcements)
- Session Analytics & Fairness Report
- Round Robin scheduling/scoring/standings/qualification (`RoundRobinEngine`,
  `RoundRobinStandingsService`, `PoolQualificationService`) — audited and
  confirmed production-ready 2026-08-08 (see `TESTING.md`); untouched by the
  Double Elimination work below.

## Recently shipped

- **2026-08-10 — Latecomer Priority + Undo (Adaptive Skill Rotation)** — a
  facilitator-control override layer around the existing `nextMatchups`
  system, explicitly not a change to `AdaptiveSkillRotationEngine` itself
  (games-played fairness, partner/opponent diversity, and Winner-vs-Winner
  are all untouched — see the Stable list above). A newly checked-in player
  who hasn't played yet gets a "NEW" tag and a "Prioritize Next Match"
  action; the facilitator previews the exact proposed substitution before
  anything changes, and applying it is fully reversible until the affected
  matchup dispatches to a court, at which point Undo automatically becomes
  unavailable. Reuses the existing substitution primitives
  (`substituteInMatchup`/`dissolveMatchupIfReserved`) rather than inventing
  a new mutation rule, and the same one-shot-snapshot precedent "Undo
  regenerate"/"Undo last round" already established. 46 new regression
  checks, live-verified end to end (Preview → Apply → Undo restoring the
  exact original matchup; Apply → dispatch → Undo correctly unavailable).
  See `FEATURES.md`'s Adaptive Skill Rotation section for the full writeup.
- **2026-08-09 — Standalone Double Elimination** — root-caused from a real
  event where a session configured with Tournament Format "Double
  Elimination" silently ran as plain Round Robin (the format selector had
  no effect on schedule generation), so eliminated teams kept receiving
  matches. Fixed at the root: Create Session's format selector now actually
  determines what gets built; Single Elimination is disabled/"Coming Soon"
  until it's real. Implemented a genuine standalone Double Elimination
  format — real Winners/Losers Bracket seating and advancement, structural
  elimination (no stored flag), Grand Final + Reset — completing the
  previously half-built `DoubleEliminationEngine.js` foundation rather than
  retrofitting Round Robin's scheduler onto it. The same completed engine
  also makes the pre-existing post-Round-Robin "Double Elimination" playoff
  format real for the first time. 108 new regression checks, live-verified
  end to end in the browser including a Grand Final Reset. See
  `FEATURES.md`'s Tournament Manager section for the full writeup.
- **2026-08-08 — Facilitator Workflow Improvements, Sprint 2** (real Open
  Play session observations): Better Player Substitution (richer candidate
  info + reasoned recommendations), Session Matchmaking Priority (a
  reusable ordering policy independent of rotation mode), Persistent
  Tournament Partners (explicit cross-hold/checkout/skill-change
  persistence), Dynamic Court Count (remove courts live, queued if busy),
  Stop Queueing (finish what's on court without generating more), a
  Dedicated Payment tab (moved out of Scorer, same PIN), and removal of the
  Held Player floating reminder banner (kept the underlying safeguard).
- **2026-08-07 — Facilitator Workflow Improvements, Sprint 1** (32-player
  session sprint): Alphabetical Check-In, Scorer Tab name readability,
  Simplified Standings, Partner Requests (always-effective, per-pair),
  Substitute Right Away, End Match Early continues waiting time, Session
  Review Improvements (Final Standings + Payment Detail in saved reports).
- Mobile refresh/backgrounding session persistence fix (`localStorage`).
- TV Mode Standings +/- and RTG columns; Substitute Recommendation
  (superseded by Sprint 2's Better Player Substitution above).
- All Sessions (persistent session index + auto-end aged sessions).

## Near-term candidates (not yet scheduled)

Pulled from `FEATURES.md`'s High Priority backlog, in no particular order:

- Winner Pool Rotation refinements
- Game History (a dedicated, filterable view beyond the current History tab)
- Manual Court Assignment polish
- Player Replacement Improvements
- Standings Improvements
- PWA Support
- Standalone Single Elimination (currently disabled/"Coming Soon" in Create
  Session — `SingleEliminationEngine.js` is still a pure stub)
- Double Elimination Reports (export/history for a completed standalone
  Double Elimination tournament — Round Robin already has this via Session
  Reports; Double Elimination doesn't yet)

## Working agreement

Each sprint is scoped directly from real facilitator/organizer observations
running actual Open Play sessions, not speculative feature requests. A
sprint that touches a "Stable" algorithm above requires explicit direction
to do so; otherwise the default is to build alongside it (a new, optional,
reusable layer — see Session Matchmaking Priority for the pattern) rather
than modify it in place.
