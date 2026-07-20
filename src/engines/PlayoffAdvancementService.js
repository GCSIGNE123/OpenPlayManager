// Winner Advancement Engine — see PROJECT.md. Owns exactly one concern:
// figuring out where a completed match's winner goes next and whether a
// round/bracket is done — never bracket generation (PlayoffBracketGenerator,
// untouched by this file) and never match-operations bookkeeping (starting/
// pausing/resuming/walkovers, still owned by PlayoffEngine, which composes
// an instance of this service for the advancement-specific pieces below
// rather than duplicating them). Deliberately operates on a plain
// `{ rounds: [...] }` bracket object with zero Round-Robin- or pool-specific
// knowledge, same as PlayoffEngine — directly reusable by a future
// standalone Single Elimination tournament format.
function findBracketMatch(bracket, matchId) {
  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    const round = bracket.rounds[roundIndex];
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return { round, match, roundIndex };
  }
  return null;
}

const VALID_MATCH_STATUSES = ["pending", "inProgress", "paused", "completed"];

export class PlayoffAdvancementService {
  // The one real status-setter every transition in this file/PlayoffEngine
  // goes through, rather than each call site spreading `{ ...m, status:
  // "x" }` inline — "Ready"/"Locked" are never stored here (they're derived
  // fresh by PlayoffEngine.getMatchState from teamA/teamB presence), so the
  // only stored values this ever writes are the four real match.status
  // values a bracket match can hold.
  updateMatchStatus(match, status) {
    if (!VALID_MATCH_STATUSES.includes(status)) {
      throw new Error(`Invalid match status: ${status}`);
    }
    return { ...match, status, lastUpdatedAt: Date.now() };
  }

  // round: BracketRound (see PlayoffBracketGenerator)
  // returns: boolean — every match in the round has a recorded result
  isRoundComplete(round) {
    return round.matches.length > 0 && round.matches.every((m) => m.status === "completed");
  }

  // The earliest round that still has an unfinished (non-completed) match
  // — "Current Round" for the Bracket Progress display. Falls back to the
  // final round once every round is done (there's nothing left to call
  // "current" otherwise), so this always returns a real round rather than
  // null/undefined.
  getCurrentRound(bracket) {
    return bracket.rounds.find((r) => r.matches.some((m) => m.status !== "completed")) ?? bracket.rounds[bracket.rounds.length - 1];
  }

  // The actual write: places `winnerTeam` into `slot` ("teamA"|"teamB") of
  // the match numbered `nextMatchNumber` within round index `nextRoundIndex`
  // — the one primitive advanceWinner() delegates to below. Pulled out as
  // its own named method per the spec's architecture list; advanceWinner
  // still owns figuring out WHERE a winner goes (the matchNumber ->
  // ceil(matchNumber/2) mapping), this just performs the write once that's
  // decided.
  populateNextMatch(bracket, nextRoundIndex, nextMatchNumber, slot, winnerTeam) {
    return bracket.rounds.map((r, i) => {
      if (i !== nextRoundIndex) return r;
      const matches = r.matches.map((m) => (m.matchNumber === nextMatchNumber ? { ...m, [slot]: winnerTeam } : m));
      return { ...r, matches };
    });
  }

  // Determines WHERE a winner goes and hands the actual write off to
  // populateNextMatch(). matchNumber -> ceil(matchNumber/2) is a standard,
  // generic bracket-tree mapping (odd matchNumber -> teamA, even ->
  // teamB) — not a seed-optimal placement (Advanced Seeding is out of
  // scope), just structurally consistent adjacency that preserves the
  // bracket shape PlayoffBracketGenerator already built. The next match
  // "unlocks" automatically the moment both its teamA and teamB are
  // non-null — there's no separate locked/unlocked flag to maintain in
  // sync with it (see PlayoffEngine.getMatchState).
  // bracket: Bracket; matchId: the just-completed match's id
  // winnerTeam: SeededTeam (the winning side's full team object, not just
  // an id — so the next round's slot has a real label/seed to display)
  // returns: BracketRound[] — bracket.rounds with the winner advanced in
  advanceWinner(bracket, matchId, winnerTeam) {
    const found = findBracketMatch(bracket, matchId);
    if (!found) return bracket.rounds;
    const nextRoundIndex = found.roundIndex + 1;
    if (nextRoundIndex >= bracket.rounds.length) return bracket.rounds; // championship match — no next round to advance into

    const nextMatchNumber = Math.ceil(found.match.matchNumber / 2);
    const slot = found.match.matchNumber % 2 === 1 ? "teamA" : "teamB";
    return this.populateNextMatch(bracket, nextRoundIndex, nextMatchNumber, slot, winnerTeam);
  }

  // Winner Advancement Engine — see PROJECT.md. Every rule the spec's
  // "Validation" section names, as one real, callable, testable method
  // returning every failing check at once — the same `{valid, errors[]}`
  // shape validateBracket() (PlayoffBracketGenerator) already established
  // for the equivalent ask on bracket generation. Deliberately NOT wired
  // into PlayoffEngine.updateBracket()'s own internals for the same reason
  // validateBracket() wasn't wired into generateBracket(): updateBracket is
  // the hot path every real score save goes through, with an already-tested
  // throw-per-rule contract callers (BracketMatchCard's localError handling)
  // depend on; this is a separate, richer check for a caller that wants the
  // full picture at once.
  validateAdvancement(bracket, matchId, result) {
    const errors = [];

    if (bracket.status === "completed") {
      errors.push("This tournament is already completed — no further edits are allowed.");
      return { valid: false, errors }; // nothing else is worth checking once this is true
    }

    const found = findBracketMatch(bracket, matchId);
    if (!found) {
      errors.push("Match not found.");
      return { valid: false, errors };
    }
    if (found.match.status === "completed") {
      errors.push("This match already has a recorded result — advancing it again would advance the same participant twice.");
    }
    if (!found.match.teamA || !found.match.teamB) {
      errors.push("Both participants must be known before this match can be advanced — it's waiting on a previous round.");
    }
    if (result && !result.winnerId) {
      errors.push("A match can't be advanced without a winner.");
    }
    if (result?.winnerId && found.match.teamA && found.match.teamB) {
      if (result.winnerId !== found.match.teamA.participantId && result.winnerId !== found.match.teamB.participantId) {
        errors.push("Winner must be one of this match's two participants.");
      }
    }

    // "No duplicate participants in the bracket" — scoped to ACTIVE (not
    // yet completed) matches only. A winner legitimately appears twice
    // across the bracket as a whole once they've advanced (their old,
    // completed match still shows them as its historical teamA/teamB, and
    // their new match now seats them too) — that's normal advancement, not
    // a duplicate. The real invariant is that a participant should never
    // be simultaneously live in two different NOT-YET-DECIDED matches at
    // once, which would mean they could theoretically win/advance from two
    // places at the same time.
    const activeSeatedIds = bracket.rounds
      .flatMap((r) => r.matches)
      .filter((m) => m.status !== "completed")
      .flatMap((m) => [m.teamA?.participantId, m.teamB?.participantId])
      .filter(Boolean);
    const duplicateActiveIds = activeSeatedIds.filter((id, i) => activeSeatedIds.indexOf(id) !== i);
    if (duplicateActiveIds.length > 0) {
      errors.push("Duplicate participants found among active bracket matches — a participant can only be live in one match at a time.");
    }

    return { valid: errors.length === 0, errors };
  }
}
