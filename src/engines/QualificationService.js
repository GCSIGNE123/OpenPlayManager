// Abstract interface qualification logic implements (Strategy pattern) —
// the same role TournamentStandingsService.js and
// TournamentCompletionService.js play one level down (per pool) and
// TournamentEngine.js plays one level up (per format). Kept as its own
// service because "who advances, and to what stage" is a concern that sits
// ABOVE any single pool — it reads every pool's own standings and combines
// them, which is exactly the kind of cross-pool logic Round Robin Pool
// Support's PROJECT.md entry called out as a future Playoff Qualification
// concern, deliberately left out of that task.
//
// Every method throws by default; a subclass overrides what it actually
// implements. See PoolQualificationService.js for the one real
// implementation so far.
export class QualificationService {
  // tournament: Tournament (see lib/tournamentModel.js) — must have
  // tournament.pools
  // engine: the TournamentEngine for tournament.format (passed in rather
  // than looked up here, to avoid a circular import with lib/tournament.js,
  // which is what owns the format -> engine registry)
  // returns: { ready: boolean, pools: PoolQualification[], qualifiedTeams,
  // playoffSize } — see PoolQualificationService for the full shape
  determineQualifiers(tournament, engine) {
    throw new Error("determineQualifiers() must be implemented by a QualificationService subclass");
  }

  // qualifiedCount: number
  // returns: { count, stage } — stage is a human label ("Quarterfinals" etc.)
  calculatePlayoffSize(qualifiedCount) {
    throw new Error("calculatePlayoffSize() must be implemented by a QualificationService subclass");
  }

  // tournament: Tournament
  // engine: TournamentEngine
  // returns: QualifiedTeam[] — flat list across every pool, each
  // { poolId, poolLabel, rank, participantId, label }
  getQualifiedTeams(tournament, engine) {
    throw new Error("getQualifiedTeams() must be implemented by a QualificationService subclass");
  }
}
