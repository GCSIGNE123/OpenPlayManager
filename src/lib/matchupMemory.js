// Rotation Redesign R1 (instrumentation only — see PROJECT.md/EGRESS.md's
// Rotation Algorithm Audit) — a bounded, session-level "matchup memory" so
// a scheduling change can ask "did this exact team-vs-team pairing happen
// recently" without reconstructing it from per-player
// recentOpponentIds/opponentCounts (an imperfect proxy: those are
// per-player opponent lists, not a team-vs-team fingerprint).
//
// Lives in its own zero-dependency module (rather than inline in
// lib/utils.js, where it was first written) so that
// AdaptiveSkillRotationEngine.js (R2) can import matchupKeyFor/
// isRecentMatchup directly without a circular import — lib/utils.js
// itself imports AdaptiveSkillRotationEngine.js at module scope. lib/
// utils.js re-exports everything from here unchanged, so every existing
// import site (PickleballOpenPlay.jsx, scripts/verify-matchup-memory.mjs,
// ...) keeps working exactly as before; this is a pure relocation, not a
// format or behavior change.
//
// The real-session audit found exact team-vs-team repeats were rare (3 of
// 49 matches, 6.1%) — this is deliberately a SMALL, cheap fingerprint list,
// not a second match-history system. Egress note: this project is
// currently under active egress optimization (see EGRESS.md) — every
// session save() already re-writes the entire session JSON blob, so an
// unbounded array here would grow that payload for the rest of a long
// session's life. 16 is chosen as "roughly 4 rounds' worth of distinct
// matchups across up to 4 courts" (this app's typical max court count),
// comfortably covering the "within the last 2 rounds" and "within the
// last N games" windows the audit's proposed scoring hierarchy calls for,
// while staying an order of magnitude smaller than matchHistory itself
// (which is intentionally unbounded for the session's lifetime — see
// defaultState.matchHistory's own comment) and than the existing
// recentOpponentIds/recentPartnerIds caps (4/2) it complements.
export const MAX_RECENT_MATCHUPS = 16;

// Normalizes one team to a stable, order-independent key: [A,B] and [B,A]
// produce the identical string. Player ids are opaque strings (uid()), so
// a plain lexicographic sort is sufficient and never needs player/session
// data to compute.
function normalizedTeamKey(team) {
  return [...team].sort().join("|");
}

// The full matchup's stable, order-independent key: normalizes each team
// internally, THEN normalizes team order so `teamX vs teamY` and
// `teamY vs teamX` also produce the identical string. This is the only
// thing ever stored — never the raw team arrays, never any player/session
// object — so each entry is a handful of bytes, not a duplicated record.
export function matchupKeyFor(teamA, teamB) {
  const a = normalizedTeamKey(teamA);
  const b = normalizedTeamKey(teamB);
  return [a, b].sort().join("__vs__");
}

// Derives one new matchup-memory entry from the already-computed teamA/
// teamB of a just-ended match (never a second copy of the match record
// itself — see matchRecord in PickleballOpenPlay.jsx's endMatch, which
// this is called alongside, not instead of). Prepends the new key and
// caps the array at MAX_RECENT_MATCHUPS, discarding the oldest entry once
// the cap is exceeded — this array must NEVER grow unbounded for a long
// session's lifetime.
export function recordMatchupMemory(recentMatchups, teamA, teamB) {
  const key = matchupKeyFor(teamA, teamB);
  return [key, ...(recentMatchups || [])].slice(0, MAX_RECENT_MATCHUPS);
}

// Read-only lookup. Rotation Redesign R2 uses this as a small, soft
// scoring signal inside AdaptiveSkillRotationEngine's joint team-formation
// search (see buildQuartetMatchup) — never a hard block. R4 will own the
// explicit hard-block/tiered-penalty policy this was originally reserved
// for.
export function isRecentMatchup(recentMatchups, teamA, teamB) {
  return (recentMatchups || []).includes(matchupKeyFor(teamA, teamB));
}
