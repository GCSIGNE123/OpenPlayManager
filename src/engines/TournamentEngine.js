// Abstract interface every tournament format engine implements (Strategy
// pattern) — mirrors the existing RotationEngine base class's role for Open
// Play's rotation strategies (see RotationEngine.js), but for the entirely
// separate tournament data model (lib/tournamentModel.js). Nothing in the
// app dispatches to a concrete engine through this base class yet (that
// wiring is a later task) — this is the Tournament Engine Foundation itself:
// the shared shape RoundRobinEngine/SingleEliminationEngine/
// DoubleEliminationEngine all conform to.
//
// Every method throws by default; a subclass overrides only what it
// actually implements. A subclass is free to leave a method throwing (or
// override it to return inert placeholder data) if that format's logic
// isn't built yet — see RoundRobinEngine.js for the one method
// (generateSchedule) that's real today, and SingleEliminationEngine.js/
// DoubleEliminationEngine.js for engines that are placeholder-only so far.
export class TournamentEngine {
  // participants: Participant[] (see lib/tournamentModel.js's makeParticipant)
  // courtsCount: number
  // returns: TournamentRound[] (see lib/tournamentModel.js's makeRound)
  generateSchedule(participants, courtsCount) {
    throw new Error("generateSchedule() must be implemented by a TournamentEngine subclass");
  }

  // tournament: Tournament: matchId: TournamentMatch['id']
  // result: { winner, score } — shape intentionally unspecified until match
  // scoring is actually built
  // returns: Tournament (with the match updated)
  updateMatchResult(tournament, matchId, result) {
    throw new Error("updateMatchResult() must be implemented by a TournamentEngine subclass");
  }

  // tournament: Tournament
  // returns: format-specific standings data — shape intentionally
  // unspecified until Tournament Standings is actually built
  getStandings(tournament) {
    throw new Error("getStandings() must be implemented by a TournamentEngine subclass");
  }

  // tournament: Tournament
  // returns: TournamentMatch[] — the matches a live view would show as
  // "up next"; shape/ordering intentionally unspecified until this is
  // actually wired to a live tournament view
  getNextMatches(tournament) {
    throw new Error("getNextMatches() must be implemented by a TournamentEngine subclass");
  }
}
