// PlayoffMatchService — see PROJECT.md's Live Playoff Bracket & Match
// Operations section. The one orchestrator every playoff match-management
// action goes through: composes the existing PlayoffEngine (starting,
// pausing, resuming, completing, walkover, all the actual bracket-state
// logic) with the existing CourtAssignmentService (court assignment/
// reassignment, already generic over pool AND bracket matches — reused
// as-is, not duplicated) rather than reimplementing either. Every method
// name here matches the spec's architecture list exactly; none of them add
// new logic beyond delegating to (and, for changeCourt, sequencing) the
// two services above.
import { PlayoffEngine } from "./PlayoffEngine.js";
import { CourtAssignmentService } from "./CourtAssignmentService.js";

const playoffEngine = new PlayoffEngine();
const courtAssignmentService = new CourtAssignmentService();

export class PlayoffMatchService {
  // tournament: the Tournament record (bracket lives at tournament.bracket
  // — CourtAssignmentService already walks tournament.pools AND
  // tournament.bracket generically, see its own header comment).
  assignCourt(tournament, matchId, courtNumber) {
    return courtAssignmentService.assignMatchToCourt(tournament, matchId, courtNumber);
  }

  // "Allow tournament directors to move matches between courts" — release
  // + assign on the SAME in-memory tournament before returning, same
  // anti-race precedent lib/tournament.js's saveCourtReassignment already
  // set (two separate calls in sequence would race against a caller's own
  // re-render in between).
  changeCourt(tournament, matchId, fromCourtNumber, toCourtNumber) {
    const released = courtAssignmentService.releaseCourt(tournament, fromCourtNumber);
    return courtAssignmentService.assignMatchToCourt(released, matchId, toCourtNumber);
  }

  startMatch(bracket, matchId) {
    return playoffEngine.startMatch(bracket, matchId);
  }

  pauseMatch(bracket, matchId) {
    return playoffEngine.pauseMatch(bracket, matchId);
  }

  resumeMatch(bracket, matchId) {
    return playoffEngine.resumeMatch(bracket, matchId);
  }

  completeMatch(bracket, matchId, result) {
    return playoffEngine.updateBracket(bracket, matchId, result);
  }

  getActiveMatches(bracket) {
    return playoffEngine.getActiveMatches(bracket);
  }

  getCurrentRoundMatches(bracket) {
    return playoffEngine.getCurrentRoundMatches(bracket);
  }
}
