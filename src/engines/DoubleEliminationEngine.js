// Double Elimination Foundation — see PROJECT.md. `generateSchedule`
// (round-robin-style pool scheduling) is a different concern this class
// deliberately still leaves as NOT_IMPLEMENTED — this file is instead the
// PLAYOFF bracket generator selected by tournament.bracketFormat ===
// "doubleElimination" (a sibling of PlayoffBracketGenerator, not a
// replacement for it — see TournamentSettings.js's BRACKET_FORMATS). Pool
// play, qualification, and everything else upstream of "which bracket gets
// built" are completely untouched by this feature.
//
// Structure only, per this milestone — updateMatchResult/getStandings/
// getNextMatches stay the existing inert placeholders. No winner
// advancement, no losers-bracket routing (a first-round Winners Bracket
// loser is NOT seated into the Losers Bracket yet — every round past
// Winners Round 1, every Losers Bracket round, and the Grand Final are
// empty team-less placeholders), no Grand Final Reset. That's all later
// progression-sprint work, deliberately built on top of the shapes this
// file establishes rather than requiring a redesign (see Future
// Compatibility in PROJECT.md).
import { TournamentEngine } from "./TournamentEngine.js";
import { PlayoffBracketGenerator, makeBracketMatch } from "./PlayoffBracketGenerator.js";
import { PoolQualificationService } from "./PoolQualificationService.js";
import { uid } from "../lib/random.js";

const NOT_IMPLEMENTED = { implemented: false, message: "Double Elimination is not implemented yet — architecture only (Tournament Engine Foundation)." };

const qualificationService = new PoolQualificationService();
const bracketGenerator = new PlayoffBracketGenerator();

const NOT_READY = { ready: false, reason: "not_ready", size: 0, winnersBracket: null, losersBracket: null, grandFinal: null };

// Winners Bracket round names read by distance from the FINAL round, not by
// team count — this is what makes "Winners Round 1" (rather than
// "Winners Round of 16") show up for any bracket with more than 4 rounds,
// exactly matching the spec's literal Winners Round 1 / Winners
// Quarterfinals / Winners Semifinals / Winners Final catalog. A 4-round
// (16-team) bracket uses all four; smaller brackets just don't reach the
// earlier labels (a 3-round/8-team bracket never has a "Winners Round 1" —
// its first round IS the Quarterfinals), the same "not every stage name
// applies to every size" precedent playoffStages.js already set.
function winnersRoundName(indexFromStart, totalRounds) {
  const fromEnd = totalRounds - 1 - indexFromStart;
  if (fromEnd === 0) return "Winners Final";
  if (fromEnd === 1) return "Winners Semifinals";
  if (fromEnd === 2) return "Winners Quarterfinals";
  return `Winners Round ${indexFromStart + 1}`;
}

// Same distance-from-final naming, but with the Losers Bracket's own
// (spec-literal, singular) tail labels — Losers Quarterfinal / Losers
// Semifinal / Losers Final — falling back to "Losers Round N" for earlier
// rounds, same as Winners Bracket above.
function losersRoundName(indexFromStart, totalRounds) {
  const fromEnd = totalRounds - 1 - indexFromStart;
  if (fromEnd === 0) return "Losers Final";
  if (fromEnd === 1) return "Losers Semifinal";
  if (fromEnd === 2) return "Losers Quarterfinal";
  return `Losers Round ${indexFromStart + 1}`;
}

