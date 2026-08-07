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

## Recently shipped

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

## Working agreement

Each sprint is scoped directly from real facilitator/organizer observations
running actual Open Play sessions, not speculative feature requests. A
sprint that touches a "Stable" algorithm above requires explicit direction
to do so; otherwise the default is to build alongside it (a new, optional,
reusable layer — see Session Matchmaking Priority for the pattern) rather
than modify it in place.
