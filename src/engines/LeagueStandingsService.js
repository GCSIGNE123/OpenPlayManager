// LeagueStandingsService — see PROJECT.md's League Management section.
// Delegates every stat RoundRobinStandingsService already computes
// (wins/losses/pointsFor/pointsAgainst/pointDiff/winPct/rank — "Games Won"/
// "Games Lost" in the spec are exactly pointsFor/pointsAgainst, "Points
// For"/"Points Against" are the same numbers under the spec's own naming)
// straight to it, unmodified — a division (TournamentPool) already
// satisfies RoundRobinStandingsService's `{ entrants, rounds }` interface
// exactly, the same way a Tournament pool always has. The only genuinely
// new stat this adds is League Points, which nothing upstream computes.
import { RoundRobinStandingsService } from "./RoundRobinStandingsService.js";

const standingsService = new RoundRobinStandingsService();

// Default league-points formula: 2 points for a win, 0 for a loss — a
// simple, common recreational-league scoring convention. Not spec'd
// explicitly (the task lists "League Points" as a tracked stat without
// defining how it's earned), so this is a documented, adjustable default
// rather than a configurable rule — the same "captured, simple placeholder"
// spirit as matchScoringRules elsewhere in this app, except this one is
// actually computed rather than just displayed.
const POINTS_PER_WIN = 2;
const POINTS_PER_LOSS = 0;

export class LeagueStandingsService {
  // Standings for one division (pool) — same shape RoundRobinStandingsService
  // already returns, plus `leaguePoints`.
  getDivisionStandings(pool) {
    return standingsService
      .updateAfterMatch(pool)
      .map((row) => ({ ...row, leaguePoints: row.wins * POINTS_PER_WIN + row.losses * POINTS_PER_LOSS }));
  }

  // Every division's standings, keyed by division/pool label — what the
  // Season Dashboard's "Division Standings" section renders directly.
  getAllDivisionStandings(season) {
    return season.pools.map((pool) => ({
      poolId: pool.id,
      divisionName: pool.label,
      rows: this.getDivisionStandings(pool),
    }));
  }

  // "Player Rankings" — every division's rows flattened into one list,
  // tagged with which division they came from, sorted by League Points
  // then Win % (RoundRobinStandingsService's own default tie-break order
  // reused, applied across the flattened set rather than the ranking
  // algorithm itself being reinvented). Deliberately not re-ranked into a
  // single cross-division "#1 overall" number — divisions are independent
  // skill levels, not one combined ladder, so each row keeps its own
  // division-relative rank alongside this list's ordering.
  getPlayerRankings(season) {
    return this.getAllDivisionStandings(season)
      .flatMap(({ divisionName, rows }) => rows.map((row) => ({ ...row, divisionName })))
      .sort((a, b) => b.leaguePoints - a.leaguePoints || b.winPct - a.winPct);
  }
}
