// Losers Bracket Progression — completes the Double Elimination Foundation
// (DoubleEliminationEngine.js). Owns exactly two concerns: (1) SEATING a
// Winners Bracket loser into the Losers Bracket slot
// WinnersBracketAdvancementService.recordLoserDestination already computes
// (that method only ever returned a descriptor before this — nothing wrote
// the participant in), and (2) advancing a Losers Bracket match's WINNER
// into the next Losers Bracket round. A Losers Bracket match's LOSER is
// never routed anywhere — that absence, not a stored boolean, is what
// structurally eliminates them (same "elimination is implicit in bracket
// shape" precedent the existing single-elimination bracket already
// established; see PROJECT.md).
//
// Composes PlayoffAdvancementService for the one primitive it already gets
// right (populateNextMatch — the actual "write a team into round R, match
// N, slot S" operation), same "compose, don't duplicate" precedent
// WinnersBracketAdvancementService itself already set.
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

export class LosersBracketAdvancementService {
  updateMatchStatus(match, status) {
    return advancementService.updateMatchStatus(match, status);
  }

  isRoundComplete(round) {
    return advancementService.isRoundComplete(round);
  }

  getCurrentRound(losersBracket) {
    return advancementService.getCurrentRound(losersBracket);
  }

  // Seats a Winners Bracket loser into the Losers Bracket, at the slot
  // WinnersBracketAdvancementService.recordLoserDestination computed.
  // DoubleEliminationEngine.createLosersBracket's round-pair shape gives
  // every WB-dropper-receiving LB round exactly ONE property that matters
  // here: how many WB matches feed each of its LB matches ("ratio").
  //   - ratio === 1 (every WB round except the very first): exactly one WB
  //     match feeds each target LB match, and that target match's OTHER
  //     slot is always reserved for a Losers-Bracket-internal advancing
  //     winner (see advanceWinner below) — so the dropper always seats into
  //     teamB, never contested.
  //   - ratio > 1 (only WB Round 1, dropping into Losers Bracket Round 1 —
  //     the very first LB round, which has no preceding LB round to send it
  //     an internal winner at all): two WB Round 1 matches feed one LB
  //     Round 1 match, so BOTH slots come from droppers. The odd/even
  //     WB matchNumber (the same parity convention every other advancement
  //     in this app already uses) decides teamA vs teamB, so the two
  //     droppers headed for the same LB match never collide.
  // Returns the updated losersBracket (never mutates the one passed in). A
  // no-op if there's no destination (e.g. losersBracket doesn't exist yet,
  // or the match isn't actually in the winnersBracket).
  seatWinnersBracketLoser(losersBracket, winnersBracket, winnersMatchId, loserTeam) {
    const found = findBracketMatch(winnersBracket, winnersMatchId);
    if (!found || !losersBracket) return losersBracket;

    const wbRoundIndex = found.roundIndex;
    const wbRoundCount = winnersBracket.rounds.length;
    const lbRoundCount = losersBracket.rounds.length;
    if (lbRoundCount === 0) return losersBracket;

    const targetLbIndex =
      wbRoundIndex === 0
        ? 0
        : wbRoundIndex === wbRoundCount - 1
          ? lbRoundCount - 1
          : Math.min(2 * wbRoundIndex - 1, lbRoundCount - 1);

    const targetRound = losersBracket.rounds[targetLbIndex];
    const ratio = found.round.matches.length / targetRound.matches.length;
    const losersMatchNumber = Math.max(1, Math.min(targetRound.matches.length, Math.ceil(found.match.matchNumber / ratio)));
    const slot = ratio > 1 ? (found.match.matchNumber % 2 === 1 ? "teamA" : "teamB") : "teamB";

    const rounds = advancementService.populateNextMatch(losersBracket, targetLbIndex, losersMatchNumber, slot, loserTeam);
    return { ...losersBracket, rounds };
  }

  // Advances a Losers Bracket match's WINNER into the next Losers Bracket
  // round. DoubleEliminationEngine.createLosersBracket alternates round
  // pairs of EQUAL match count ("minor" round -> "major" round, same
  // count — droppers fill the major round's other slot) with the
  // transition BETWEEN pairs, which HALVES the match count exactly like a
  // normal single-elimination advance. Which case applies is read directly
  // off the two rounds' own match counts — no separate lookup table needed,
  // and it degrades correctly for every bracket size (4/8/16/...) since the
  // shape itself is what determines it, not a hardcoded round index.
  //   - same match count next round (minor -> major, same pair): 1:1
  //     advance, same matchNumber, into teamA (teamB is reserved for that
  //     round's WB dropper via seatWinnersBracketLoser above — never both
  //     written by the same code path, so there's no collision).
  //   - half match count next round (major -> next pair's minor): standard
  //     ceil(matchNumber/2) bracket-tree adjacency, teamA/teamB decided by
  //     the CURRENT match's matchNumber parity — the same convention
  //     PlayoffAdvancementService.advanceWinner already uses for every
  //     other bracket in this app.
  // Returns the updated losersBracket (never mutates the one passed in). A
  // no-op (rounds unchanged) if there's no next round — that's the Losers
  // Final; its winner becomes losersBracket.champion, set by the caller
  // (DoubleEliminationEngine.updateLosersBracket), not here.
  advanceWinner(losersBracket, matchId, winnerTeam) {
    const found = findBracketMatch(losersBracket, matchId);
    if (!found) return losersBracket.rounds;
    const nextRoundIndex = found.roundIndex + 1;
    if (nextRoundIndex >= losersBracket.rounds.length) return losersBracket.rounds; // Losers Final — no next round

    const currentRound = losersBracket.rounds[found.roundIndex];
    const nextRound = losersBracket.rounds[nextRoundIndex];

    if (nextRound.matches.length === currentRound.matches.length) {
      // same pair, minor -> major: 1:1 advance, always into teamA
      return advancementService.populateNextMatch(losersBracket, nextRoundIndex, found.match.matchNumber, "teamA", winnerTeam);
    }
    // crossing a pair boundary: standard halving advance
    const nextMatchNumber = Math.ceil(found.match.matchNumber / 2);
    const slot = found.match.matchNumber % 2 === 1 ? "teamA" : "teamB";
    return advancementService.populateNextMatch(losersBracket, nextRoundIndex, nextMatchNumber, slot, winnerTeam);
  }

  // Same shape/precedent as WinnersBracketAdvancementService.validateAdvancement.
  validateAdvancement(losersBracket, matchId, result) {
    const errors = [];

    if (losersBracket.status === "completed") {
      errors.push("This Losers Bracket is already completed — no further edits are allowed.");
      return { valid: false, errors };
    }

    const found = findBracketMatch(losersBracket, matchId);
    if (!found) {
      errors.push("Invalid Losers Bracket mapping — this match doesn't belong to the Losers Bracket.");
      return { valid: false, errors };
    }

    return advancementService.validateAdvancement(losersBracket, matchId, result);
  }
}