export class DoubleEliminationEngine extends TournamentEngine {
  generateSchedule(participants, courtsCount) {
    return NOT_IMPLEMENTED;
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

  // Winners Bracket — structurally identical to the existing single-
  // elimination bracket (reuses PlayoffBracketGenerator.seedParticipants +
  // .createRounds completely unchanged: round 1 seeded with real qualified
  // teams, every later round pre-built with empty teamA/teamB placeholders
  // — no advancement happens until a later sprint). Only the round NAMES
  // and each match's `matchType` ("winnersBracket" instead of "playoff")
  // differ, applied as a thin rename pass after createRounds builds the
  // real pairing structure — zero duplicated bracket-building logic.
  // returns: TournamentRound[] (same shape createRounds always returns).
  createWinnersBracket(qualifiedTeams, seedingMethod, context) {
    const seeds = bracketGenerator.seedParticipants(qualifiedTeams, seedingMethod, context);
    const rounds = bracketGenerator.createRounds(seeds, { matchType: "winnersBracket" });
    rounds.forEach((round, i) => {
      round.name = winnersRoundName(i, rounds.length);
    });
    return rounds;
  }

  // Losers Bracket — an empty skeleton, same "feed createRounds() a
  // null-filled array" trick PlacementBracketService already established
  // for the Consolation Bracket (createRounds' round/match-count logic
  // only cares how many "team" entries there are, never what they
  // contain). Sized to the real double-elimination match-count formula so
  // later progression sprints don't need to rebuild this shape: for a
  // `wbRounds`-round Winners Bracket, the Losers Bracket has
  // `2 * (wbRounds - 1)` rounds, alternating "round of WB-round-k losers
  // arriving" / "survivors play the winner" pairs — round pair k (1-based)
  // has `size / 2^(k+1)` matches each. Verified against the well-known
  // 8-team shape (LR1: 2, LR2: 2, LR3: 1, LR4/Final: 1) and the 4-team
  // shape (LR1: 1, LR2/Final: 1).
  createLosersBracket(size) {
    const wbRounds = Math.log2(size);
    const rounds = [];
    let roundNumber = 1;
    for (let k = 1; k <= wbRounds - 1; k++) {
      const matchCount = size / 2 ** (k + 1);
      for (let sub = 0; sub < 2; sub++) {
        const matches = Array.from({ length: matchCount }, (_, i) =>
          makeBracketMatch({ round: roundNumber, matchNumber: i + 1, matchType: "losersBracket" })
        );
        rounds.push({ roundNumber, name: "", status: "pending", matches });
        roundNumber += 1;
      }
    }
    rounds.forEach((round, i) => {
      round.name = losersRoundName(i, rounds.length);
    });
    return rounds;
  }

  // One empty match — both participants are TBD until the Winners
  // Bracket's champion and Losers Bracket's champion are both known, which
  // (per this sprint's scope) never happens yet.
  createGrandFinal() {
    return makeBracketMatch({ round: "grandFinal", matchNumber: 1, matchType: "grandFinal" });
  }

  // Same two-tier validation precedent PlayoffBracketGenerator established:
  // this is the rich, separately-callable { valid, errors[] } check (every
  // rule at once, for a caller that wants the full picture); generateBracket
  // below keeps its own inline checks for its stable hot-path {ready,
  // reason, size} contract, mirroring that file's own header comment on
  // why the two don't share one implementation.
  validateBracket(tournament, engine) {
    const errors = [];

    if (tournament.doubleEliminationBracket) {
      errors.push("A Double Elimination bracket has already been generated for this tournament.");
      return { valid: false, errors };
    }

    const qualification = qualificationService.determineQualifiers(tournament, engine);
    const incompletePools = qualification.pools.filter((p) => !p.complete);
    if (incompletePools.length > 0) {
      errors.push(`All pools must be complete — still in progress: ${incompletePools.map((p) => p.poolLabel).join(", ")}.`);
    }
    if (!qualification.ready) {
      errors.push("Qualification has not been finalized yet.");
    }

    if (qualification.ready) {
      const size = qualification.qualifiedTeams.length;
      // Double Elimination needs a real Losers Bracket, which needs at
      // least two Winners Bracket rounds to draw losers from — a 2-team
      // bracket has nowhere for a Losers Bracket to exist at all, so the
      // minimum here is stricter than single elimination's "just needs to
      // be a power of two."
      if (size < 4) {
        errors.push(`Double Elimination requires at least 4 qualified teams to form both a Winners and Losers Bracket — currently ${size}.`);
      } else if ((size & (size - 1)) !== 0) {
        errors.push(`Qualified team count (${size}) must be a power of two (4, 8, 16, ...) to generate a Double Elimination bracket.`);
      }
      const participantIds = qualification.qualifiedTeams.map((t) => t.participantId);
      const duplicates = participantIds.filter((id, i) => participantIds.indexOf(id) !== i);
      if (duplicates.length > 0) {
        errors.push("Duplicate participants found among qualified teams — a participant can only qualify once.");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // tournament: Tournament; engine: TournamentEngine for tournament.format
  // (passed straight through to PoolQualificationService, same contract
  // PlayoffBracketGenerator.generateBracket already uses); context: passed
  // straight through to seedParticipants (Rating/Manual seeding only).
  // returns: { ready: false, reason, size } when not ready/unsupported, or
  // the full persistable structure ({ ready: true, id, status: "ready",
  // completedAt: null, winnersBracket, losersBracket, grandFinal }) once
  // qualification is ready and the size is valid.
  generateBracket(tournament, engine, context) {
    const qualification = qualificationService.determineQualifiers(tournament, engine);
    if (!qualification.ready) return NOT_READY;

    const size = qualification.qualifiedTeams.length;
    if (size < 4 || (size & (size - 1)) !== 0) {
      return { ready: false, reason: "unsupported_size", size, winnersBracket: null, losersBracket: null, grandFinal: null };
    }

    const winnersRounds = this.createWinnersBracket(qualification.qualifiedTeams, tournament.seedingMethod, context);
    const losersRounds = this.createLosersBracket(size);
    const grandFinal = this.createGrandFinal();

    return {
      ready: true,
      id: uid(),
      status: "ready",
      completedAt: null,
      winnersBracket: { id: uid(), size, status: "pending", rounds: winnersRounds },
      losersBracket: { id: uid(), size, status: "pending", rounds: losersRounds },
      grandFinal,
    };
  }
}
