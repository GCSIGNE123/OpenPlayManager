// Round Robin's TournamentCompletionService implementation — see
// TournamentCompletionService.js for the shared interface this conforms to.
// Reuses RoundRobinStandingsService for ranking rather than re-deriving
// records here — "who's champion" is just "who's #1 in the same standings
// the Standings tab already shows", not a separate calculation.
import { TournamentCompletionService } from "./TournamentCompletionService.js";
import { RoundRobinStandingsService } from "./RoundRobinStandingsService.js";
import { getTournamentProgress } from "../lib/tournamentModel.js";

const standingsService = new RoundRobinStandingsService();

function toResult(row) {
  return row ? { participantId: row.participantId, label: row.label } : null;
}

export class RoundRobinCompletionService extends TournamentCompletionService {
  // Complete = every scheduled (non-bye) match has a recorded result, none
  // left Pending or In Progress. Byes never block completion — they're not
  // a match anyone plays.
  isTournamentComplete(tournament) {
    const progress = getTournamentProgress(tournament);
    return progress.total > 0 && progress.completed === progress.total;
  }

  // Standings are already sorted Wins -> Win % -> Point Differential ->
  // Points For (RoundRobinStandingsService's default comparator) — champion
  // is simply rank 1, and so on. Returns nulls for slots that don't exist
  // (e.g. a 2-entrant tournament has no Third Place).
  determineChampion(tournament) {
    const standings = standingsService.updateAfterMatch(tournament);
    return {
      champion: toResult(standings[0]),
      runnerUp: toResult(standings[1]),
      thirdPlace: toResult(standings[2]),
    };
  }

  // Idempotent: once completedAt is stamped, later calls (e.g. a redundant
  // updateMatchResult -> finalizeTournament chain) return the tournament
  // unchanged rather than re-stamping a new completion time or re-running
  // determineChampion.
  finalizeTournament(tournament) {
    if (tournament.completedAt) return tournament;
    if (!this.isTournamentComplete(tournament)) return tournament;
    const { champion, runnerUp, thirdPlace } = this.determineChampion(tournament);
    return { ...tournament, completedAt: Date.now(), champion, runnerUp, thirdPlace };
  }
}
