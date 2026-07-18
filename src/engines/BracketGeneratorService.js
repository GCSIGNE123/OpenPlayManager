// Abstract interface bracket-generation logic implements (Strategy
// pattern) — the same role QualificationService.js plays one level down
// (it reads QualificationService's output as its own input) and
// TournamentEngine.js plays for scheduling. Kept as its own service since
// "turn a flat qualifier list into a seeded bracket structure" is a
// distinct concern from "who qualified" (QualificationService) — a future
// elimination format (Single Elimination run standalone, not fed by pools)
// could reuse the bracket-building half without the pool-qualification half.
//
// Every method throws by default; a subclass overrides what it actually
// implements. See SingleEliminationBracketGenerator.js for the one real
// implementation so far.
export class BracketGeneratorService {
  // tournament: Tournament (see lib/tournamentModel.js)
  // engine: the TournamentEngine for tournament.format — passed in rather
  // than looked up here, same reasoning as QualificationService: avoids a
  // circular import with lib/tournament.js, which owns the format->engine
  // registry
  // returns: { ready: boolean, reason?: string, size, seeds, rounds }
  // — see SingleEliminationBracketGenerator for the full shape
  generateBracket(tournament, engine) {
    throw new Error("generateBracket() must be implemented by a BracketGeneratorService subclass");
  }

  // qualifiedTeams: QualifiedTeam[] (see PoolQualificationService)
  // method: optional seeding method name (see BracketSeeding.js)
  // returns: SeededTeam[] — qualifiedTeams plus `seed` (1-indexed), ordered
  assignSeeds(qualifiedTeams, method) {
    throw new Error("assignSeeds() must be implemented by a BracketGeneratorService subclass");
  }

  // seededTeams: SeededTeam[] (see assignSeeds)
  // returns: BracketRound[] — { roundNumber, name, matches: BracketMatch[] }
  // Round 1 matches are fully populated with real teams; every later
  // round's matches start with empty (null) teamA/teamB slots — no winner-
  // advancement logic exists yet to fill them in.
  buildRounds(seededTeams) {
    throw new Error("buildRounds() must be implemented by a BracketGeneratorService subclass");
  }
}
