// TournamentEngine implementation for Round Robin — see TournamentEngine.js
// for the shared interface this conforms to.
//
// generateSchedule() is the one method here that's real: it delegates
// straight to RoundRobinScheduler.js, the working, tested circle-method
// engine already shipped in the prior Round Robin Scheduler task. This
// class adds no new scheduling logic of its own — it only conforms that
// already-working code to the new TournamentEngine interface, so building
// this foundation doesn't regress the feature that already exists.
//
// updateMatchResult/getStandings/getNextMatches are placeholders — match
// scoring, standings calculation, and "what's next" logic aren't built yet
// for any format, Round Robin included. They return an inert, clearly-
// marked placeholder shape rather than throwing, since a caller exploring
// the new engine interface (e.g. a future Dashboard) shouldn't crash on a
// format that does have real scheduling.
import { TournamentEngine } from "./TournamentEngine.js";
import { generateRoundRobinSchedule } from "./RoundRobinScheduler.js";

const NOT_IMPLEMENTED = { implemented: false, message: "Not implemented yet — architecture only (Tournament Engine Foundation)." };

export class RoundRobinEngine extends TournamentEngine {
  generateSchedule(participants, courtsCount) {
    return generateRoundRobinSchedule({ entrants: participants, courtsCount });
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
