// Abstract interface every format's completion/finalization logic
// implements (Strategy pattern) — the same role TournamentEngine.js and
// TournamentStandingsService.js play. Kept as its own service because
// "when is this format done, and who won" is a distinct concern from
// scheduling (RoundRobinScheduler), result recording (RoundRobinEngine.
// updateMatchResult), and ranking (TournamentStandingsService) — a future
// format (e.g. Single Elimination, where "done" means the final match, not
// every match) implements this without touching those.
//
// Every method throws by default; a subclass overrides what it actually
// implements. See RoundRobinCompletionService.js for the one real
// implementation so far.
export class TournamentCompletionService {
  // tournament: Tournament (see lib/tournamentModel.js)
  // returns: boolean
  isTournamentComplete(tournament) {
    throw new Error("isTournamentComplete() must be implemented by a TournamentCompletionService subclass");
  }

  // tournament: Tournament
  // returns: { champion, runnerUp, thirdPlace }, each
  // { participantId, label } | null (null if too few entrants for that slot)
  determineChampion(tournament) {
    throw new Error("determineChampion() must be implemented by a TournamentCompletionService subclass");
  }

  // tournament: Tournament
  // returns: the finalized Tournament (never mutates the one passed in) if
  // isTournamentComplete() and not already finalized, else the tournament
  // unchanged — safe to call after every match result is saved
  finalizeTournament(tournament) {
    throw new Error("finalizeTournament() must be implemented by a TournamentCompletionService subclass");
  }
}
