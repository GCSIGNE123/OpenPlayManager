// TournamentEngine placeholder implementation for Double Elimination — see
// TournamentEngine.js for the shared interface. No bracket generation
// (winners/losers brackets), seeding, or advancement logic exists yet (all
// separate later FEATURES.md items); every method returns an inert,
// clearly-marked placeholder shape rather than throwing, so exploring this
// engine doesn't crash a future caller (e.g. the Tournament Dashboard)
// before the real implementation lands.
import { TournamentEngine } from "./TournamentEngine.js";

const NOT_IMPLEMENTED = { implemented: false, message: "Double Elimination is not implemented yet — architecture only (Tournament Engine Foundation)." };

export class DoubleEliminationEngine extends TournamentEngine {
  generateSchedule(participants, courtsCount) {
    return NOT_IMPLEMENTED;
  }

  updateMatchResult(tournament, matchId, result) {
    return NOT_IMPLEMENTED;
  }

  getStandings(tournament) {
    return NOT_IMPLEMENTED;
  }

  getNextMatches(tournament) {
    return NOT_IMPLEMENTED;
  }
}
