# Open Play Manager Roadmap

This file tracks direction at a higher level than `FEATURES.md`'s backlog —
what's stable, what's actively evolving, and what's next. See `FEATURES.md`
for the full feature-by-feature backlog and `CHANGELOG.md` for a dated
history of what shipped.

## Stable — do not redesign without explicit direction

These are considered production-stable, validated against real Open Play
sessions and simulation. Facilitator feedback should extend or complement
them, not replace their core algorithms:

- Adaptive Skill Rotation (division separation, promotion/relegation) —
  Result Grouping (2026-11-12) was added to its Stage 1 selection as an
  opt-in tier under explicit organizer direction; `off` is byte-for-byte
  the previous behaviour and is what every pre-existing session runs
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

- **2026-11-14 — Roulette mode, part 2** — standings by win percentage
  (then point difference, then points), the podium opening as the Final
  Podium after the last round, and the separate Final Match award (#1 & #4
  vs #2 & #3) that never affects records or the podium; in the report, CSV
  and public summary. Spectator page and King of the Court follow.
- **2026-11-14 — Roulette mode, part 1** — a new round-based rotation:
  every round is drawn at once from one mixed pool (random partners and
  opponents, never the same partner twice, minimal repeat opponents,
  rotating sit-outs), reviewed/edited/redrawn by the organizer, then
  started together on a round clock (games to 11 or 11 minutes). Part 2
  (win-percentage standings, final podium, Final Match award) and the
  spectator page follow; King of the Court after that. See `FEATURES.md`.

- **2026-11-13 — Organizer Alerts** — a notification bell in the Scorer
  tab (red badge + chime) for: a player waiting 15+ min, the same four
  players queued again (unless manually set), a fixed pair split in the
  next queue, and a waiting player 2+ games behind someone on court or
  queued. Pure `lib/alerts.js`, derived every 30 s, never stored. See
  `FEATURES.md`.
- **2026-11-13 — Division Podiums** — in Skill Divisions sessions the
  podium is one per category: a Beginner Champion / Runner-up / 3rd and an
  Intermediate Champion / Runner-up / 3rd, side by side on the Live Board,
  Standings and TV Mode, in the report and CSV, and in the public final
  summary (spectator page follow-up in the Player repo). Same unlock and
  qualifying rules per division; other modes keep the single podium. See
  `FEATURES.md`.
- **2026-11-13 — Same-Division Fixed Pairs** — in Skill Divisions a fixed
  pair must be two players of the same division; cross-division pairs are
  refused with the reason, the Partner dropdowns disable (not hide) the
  other division's names, and a promotion/relegation or manual level change
  that splits a pair dissolves it with a notice. Other rotation modes are
  unchanged. See `FEATURES.md`.
- **2026-11-12 — Scorer Player Info** — every player row in the Scorer
  tab now shows level (BEG/INT), games played, waiting time, W–L, rating
  and a fixed-pair tag naming the partner, laid out as a two-line card
  with the actions grouped on the right; court and Up Next chips carry
  the GP badge + pair tag too. Scorer-only — Live Board, TV Mode and the
  spectator page are unchanged. See `FEATURES.md`.
- **2026-11-12 — Running Podium** — Champion / Runner-up / 3rd Place with
  hand-drawn medals on the Live Board, Standings, TV Mode and the session
  report; unlocks 60 min into play (configurable), orders exactly like the
  Standings table, 2-game minimum, early leavers keep their place. The
  public final summary now carries the podium for the spectator page
  (Player app follow-up). See `FEATURES.md`.
- **2026-11-12 — Result Grouping (winners' / losers' courts inside each
  skill division)** — Off / Prefer (default) / Strict, a third tier inside
  Skill Divisions' existing fairness window: a pure same-result quartet may
  take the court ahead of a mixed front-four, never past the rest guard,
  never skipping the longest-waiting player, and (Prefer) never skipping
  anyone 8+ minutes or 2+ games ahead. Simulation: pure courts 6% → 45%
  with games spread and waits unchanged. See `FEATURES.md`.
- **2026-11-12 — Skill Divisions is the default rotation; plain-language
  mode names** — Adaptive Skill Rotation (now labelled "Skill Divisions
  (Beginner / Intermediate)") is what a new Open Play session starts with,
  every mode has a one-line "use this when" explanation, and the two
  experimental modes sit under their own opt-in group in Create Session.
  Defaults and labels only — no Stable algorithm touched. First step of the
  Nov 2026 direction: level matchups, winners-vs-winners courts inside each
  division (next: Result Grouping), equal games and waiting time for
  everyone (next: Live Fairness panel). See `FEATURES.md`.
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
