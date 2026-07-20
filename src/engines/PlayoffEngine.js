// Plays a generated elimination bracket through to a champion — starting
// matches, recording results, and advancing winners into the next round.
// Deliberately operates on a plain `{ rounds: [...] }` bracket object with
// zero Round-Robin- or pool-specific knowledge (it never imports anything
// from tournamentModel.js's pool machinery), which is what makes it
// directly reusable by a future standalone Single Elimination tournament
// format — that format's bracket, whatever produces it, only needs to have
// this same rounds/matches shape for PlayoffEngine to work unchanged.
//
// SingleEliminationBracketGenerator builds the bracket once, up front, with
// round 1 fully seeded and every later round's matches holding empty
// (null) teamA/teamB slots. This file owns everything that happens to it
// after that. A next-round match's slots stay null until
// advanceWinner() fills them in — that null-until-advanced state is itself
// what "the next round is locked" means; there's no separate flag to
// maintain in sync with it.
import { computeRoundStatus } from "../lib/tournamentModel.js";

function findBracketMatch(bracket, matchId) {
  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    const round = bracket.rounds[roundIndex];
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return { round, match, roundIndex };
  }
  return null;
}

export class PlayoffEngine {
  // round: BracketRound (see SingleEliminationBracketGenerator)
  // returns: boolean — every match in the round has a recorded result
  isRoundComplete(round) {
    return round.matches.length > 0 && round.matches.every((m) => m.status === "completed");
  }

  // bracket: Bracket
  // returns: boolean — the championship match (the bracket's last round)
  // has a recorded result, meaning a champion is decided
  isTournamentComplete(bracket) {
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    return this.isRoundComplete(finalRound);
  }

  // Writes `winnerTeam` into the correct slot of the next round's match.
  // matchNumber -> ceil(matchNumber/2) is a standard, generic bracket-tree
  // mapping (odd matchNumber -> teamA, even -> teamB) — not a seed-optimal
  // placement (Advanced Seeding is out of scope), just structurally
  // consistent adjacency that preserves the bracket shape
  // SingleEliminationBracketGenerator already built.
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
    return bracket.rounds.map((r, i) => {
      if (i !== nextRoundIndex) return r;
      const matches = r.matches.map((m) => (m.matchNumber === nextMatchNumber ? { ...m, [slot]: winnerTeam } : m));
      return { ...r, matches };
    });
  }

  // "Start Match": pending -> inProgress. Rejects a bracket that's already
  // completed, and rejects a match whose participants aren't both known
  // yet — "prevent matches from starting before participants are known."
  startMatch(bracket, matchId) {
    if (bracket.status === "completed") {
      throw new Error("This bracket is already completed — matches can't be changed.");
    }
    const found = findBracketMatch(bracket, matchId);
    if (!found) return bracket;
    if (!found.match.teamA || !found.match.teamB) {
      throw new Error("Both teams must be known before this match can start — it's waiting on a previous round.");
    }
    const rounds = bracket.rounds.map((r, i) => {
      if (i !== found.roundIndex) return r;
      const matches = r.matches.map((m) => (m.id === matchId ? { ...m, status: "inProgress", startedAt: Date.now() } : m));
      return { ...r, matches, status: computeRoundStatus(matches) };
    });
    return { ...bracket, rounds };
  }

  // result: { scoreA, scoreB, winnerId }
  // returns: the updated Bracket (never mutates the one passed in). Writes
  // the result, advances the winner into the next round, rolls up round
  // statuses, and — the moment isTournamentComplete() becomes true —
  // stamps champion/runnerUp/completedAt and locks the bracket
  // (status: "completed", rejecting further edits from that point on).
  updateBracket(bracket, matchId, result) {
    if (bracket.status === "completed") {
      throw new Error("This bracket is already completed — results can't be edited.");
    }
    const found = findBracketMatch(bracket, matchId);
    if (!found) throw new Error("Match not found.");
    if (!found.match.teamA || !found.match.teamB) {
      throw new Error("Both teams must be known before a result can be recorded — this match is waiting on a previous round.");
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
    if (winnerId !== found.match.teamA.participantId && winnerId !== found.match.teamB.participantId) {
      throw new Error("Winner must be one of this match's two teams.");
    }

    const winnerTeam = winnerId === found.match.teamA.participantId ? found.match.teamA : found.match.teamB;
    const loserTeam = winnerTeam === found.match.teamA ? found.match.teamB : found.match.teamA;

    const updatedMatch = {
      ...found.match,
      score: { teamA: numA, teamB: numB },
      winner: winnerId,
      status: "completed",
      completedAt: Date.now(),
    };
    let rounds = bracket.rounds.map((r, i) => {
      if (i !== found.roundIndex) return r;
      const matches = r.matches.map((m) => (m.id === matchId ? updatedMatch : m));
      return { ...r, matches, status: computeRoundStatus(matches) };
    });

    const advancedBracket = { ...bracket, rounds };
    rounds = this.advanceWinner(advancedBracket, matchId, winnerTeam);

    let next = { ...bracket, rounds };
    if (this.isTournamentComplete(next)) {
      next = { ...next, status: "completed", completedAt: Date.now(), champion: winnerTeam, runnerUp: loserTeam };
    } else {
      const anyStartedOrDone = rounds.some((r) => r.matches.some((m) => m.status === "inProgress" || m.status === "completed"));
      next = { ...next, status: anyStartedOrDone ? "running" : "ready" };
    }
    return next;
  }

  // Round Robin Playoff Engine — see PROJECT.md. Unlocks a completed
  // bracket for correction: clears the "completed" lock plus the
  // champion/runnerUp/completedAt stamp updateBracket sets, and rolls
  // status back to whatever the matches themselves currently imply
  // ("running", since the championship match still shows completed until
  // its result is re-saved). Deliberately narrow: this makes every match's
  // result editable again (updateBracket/startMatch only ever gate on
  // bracket.status, never on an individual match's own status), but does
  // NOT retroactively re-cascade an earlier round's corrected winner
  // through already-recorded later-round results — advanceWinner only
  // ever fills a next match's slot once, so if that next round already has
  // its own recorded result, editing the earlier feeder match won't rerun
  // it. Correcting an early round after later rounds were already played
  // is a real limitation, surfaced in the UI rather than silently
  // papered over with cascade-repair logic this task doesn't ask for.
  reopenBracket(bracket) {
    if (bracket.status !== "completed") return bracket;
    return { ...bracket, status: "running", completedAt: null, champion: null, runnerUp: null };
  }
}
