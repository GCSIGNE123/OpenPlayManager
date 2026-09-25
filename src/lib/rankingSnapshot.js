// Adaptive Ranking Rotation — session-level PickleKing Points snapshot.
//
// The Club Rating Engine's currentRating (RatingEngine.js / ratingModel.js)
// is NOT part of session player state, and reading it per scheduling tick
// would be an egress problem. So the session keeps a per-player SNAPSHOT:
//   players[id].rankingPoints  — number, PickleKing Points as of check-in,
//                                mirrored locally after each match
//   players[id].rankingSource  — "rated"       a stored Player Database rating was found
//                                "provisional" no stored rating (unrated player, or a
//                                              walk-in with no Player Database id):
//                                              a SESSION-ONLY value seeded at 1000,
//                                              never written to the Player Database
// These are the only two new session-player fields. The snapshot is taken
// with ONE bulk lookup (ratingModel.js's fetchPlayerRatingsBulk) for all ids
// that still need it — never one read per player, never one per tick.
import { fetchPlayerRatingsBulk } from "./ratingModel.js";

export const DEFAULT_RANKING_POINTS = 1000; // == ratingModel.js's DEFAULT_INITIAL_RATING
// Mirrors RatingEngine's "simple" algorithm (winner +K, loser -K, K = 15,
// same team-level delta for both partners in doubles). scripts/verify-
// adaptive-ranking-rotation.mjs asserts this stays equal to the real
// RatingEngine.calculateRating("simple") so the two cannot silently drift.
export const RANKING_WINNER_DELTA = 15;
export const RANKING_LOSER_DELTA = -15;

export function playersNeedingRankingSnapshot(players) {
  return Object.values(players || {})
    .filter((p) => p && typeof p.rankingPoints !== "number")
    .map((p) => p.id);
}

// Pure. Merges a bulk-lookup result into the players map.
//  - id found in `ratings`  -> rankingPoints = currentRating, source "rated"
//  - id NOT found           -> rankingPoints = 1000, source "provisional"
//                              (walk-in / unrated; session-only, nothing persisted)
// Only players still lacking a snapshot are touched. A player who has ALREADY
// played this session when the snapshot arrives is not given the stored
// rating: the Club Rating Engine's async write for those matches may already
// be included in it, and applying the local mirror on top would double-count.
// They keep a session-only provisional value instead.
export function applyRankingSnapshot(players, ratings) {
  let changed = false;
  const next = { ...players };
  for (const id of playersNeedingRankingSnapshot(players)) {
    const p = players[id];
    const rec = ratings?.[id];
    const usable = rec && typeof rec.currentRating === "number" && !(p.games > 0);
    next[id] = {
      ...p,
      rankingPoints: usable ? rec.currentRating : DEFAULT_RANKING_POINTS,
      rankingSource: usable ? "rated" : "provisional",
    };
    changed = true;
  }
  return { players: next, changed };
}

// One bulk read for every player still lacking a snapshot (0 reads if none).
export async function snapshotSessionRankings(players, fetchBulk = fetchPlayerRatingsBulk) {
  const ids = playersNeedingRankingSnapshot(players);
  if (ids.length === 0) return { players, changed: false, lookedUp: 0 };
  const ratings = await fetchBulk(ids);
  return { ...applyRankingSnapshot(players, ratings), lookedUp: ids.length };
}

// Pure. Local mirror of the Club Rating Engine's result for the SESSION
// snapshot only (the real, persisted rating update is RatingEngine's own
// fire-and-forget call in endMatch, untouched). Winner side +15, loser side
// -15, both partners identical. A player with no snapshot yet is seeded at
// 1000 first (session-only provisional).
export function applyRankingDelta(players, winnerIds, loserIds) {
  const next = { ...players };
  const bump = (id, delta) => {
    const p = next[id];
    if (!p) return;
    const base = typeof p.rankingPoints === "number" ? p.rankingPoints : DEFAULT_RANKING_POINTS;
    next[id] = {
      ...p,
      rankingPoints: base + delta,
      rankingSource: p.rankingSource || "provisional",
    };
  };
  (winnerIds || []).forEach((id) => bump(id, RANKING_WINNER_DELTA));
  (loserIds || []).forEach((id) => bump(id, RANKING_LOSER_DELTA));
  return next;
}

// ---- Points-Based Adaptive Matchmaking (cold start) ----
// A brand-new player has no stored rating, so the session seeds them at 1000
// ("provisional") — and 36 identical 1000s carry no information. For the cold
// start the session Points therefore use an expected-score (Elo-style) update
// with a provisional K that decays with games played:
//   * a result is judged against what the Points predicted (a win over a
//     stronger side moves a player more than a win over a weaker one; an even
//     result moves them exactly +-K/2), so a lucky or unlucky match corrects
//     itself instead of compounding;
//   * the first match at even Points moves a player +-24, well inside the
//     engine's 100-Point neighbourhood (x1.5 for provisional), and the swing
//     decays to the Club Rating Engine's flat +-15 by the 5th game — so ONE
//     result is early evidence, never a verdict.
// Players with a real stored rating ("rated") always use the standard +-15.
// Session-only mirror — the persisted rating update is the Club Rating
// Engine's own, untouched.
export const PROVISIONAL_K_SCHEDULE = [
  { maxGames: 2, k: 48 }, // even-odds swing +-24
  { maxGames: 4, k: 40 }, // even-odds swing +-20
];
export const ELO_SCALE = 400;

// K for the expected-score formula (2 x the even-odds swing). "rated" players
// and provisional players past the schedule use the standard flat +-15.
export function ratingKFor(player) {
  if (player?.rankingSource === "rated") return 2 * RANKING_WINNER_DELTA;
  const g = player?.games || 0; // games AFTER this match (endMatch increments first)
  for (const tier of PROVISIONAL_K_SCHEDULE) if (g <= tier.maxGames) return tier.k;
  return 2 * RANKING_WINNER_DELTA;
}

const teamMean = (players, ids) => {
  const v = (ids || []).map((id) => (typeof players[id]?.rankingPoints === "number" ? players[id].rankingPoints : DEFAULT_RANKING_POINTS));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : DEFAULT_RANKING_POINTS;
};

// Expected-score update. `margin` (optional, winner points - loser points, in
// [0, pointsToWin]) scales the swing mildly (0.85x - 1.15x): a blow-out is a
// little more informative than a 11-10 squeaker, never dominant.
export function applyProvisionalRankingDelta(players, winnerIds, loserIds, { margin = null, pointsToWin = 11 } = {}) {
  const next = { ...players };
  const rW = teamMean(players, winnerIds), rL = teamMean(players, loserIds);
  const expectedWin = 1 / (1 + Math.pow(10, (rL - rW) / ELO_SCALE));
  const m = margin == null ? 1 : 0.85 + 0.3 * Math.max(0, Math.min(1, margin / pointsToWin));
  const bump = (id, delta) => {
    const p = next[id];
    if (!p) return;
    const base = typeof p.rankingPoints === "number" ? p.rankingPoints : DEFAULT_RANKING_POINTS;
    next[id] = { ...p, rankingPoints: Math.round((base + delta) * 1000) / 1000, rankingSource: p.rankingSource || "provisional" };
  };
  (winnerIds || []).forEach((id) => bump(id, ratingKFor(players[id]) * (1 - expectedWin) * m));
  (loserIds || []).forEach((id) => bump(id, -ratingKFor(players[id]) * expectedWin * m));
  return next;
}
