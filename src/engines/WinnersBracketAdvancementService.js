// Winners Bracket Progression — see PROJECT.md. Owns exactly the same
// concern PlayoffAdvancementService already owns for the single-elimination
// bracket (figuring out where a completed match's winner goes next, and
// whether a round/bracket is done) — PLUS one genuinely new concern this
// sprint adds: recording WHERE a Winners Bracket match's LOSER would enter
// the Losers Bracket (a placeholder mapping only — see recordLoserDestination
// below; nothing here ever writes a participant into the Losers Bracket
// itself, that's later progression-sprint work).
//
// Deliberately composes a shared PlayoffAdvancementService instance for
// every method that's already 100% format-agnostic (updateMatchStatus,
// getCurrentRound, populateNextMatch, advanceWinner, and the core of
// validateAdvancement) rather than re-implementing identical logic under a
// new name — the same "compose, don't duplicate" precedent PlayoffEngine
// itself already set for its own advancement service. Every method here
// operates on a plain `{ rounds: [...] }` bracket object (the Winners
// Bracket sub-record of tournament.doubleEliminationBracket), same as
// PlayoffAdvancementService operates on tournament.bracket.
import { PlayoffAdvancementService } from "./PlayoffAdvancementService.js";

const advancementService = new PlayoffAdvancementService();

function findBracketMatch(bracket, matchId) {
  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    const round = bracket.rounds[roundIndex];
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return { round, match, roundIndex };
  }
  return null;
}

export class WinnersBracketAdvancementService {
  updateMatchStatus(match, status) {
    return advancementService.updateMatchStatus(match, status);
  }

  isRoundComplete(round) {
    return advancementService.isRoundComplete(round);
  }

  getCurrentRound(winnersBracket) {
    return advancementService.getCurrentRound(winnersBracket);
  }

  populateNextMatch(winnersBracket, nextRoundIndex, nextMatchNumber, slot, winnerTeam) {
    return advancementService.populateNextMatch(winnersBracket, nextRoundIndex, nextMatchNumber, slot, winnerTeam);
  }

  // Winners Round 1 → Winners Quarterfinals → Winners Semifinals → Winners
  // Final — the exact same matchNumber -> ceil(matchNumber/2) adjacency
  // PlayoffAdvancementService.advanceWinner already uses for the
  // single-elimination bracket, since a Winners Bracket IS structurally a
  // single-elimination bracket (see DoubleEliminationEngine.
  // createWinnersBracket's own header comment) — no new advancement math
  // needed, just delegated under this service's own name per the spec's
  // architecture list.
  advanceWinner(winnersBracket, matchId, winnerTeam) {
    return advancementService.advanceWinner(winnersBracket, matchId, winnerTeam);
  }

  // The one genuinely new piece of logic this sprint adds. "Only create the
  // mapping. Do not populate Losers Bracket participants yet" — so this
  // returns a small { losersRoundNumber, losersRoundName, losersMatchNumber }
  // descriptor for a caller to STAMP ONTO the completed Winners Bracket
  // match (see DoubleEliminationEngine.updateWinnersBracket), never writes
  // into losersBracket.rounds itself.
  //
  // Routing rule (the standard double-elimination "waterfall" shape,
  // matching the round sizes DoubleEliminationEngine.createLosersBracket
  // already builds): Winners Round 1's losers drop into Losers Bracket
  // Round 1 (index 0) — the very first minor round, where they play each
  // other. Every later Winners round's losers drop into the LB "major"
  // round that immediately follows the LB round pair built for the
  // previous WB round — index `2*(wbRoundIndex) - 1` for a middle round.
  // The Winners FINAL's loser always drops into the very last Losers round
  // (the Losers Final), since that's where the Winners Bracket's own
  // runner-up meets the Losers Bracket champion. losersMatchNumber reuses
  // the same odd-matchNumber/even-matchNumber -> ceil(matchNumber/ratio)
  // adjacency advanceWinner already uses, scaled by how many WB matches
  // feed each LB match in that round — a reasonable, documented best-effort
  // placement, not a rematch-avoiding seed (out of scope this sprint).
  recordLoserDestination(winnersBracket, losersBracket, matchId) {
    const found = findBracketMatch(winnersBracket, matchId);
    if (!found || !losersBracket || losersBracket.rounds.length === 0) return null;

    const wbRoundIndex = found.roundIndex;
    const wbRoundCount = winnersBracket.rounds.length;
    const lbRoundCount = losersBracket.rounds.length;

    const targetLbIndex =
      wbRoundIndex === 0
        ? 0
        : wbRoundIndex === wbRoundCount - 1
          ? lbRoundCount - 1
          : Math.min(2 * wbRoundIndex - 1, lbRoundCount - 1);

    const targetRound = losersBracket.rounds[targetLbIndex];
    const ratio = found.round.matches.length / targetRound.matches.length;
    const losersMatchNumber = Math.max(1, Math.min(targetRound.matches.length, Math.ceil(found.match.matchNumber / ratio)));

    return { losersRoundNumber: targetRound.roundNumber, losersRoundName: targetRound.name, losersMatchNumber };
  }

  // Same shape/precedent as PlayoffAdvancementService.validateAdvancement —
  // every rule the spec's Validation section names, as one callable
  // { valid, errors[] } check. Adds the one genuinely new Double
  // Elimination rule ("invalid Winners Bracket mapping" — matchId must
  // actually belong to this Winners Bracket) on top of the same
  // no-winner/duplicate-advancement/completed-tournament checks
  // PlayoffAdvancementService already validates identically.
  validateAdvancement(winnersBracket, matchId, result) {
    const errors = [];

    if (winnersBracket.status === "completed") {
      errors.push("This Winners Bracket is already completed — no further edits are allowed.");
      return { valid: false, errors };
    }

    const found = findBracketMatch(winnersBracket, matchId);
    if (!found) {
      errors.push("Invalid Winners Bracket mapping — this match doesn't belong to the Winners Bracket.");
      return { valid: false, errors };
    }

    return advancementService.validateAdvancement(winnersBracket, matchId, result);
  }
}
