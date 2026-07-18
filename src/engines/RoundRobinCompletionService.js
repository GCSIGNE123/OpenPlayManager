// Round Robin's TournamentCompletionService implementation — see
// TournamentCompletionService.js for the shared interface this conforms to.
// Reuses RoundRobinStandingsService for ranking rather than re-deriving
// records here — "who's champion" is just "who's #1 in the same standings
// the Standings tab already shows", not a separate calculation.
//
// As of Round Robin Pool Support, every method here is called with a
// TournamentPool, not a whole Tournament (RoundRobinEngine.updateMatchResult
// finalizes the containing pool once IT completes — pools are fully
// independent, so one pool finishing has no bearing on another). A pool has
// exactly the { entrants, rounds } shape these methods have always relied
// on via getPoolProgress/RoundRobinStandingsService, so nothing below
// changed except which progress helper it calls (getPoolProgress, not the
// tournament-wide getTournamentProgress) and the parameter name (`entity`:
// "a Tournament or TournamentPool, either works").
import { TournamentCompletionService } from "./TournamentCompletionService.js";
import { RoundRobinStandingsService } from "./RoundRobinStandingsService.js";
import { getPoolProgress } from "../lib/tournamentModel.js";

const standingsService = new RoundRobinStandingsService();

function toResult(row) {
  return row ? { participantId: row.participantId, label: row.label } : null;
}

export class RoundRobinCompletionService extends TournamentCompletionService {
  // Complete = every scheduled (non-bye) match has a recorded result, none
  // left Pending or In Progress. Byes never block completion — they're not
  // a match anyone plays.
  isTournamentComplete(entity) {
    const progress = getPoolProgress(entity);
    return progress.total > 0 && progress.completed === progress.total;
  }

  // Standings are already sorted Wins -> Win % -> Point Differential ->
  // Points For (RoundRobinStandingsService's default comparator) — champion
  // is simply rank 1, and so on. Returns nulls for slots that don't exist
  // (e.g. a 2-entrant pool has no Third Place).
  determineChampion(entity) {
    const standings = standingsService.updateAfterMatch(entity);
    return {
      champion: toResult(standings[0]),
      runnerUp: toResult(standings[1]),
      thirdPlace: toResult(standings[2]),
    };
  }

  // Idempotent: once completedAt is stamped, later calls (e.g. a redundant
  // updateMatchResult -> finalizeTournament chain) return the entity
  // unchanged rather than re-stamping a new completion time or re-running
  // determineChampion.
  finalizeTournament(entity) {
    if (entity.completedAt) return entity;
    if (!this.isTournamentComplete(entity)) return entity;
    const { champion, runnerUp, thirdPlace } = this.determineChampion(entity);
    return { ...entity, completedAt: Date.now(), champion, runnerUp, thirdPlace };
  }
}
