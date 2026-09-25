// Adaptive Ranking Rotation — SHADOW MODE (pure, read-only).
//
// Computes what the session's CURRENT rotation engine would put on court
// next, and what Adaptive Ranking Rotation WOULD put there, from the same
// inputs — without changing state, nextMatchups, queueIds, or anything a
// player actually receives. Nothing in the app calls this yet; it is the
// foundation for a later real-session shadow test (log the comparison per
// dispatch, compare against what really happened).
//
// Ratings for a shadow run: a session that is NOT in adaptiveRanking mode has
// no players[id].rankingPoints snapshot, so the caller may pass `ratings`
// (an id -> Points map, e.g. from ONE fetchPlayerRatingsBulk call); players
// missing from both use the provisional 1000 seed.
import { getRotationEngine, refreshNextMatchups, isEligibleForMatchmaking } from "./utils.js";
import { AdaptiveRankingRotationEngine } from "../engines/AdaptiveRankingRotationEngine.js";

const rankingEngine = new AdaptiveRankingRotationEngine();

const sameSet = (a, b) => {
  const x = new Set(a), y = new Set(b);
  return x.size === y.size && [...x].every((id) => y.has(id));
};
const idsOf = (m) => (m ? [...m.teamA, ...m.teamB] : []);

// state: a session state object (only read). ratings: optional { id: points }.
// maxMatchups: how many upcoming matchups to compare (default 1 — "the next
// matchup"). now: injectable clock for deterministic tests.
// Options (all additive): `rankingPlayers` — an alternate players map used ONLY
// for the ranking engine's proposal (e.g. copies carrying a shadow Points
// snapshot); the current engine always sees the untouched state.players.
// `actual: "live"` — compare against the session's REAL state.nextMatchups
// instead of a from-scratch recompute of the current engine.
export function computeShadowComparison(state, { ratings = null, maxMatchups = 1, now = Date.now(), rankingPlayers = null, actual = "recompute" } = {}) {
  const players = state.players || {};
  const waitingIds = (state.queueIds || []).filter((id) => players[id] && isEligibleForMatchmaking(players[id]));
  const recentMatchups = state.recentMatchups || null;

  // CURRENT production path: exactly what refreshNextMatchups would build
  // for the session's active engine (no existing matchups => a from-scratch
  // proposal; nothing is saved).
  let current;
  if (actual === "live") {
    current = (state.nextMatchups || []).slice(0, maxMatchups);
  } else {
    const currentEngine = getRotationEngine(state.rotationMode);
    current = refreshNextMatchups(
      state.queueIds || [], players, [], currentEngine, null, maxMatchups, state.matchmakingPriority ?? null, recentMatchups
    ).slice(0, maxMatchups);
  }

  const proposed = rankingEngine.generateMatchups({
    waitingIds, players: rankingPlayers || players, existingMatchups: [], recentMatchups, ratings, now, maxMatchups,
  });

  const comparisons = [];
  for (let i = 0; i < Math.max(current.length, proposed.length); i++) {
    const c = current[i] || null, p = proposed[i] || null;
    comparisons.push({
      index: i,
      current: c && { teamA: c.teamA, teamB: c.teamB, fairness: c.fairness || null },
      proposed: p && { teamA: p.teamA, teamB: p.teamB, reasons: p.reasons, ranking: p.ranking },
      samePlayers: Boolean(c && p && sameSet(idsOf(c), idsOf(p))),
      sameTeams: Boolean(c && p && ((sameSet(c.teamA, p.teamA) && sameSet(c.teamB, p.teamB)) || (sameSet(c.teamA, p.teamB) && sameSet(c.teamB, p.teamA)))),
      onlyInCurrent: c && p ? idsOf(c).filter((id) => !idsOf(p).includes(id)) : [],
      onlyInProposed: c && p ? idsOf(p).filter((id) => !idsOf(c).includes(id)) : [],
    });
  }
  return { currentMode: state.rotationMode, comparisons };
}
