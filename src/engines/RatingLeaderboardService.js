// RatingLeaderboardService — see PROJECT.md's Club Rating & Ranking Engine
// section. Pure derived views over PlayerRating + RatingHistory records —
// nothing here is persisted, every leaderboard is recomputed fresh on
// every call, the same "no cache to invalidate" pattern this app's other
// live-board services already use.
import { fetchAllPlayerRatings, fetchRatingHistory } from "../lib/ratingModel.js";

const MIN_MATCHES_FOR_WIN_PCT = 3; // avoids a 1-0 player showing a misleading 100% at the top

function withRank(rows) {
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

export class RatingLeaderboardService {
  async getOverallRanking() {
    const all = await fetchAllPlayerRatings();
    return withRank([...all].sort((a, b) => b.currentRating - a.currentRating));
  }

  // "net rating gained within the period" — a reasonable read of Monthly/
  // Annual Ranking for a system with no separate seasonal-reset mechanism
  // yet (Seasonal Resets is explicitly a documented future-compatibility
  // item, not built this task) — sums each player's RatingHistory deltas
  // recorded since periodStart.
  async getPeriodRanking(periodStart) {
    const all = await fetchAllPlayerRatings();
    const rows = await Promise.all(
      all.map(async (rating) => {
        const history = await fetchRatingHistory(rating.playerId);
        const inPeriod = history.filter((h) => h.recordedAt >= periodStart);
        const netChange = inPeriod.reduce((sum, h) => sum + h.delta, 0);
        return { playerId: rating.playerId, currentRating: rating.currentRating, netChange, matchesInPeriod: inPeriod.length };
      })
    );
    return withRank(rows.filter((r) => r.matchesInPeriod > 0).sort((a, b) => b.netChange - a.netChange));
  }

  async getMonthlyRanking() {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return this.getPeriodRanking(start.getTime());
  }

  async getAnnualRanking() {
    const start = new Date();
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return this.getPeriodRanking(start.getTime());
  }

  // Most Improved reuses the exact same "net change within a period"
  // numbers Monthly Ranking already computes — it's the same question
  // ("who gained the most"), just not scoped to calendar-month boundaries.
  // Defaults to the last 30 days.
  async getMostImproved(sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000) {
    return this.getPeriodRanking(sinceMs);
  }

  async getHighestWinPct() {
    const all = await fetchAllPlayerRatings();
    const eligible = all.filter((r) => r.totalMatches >= MIN_MATCHES_FOR_WIN_PCT);
    const rows = eligible.map((r) => ({ ...r, winPct: r.wins / r.totalMatches }));
    return withRank(rows.sort((a, b) => b.winPct - a.winPct));
  }

  async getMostMatchesPlayed() {
    const all = await fetchAllPlayerRatings();
    return withRank([...all].sort((a, b) => b.totalMatches - a.totalMatches));
  }
}
