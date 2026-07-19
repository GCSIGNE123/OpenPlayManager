// The one real BracketGeneratorService implementation this milestone — see
// BracketGeneratorService.js for the shared interface this conforms to.
// Despite the name, this is generic over any power-of-two qualifier count
// (not hardcoded to just 2/4/8/16 — "future bracket sizes should be easy
// to add" falls out for free) and reuses PoolQualificationService rather
// than re-deriving "who qualified" itself, the same "delegate to a
// dedicated module" precedent RoundRobinEngine's getStandings/
// updateMatchResult already set.
//
// As of Playoff Match Management & Winner Advancement, a `ready: true`
// result from generateBracket() is the actual persistable Bracket record
// (id/status/completedAt/champion/runnerUp included) — RoundRobinEngine
// attaches it to tournament.bracket as-is the moment it's first generated.
// PlayoffEngine.js owns everything that happens to it after that (starting
// matches, saving results, advancing winners) — this file only ever builds
// the initial structure, once.
import { BracketGeneratorService } from "./BracketGeneratorService.js";
import { PoolQualificationService } from "./PoolQualificationService.js";
import { assignSeeds as assignSeedsForBracket } from "./BracketSeeding.js";
import { stageNameForCount } from "./playoffStages.js";
import { uid } from "../lib/random.js";

const qualificationService = new PoolQualificationService();

const NOT_READY = { ready: false, reason: "not_ready", size: 0, seeds: [], rounds: [] };

function makeBracketMatch({ round, matchNumber, teamA = null, teamB = null }) {
  return {
    id: uid(),
    round,
    matchNumber,
    // As of Tournament Court Assignment & Match Queue, no round (including
    // round 1) comes pre-assigned a court anymore — court is always null
    // until CourtAssignmentService.assignMatchToCourt sets it, the same
    // live/explicit assignment pool matches now use too.
    court: null,
    teamA, // SeededTeam | null ("TBD" until PlayoffEngine.advanceWinner fills it in)
    teamB,
    isBye: false, // brackets are power-of-two only this milestone — no byes possible, kept for shape parity with pool matches (computeRoundStatus expects it)
    status: "pending",
    winner: null,
    score: { teamA: null, teamB: null },
    completedAt: null,
  };
}

export class SingleEliminationBracketGenerator extends BracketGeneratorService {
  assignSeeds(qualifiedTeams, method) {
    return assignSeedsForBracket(qualifiedTeams, method);
  }

  // seededTeams.length must be a power of two — a bracket can't pair an odd
  // team out or an arbitrary count without inventing bye logic this
  // milestone doesn't cover. Round 1 is the only round built from real
  // teams; every later round is pre-built with the right match count but
  // empty teamA/teamB slots — those only fill in once PlayoffEngine
  // advances a winner into them.
  buildRounds(seededTeams) {
    const total = seededTeams.length;
    if (total < 2 || (total & (total - 1)) !== 0) {
      throw new Error(`Bracket generation requires a power-of-two qualifier count (2, 4, 8, 16, ...) — got ${total}.`);
    }

    const rounds = [];
    const firstRoundMatches = [];
    for (let i = 0; i < total / 2; i++) {
      firstRoundMatches.push(
        makeBracketMatch({ round: 1, matchNumber: i + 1, teamA: seededTeams[i], teamB: seededTeams[total - 1 - i] })
      );
    }
    rounds.push({ roundNumber: 1, name: stageNameForCount(total), status: "pending", matches: firstRoundMatches });

    let teamsInRound = firstRoundMatches.length; // winners advancing = number of round-1 matches
    let roundNumber = 2;
    while (teamsInRound >= 2) {
      const matches = [];
      for (let i = 0; i < teamsInRound / 2; i++) {
        matches.push(makeBracketMatch({ round: roundNumber, matchNumber: i + 1 }));
      }
      rounds.push({ roundNumber, name: stageNameForCount(teamsInRound), status: "pending", matches });
      teamsInRound = matches.length;
      roundNumber += 1;
    }
    return rounds;
  }

  // tournament: Tournament; engine: TournamentEngine for tournament.format
  // returns: { ready, reason?, size, seeds, rounds } when not ready/
  // unsupported, or the full persistable Bracket record (id, status:
  // "ready", completedAt: null, champion: null, runnerUp: null, size,
  // seeds, rounds) when ready — `reason` is set only when `ready` is
  // false: "not_ready" (pools still in progress) or "unsupported_size"
  // (qualified count isn't a power of two)
  generateBracket(tournament, engine) {
    const qualification = qualificationService.determineQualifiers(tournament, engine);
    if (!qualification.ready) return NOT_READY;

    const size = qualification.qualifiedTeams.length;
    if (size < 2 || (size & (size - 1)) !== 0) {
      return { ready: false, reason: "unsupported_size", size, seeds: [], rounds: [] };
    }

    const seeds = this.assignSeeds(qualification.qualifiedTeams);
    const rounds = this.buildRounds(seeds);
    return { ready: true, id: uid(), size, seeds, rounds, status: "ready", completedAt: null, champion: null, runnerUp: null };
  }
}
