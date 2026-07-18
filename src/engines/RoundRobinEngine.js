// TournamentEngine implementation for Round Robin — see TournamentEngine.js
// for the shared interface this conforms to.
//
// generateSchedule() delegates straight to RoundRobinScheduler.js, the
// working, tested circle-method engine already shipped in the prior Round
// Robin Scheduler task. This class adds no new scheduling logic of its own
// — it only conforms that already-working code to the TournamentEngine
// interface.
//
// updateMatchResult() is real as of Tournament Match Management: it
// validates the incoming result, writes it onto the matching
// TournamentMatch, and rolls the containing round's and the tournament's
// own status up via lib/tournamentModel.js's computeRoundStatus/
// computeTournamentStatus (format-agnostic — every format progresses the
// same way once a match completes).
//
// getStandings/getNextMatches are still placeholders — standings
// calculation and "what's next" logic are explicitly out of scope for this
// task (separate later FEATURES.md items: Round Robin Standings, Champion
// Determination). They return an inert, clearly-marked placeholder shape
// rather than throwing.
import { TournamentEngine } from "./TournamentEngine.js";
import { generateRoundRobinSchedule } from "./RoundRobinScheduler.js";
import { findMatch, computeRoundStatus, computeTournamentStatus } from "../lib/tournamentModel.js";

const NOT_IMPLEMENTED = { implemented: false, message: "Not implemented yet — architecture only (Tournament Engine Foundation)." };

export class RoundRobinEngine extends TournamentEngine {
  generateSchedule(participants, courtsCount) {
    return generateRoundRobinSchedule({ entrants: participants, courtsCount });
  }

  // result: { scoreA, scoreB, winnerId }
  // returns: the updated Tournament (never mutates the one passed in)
  updateMatchResult(tournament, matchId, result) {
    if (tournament.status === "completed") {
      throw new Error("This tournament is already completed — results can't be edited.");
    }
    const { scoreA, scoreB, winnerId } = result;
    if (scoreA === "" || scoreB === "" || scoreA == null || scoreB == null) {
      throw new Error("Enter a score for both teams.");
    }
    const numA = Number(scoreA);
    const numB = Number(scoreB);
    if (!Number.isFinite(numA) || !Number.isFinite(numB) || numA < 0 || numB < 0) {
      throw new Error("Scores can't be negative.");
    }
    if (!winnerId) {
      throw new Error("Select a winner before saving.");
    }

    const found = findMatch(tournament, matchId);
    if (!found) throw new Error("Match not found.");
    if (found.match.isBye) throw new Error("Bye matches don't have a result to record.");
    if (winnerId !== found.match.teamA.id && winnerId !== found.match.teamB.id) {
      throw new Error("Winner must be one of this match's two teams.");
    }

    const updatedMatch = {
      ...found.match,
      score: { teamA: numA, teamB: numB },
      winner: winnerId,
      status: "completed",
      completedAt: Date.now(),
    };
    const rounds = tournament.rounds.map((r) => {
      if (r.roundNumber !== found.round.roundNumber) return r;
      const matches = r.matches.map((m) => (m.id === matchId ? updatedMatch : m));
      return { ...r, matches, status: computeRoundStatus(matches) };
    });
    const next = { ...tournament, rounds };
    next.status = computeTournamentStatus(next);
    return next;
  }

  getStandings(tournament) {
    return NOT_IMPLEMENTED;
  }

  getNextMatches(tournament) {
    return NOT_IMPLEMENTED;
  }
}
