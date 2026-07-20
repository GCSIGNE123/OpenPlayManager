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
  // Automatic Playoff Bracket Generator — see PROJECT.md. Every rule the
  // spec's "Bracket Validation" section names, as one real, callable,
  // testable method rather than scattered implicit side effects of other
  // checks. Called by generateBracket() below before it builds anything;
  // also safe to call standalone (e.g. from a future "why can't I generate
  // yet" UI hint) since it never mutates the tournament.
  // returns: { valid: boolean, errors: string[] } — every failing rule
  // listed, not just the first one, so a caller can show them all at once.
  validateBracket(tournament, engine) {
    const errors = [];

    if (tournament.bracket) {
      errors.push("A playoff bracket has already been generated for this tournament.");
      return { valid: false, errors }; // nothing else is worth checking once this is true
    }

    const qualification = qualificationService.determineQualifiers(tournament, engine);
    const incompletePools = qualification.pools.filter((p) => !p.complete);
    if (incompletePools.length > 0) {
      errors.push(`All pools must be complete — still in progress: ${incompletePools.map((p) => p.poolLabel).join(", ")}.`);
    }
    if (!qualification.ready) {
      errors.push("Qualification has not been finalized yet.");
    }

    // Only meaningful once qualification actually finished — an in-progress
    // qualification's team count is provisional and would just double-report
    // the "not finalized" error above.
    if (qualification.ready) {
      const size = qualification.qualifiedTeams.length;
      if (size < 2 || (size & (size - 1)) !== 0) {
        errors.push(`Qualified team count (${size}) must be a power of two (2, 4, 8, 16, ...) to generate a bracket.`);
      }
      const participantIds = qualification.qualifiedTeams.map((t) => t.participantId);
      const duplicates = participantIds.filter((id, i) => participantIds.indexOf(id) !== i);
      if (duplicates.length > 0) {
        errors.push("Duplicate participants found among qualified teams — a participant can only qualify once.");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // A clean, flattened read-shape over a generated Bracket record — what a
  // future summary/debug view would want without re-walking rounds/matches
  // itself. Pure derivation, nothing persisted; returns null for "no
  // bracket yet" rather than throwing, since "not generated" is an
  // expected, normal state this whole milestone is built around.
  getBracketStructure(bracket) {
    if (!bracket) return null;
    return {
      id: bracket.id,
      status: bracket.status,
      size: bracket.size,
      roundCount: bracket.rounds.length,
      totalMatches: bracket.rounds.reduce((sum, r) => sum + r.matches.length, 0),
      rounds: bracket.rounds.map((r) => ({
        roundNumber: r.roundNumber,
        name: r.name,
        matchCount: r.matches.length,
        matches: r.matches.map((m) => ({
          matchNumber: m.matchNumber,
          teamA: m.teamA?.label ?? "TBD",
          teamB: m.teamB?.label ?? "TBD",
          status: m.status,
        })),
      })),
      champion: bracket.champion?.label ?? null,
      runnerUp: bracket.runnerUp?.label ?? null,
    };
  }

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
  // (qualified count isn't a power of two).
  //
  // Deliberately keeps its own inline not-ready/power-of-two checks rather
  // than calling validateBracket() above — this is the hot path
  // RoundRobinEngine.updateMatchResult calls after every single match
  // result, so its `{ready, reason, size}` return shape is a stable,
  // already-tested contract TournamentBracketView's preview messaging
  // depends on; validateBracket() covers the same two rules plus the
  // "already generated"/"duplicate participants" ones the spec adds this
  // task, as a separate, richer `{valid, errors[]}` result for callers
  // that want the full picture (e.g. a future "why can't I generate"
  // summary), without risking this function's existing return shape.
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
