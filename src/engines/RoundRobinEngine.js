// TournamentEngine implementation for Round Robin — see TournamentEngine.js
// for the shared interface this conforms to.
//
// generateSchedule() delegates straight to RoundRobinScheduler.js, the
// working, tested circle-method engine already shipped in the prior Round
// Robin Scheduler task. This class adds no new scheduling logic of its own
// — it only conforms that already-working code to the TournamentEngine
// interface. As of Round Robin Pool Support, lib/tournament.js calls this
// once per pool rather than once per tournament — this method itself is
// unchanged either way, since it already only ever dealt with one flat
// entrant list.
//
// updateMatchResult() is real as of Tournament Match Management, and as of
// Round Robin Pool Support operates on the containing POOL rather than the
// whole tournament: it validates the incoming result, writes it onto the
// matching TournamentMatch, and rolls the containing round's and pool's
// status up via lib/tournamentModel.js's computeRoundStatus/
// computePoolStatus (format-agnostic — every format progresses the same way
// once a match completes), then recomputes the tournament's own status from
// every pool's status via computeTournamentStatus.
//
// getStandings() is real as of Round Robin Standings: it delegates to
// RoundRobinStandingsService, the same "engine method delegates to a
// dedicated module" precedent generateSchedule/updateMatchResult already
// set. As of Pool Support it operates on a single named pool (poolId is
// required) — standings are never combined across independent pools.
//
// updateMatchResult() also finalizes a POOL as of Champion Determination /
// Round Robin Pool Support: once the round-up above lands that pool's own
// status on "completed", it calls RoundRobinCompletionService.
// finalizeTournament() on that pool (the service only ever reads
// entity.entrants/entity.rounds, so a pool satisfies it exactly like a
// whole tournament used to) — so a pool's champion/runner-up/third place
// are stamped automatically the moment its own last match is saved, with no
// separate action required, independently of any other pool's progress.
//
// getNextMatches() is still a placeholder — "what's next" logic is out of
// scope for this task. Returns an inert, clearly-marked placeholder shape
// rather than throwing.
//
// updateMatchResult() also auto-generates the Playoff Bracket as of Playoff
// Match Management & Winner Advancement: once the tournament-wide status
// rollup below lands on "completed" (every pool done) and tournament.bracket
// is still null, it asks SingleEliminationBracketGenerator for one; if the
// qualified count is a power of two, the returned record is attached as-is
// to tournament.bracket. If it isn't (or pools aren't all done yet), bracket
// stays null — the Bracket tab already knows how to explain both cases.
// From that point on, everything that happens to the bracket (starting
// matches, saving results, advancing winners) is owned by PlayoffEngine.js,
// not this file.
import { TournamentEngine } from "./TournamentEngine.js";
import { generateRoundRobinSchedule } from "./RoundRobinScheduler.js";
import { RoundRobinStandingsService } from "./RoundRobinStandingsService.js";
import { RoundRobinCompletionService } from "./RoundRobinCompletionService.js";
import { SingleEliminationBracketGenerator } from "./SingleEliminationBracketGenerator.js";
import { findMatch, computeRoundStatus, computePoolStatus, computeTournamentStatus } from "../lib/tournamentModel.js";

const standingsService = new RoundRobinStandingsService();
const completionService = new RoundRobinCompletionService();
const bracketGenerator = new SingleEliminationBracketGenerator();

const NOT_IMPLEMENTED = { implemented: false, message: "Not implemented yet — architecture only (Tournament Engine Foundation)." };

export class RoundRobinEngine extends TournamentEngine {
  generateSchedule(participants, courtsCount) {
    return generateRoundRobinSchedule({ entrants: participants, courtsCount });
  }

  // result: { scoreA, scoreB, winnerId }
  // returns: the updated Tournament (never mutates the one passed in)
  updateMatchResult(tournament, matchId, result) {
    const found = findMatch(tournament, matchId);
    if (!found) throw new Error("Match not found.");
    if (found.pool.status === "completed") {
      throw new Error("This pool is already completed — results can't be edited.");
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
    const pools = tournament.pools.map((p) => {
      if (p.id !== found.pool.id) return p;
      const rounds = p.rounds.map((r) => {
        if (r.roundNumber !== found.round.roundNumber) return r;
        const matches = r.matches.map((m) => (m.id === matchId ? updatedMatch : m));
        return { ...r, matches, status: computeRoundStatus(matches) };
      });
      let nextPool = { ...p, rounds, status: computePoolStatus({ rounds }) };
      if (nextPool.status === "completed") nextPool = completionService.finalizeTournament(nextPool);
      return nextPool;
    });
    let next = { ...tournament, pools };
    next.status = computeTournamentStatus(next);
    // Tournament Reports & History's Tournament Timeline — "Qualification
    // Finalized" is the moment pool play (and therefore qualifier
    // determination) first completes tournament-wide. Stamped once, never
    // overwritten, so a later reopen-and-redo doesn't erase the original
    // timeline event.
    if (next.status === "completed" && !next.qualificationFinalizedAt) {
      next = { ...next, qualificationFinalizedAt: Date.now() };
    }
    // Tournament Settings' "Playoff Enabled" — the one Settings field with
    // real runtime effect (everything else in Playoff Settings/Match Rules
    // is captured for reference only, see TournamentSettings.js). Default
    // true so every tournament created before this field existed keeps
    // auto-generating a bracket exactly as before.
    if (next.status === "completed" && !next.bracket && next.playoffEnabled !== false) {
      const generated = bracketGenerator.generateBracket(next, this);
      if (generated.ready) {
        const { ready, ...bracket } = generated;
        next = { ...next, bracket: { ...bracket, generatedAt: Date.now() } };
      }
    }
    return next;
  }

  // poolId: required — standings are per pool, never combined across
  // independent pools (that's a future Playoff Qualification concern).
  // returns: StandingsRow[], sorted and ranked — see
  // RoundRobinStandingsService for the shape and default sort rules.
  getStandings(tournament, poolId) {
    const pool = tournament.pools.find((p) => p.id === poolId);
    if (!pool) throw new Error("Pool not found.");
    return standingsService.updateAfterMatch(pool);
  }

  getNextMatches(tournament) {
    return NOT_IMPLEMENTED;
  }
}
