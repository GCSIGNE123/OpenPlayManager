// RatingEngine — see PROJECT.md's Club Rating & Ranking Engine section.
// The one entry point every match-completion hook (Open Play's endMatch,
// Tournament's saveMatchResult/savePlayoffMatchResult, League's
// saveLeagueMatchResult) calls through — processMatchResult().
//
// Central identity constraint: a PlayerRating only exists for a real
// Player Database id (see lib/ratingModel.js's header comment). Open Play
// walk-ins, and any session player never added to the Database, simply
// don't have one — processMatchResult silently skips a participant whose
// id isn't found there, rather than fabricating identity or erroring out
// the match-completion flow it's hooked into. This is a deliberate scoping
// decision (confirmed with the organizer before implementing), not an
// oversight.
//
// Algorithm plug-in point: RATING_ALGORITHMS is a small Strategy registry,
// the same shape PoolAssignment.js/BracketSeeding.js/getRotationEngine
// already use elsewhere in this app. Only "simple" is implemented this
// task; elo/glicko2/duprInspired are documented seams — the point is that
// swapping the math later means adding one function to this registry, not
// touching processMatchResult/updatePlayerRating/recordHistory at all.
import { fetchPlayer } from "../lib/playerDatabase.js";
import {
  DEFAULT_INITIAL_RATING,
  makePlayerRating,
  fetchPlayerRating,
  savePlayerRating,
  fetchAllPlayerRatings,
  makeRatingHistoryEntry,
  appendRatingHistory,
} from "../lib/ratingModel.js";

// Simple default algorithm: a fixed point exchange, not a probability-
// weighted one (that's what Elo/Glicko-2 would add later) — every winner
// gains K, every loser loses K, regardless of the rating gap between them.
// The simplest algorithm that's still genuinely a "rating," not just a
// win counter.
function simpleAlgorithm({ K = 15 } = {}) {
  return { winnerDelta: K, loserDelta: -K };
}

export const RATING_ALGORITHMS = {
  simple: simpleAlgorithm,
  // elo: not implemented — would read both players' currentRating and
  // return a probability-weighted delta instead of a fixed K.
  // glicko2: not implemented — would additionally need a per-player
  // "rating deviation" field on PlayerRating this task doesn't add.
  // duprInspired: not implemented — would need doubles-specific
  // partner-adjusted math DUPR itself uses; explicitly out of scope
  // ("do not implement DUPR integration").
};

function deriveRatingView(rating) {
  return {
    ...rating,
    trend: rating.currentRating - rating.previousRating, // >0 up, <0 down, 0 flat
    winPct: rating.totalMatches === 0 ? 0 : rating.wins / rating.totalMatches,
  };
}

export class RatingEngine {
  calculateRating(algorithm = "simple", config = {}) {
    const fn = RATING_ALGORITHMS[algorithm] || RATING_ALGORITHMS.simple;
    return fn(config);
  }

  // Pure aggregation — the read shape every leaderboard/profile view uses.
  deriveRatingView(rating) {
    return deriveRatingView(rating);
  }

  async getOrCreateRating(playerId, initialRating = DEFAULT_INITIAL_RATING) {
    const existing = await fetchPlayerRating(playerId);
    return existing || makePlayerRating(playerId, initialRating);
  }

  // Writes the new rating + win/loss/match counters, never mutates the
  // record passed in. Caller (processMatchResult) persists via
  // savePlayerRating and calls recordHistory separately — kept as two
  // steps, matching Architecture's own method list, even though
  // processMatchResult always calls both together in practice.
  updatePlayerRating(rating, delta, result) {
    const currentRating = rating.currentRating + delta;
    return {
      ...rating,
      previousRating: rating.currentRating,
      currentRating,
      highestRating: Math.max(rating.highestRating, currentRating),
      totalMatches: rating.totalMatches + 1,
      wins: rating.wins + (result === "win" ? 1 : 0),
      losses: rating.losses + (result === "loss" ? 1 : 0),
    };
  }

  async recordHistory(playerId, entry) {
    return appendRatingHistory(playerId, entry);
  }

  // winnerIds/loserIds: Player Database id arrays — 1 each for Singles, 2
  // each for Doubles. Doubles applies the SAME team-level delta to every
  // player on a side (the "simple default algorithm" choice — see
  // PROJECT.md), not a pairwise/individual-opponent calculation.
  // partnerOf(id) is looked up locally from whichever side `id` is on.
  // Skips any id with no Player Database record (see file header) —
  // returns which ids were actually rated, for callers (e.g.
  // AchievementService) that need to know.
  async processMatchResult({ winnerIds, loserIds, matchId, source, algorithm = "simple", algorithmConfig = {} }) {
    const { winnerDelta, loserDelta } = this.calculateRating(algorithm, algorithmConfig);
    const rated = [];

    const applyTo = async (ids, opponentIds, delta, result) => {
      for (const id of ids) {
        const player = await fetchPlayer(id);
        if (!player) continue; // no persistent identity — see file header
        const rating = await this.getOrCreateRating(id);
        const updated = this.updatePlayerRating(rating, delta, result);
        await savePlayerRating(updated);
        const partnerId = ids.find((otherId) => otherId !== id) || null;
        const opponentId = opponentIds.length === 1 ? opponentIds[0] : null; // only unambiguous for Singles
        const entry = makeRatingHistoryEntry({
          matchId,
          ratingBefore: rating.currentRating,
          ratingAfter: updated.currentRating,
          opponentId,
          partnerId,
          result,
          source,
        });
        await this.recordHistory(id, entry);
        rated.push({ playerId: id, rating: updated, delta, result });
      }
    };

    await applyTo(winnerIds, loserIds, winnerDelta, "win");
    await applyTo(loserIds, winnerIds, loserDelta, "loss");
    return rated;
  }

  // "was `playerId` the #1 ranked player" — used by AchievementService's
  // King Slayer check, which must ask this BEFORE processMatchResult
  // updates ratings (otherwise the just-defeated #1 might already have
  // dropped out of first place by the time this is checked).
  async isTopRanked(playerId) {
    const all = await fetchAllPlayerRatings();
    if (all.length === 0) return false;
    const top = [...all].sort((a, b) => b.currentRating - a.currentRating)[0];
    return top.playerId === playerId;
  }
}
