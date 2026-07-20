// Plays a generated elimination bracket through to a champion — starting
// matches, recording results, and advancing winners into the next round.
// Deliberately operates on a plain `{ rounds: [...] }` bracket object with
// zero Round-Robin- or pool-specific knowledge (it never imports anything
// from tournamentModel.js's pool machinery), which is what makes it
// directly reusable by a future standalone Single Elimination tournament
// format — that format's bracket, whatever produces it, only needs to have
// this same rounds/matches shape for PlayoffEngine to work unchanged.
//
// PlayoffBracketGenerator builds the bracket once, up front, with
// round 1 fully seeded and every later round's matches holding empty
// (null) teamA/teamB slots. This file owns everything that happens to it
// after that. A next-round match's slots stay null until
// advanceWinner() fills them in — that null-until-advanced state is itself
// what "the next round is locked" means; there's no separate flag to
// maintain in sync with it.
import { computeRoundStatus } from "../lib/tournamentModel.js";
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

export class PlayoffEngine {
  // Winner Advancement Engine — see PROJECT.md. The four match states the
  // spec names, computed fresh from existing fields every call (no new
  // persisted field — same "derived, not stored" precedent every other
  // live-status calculation in this app already follows):
  //   locked — teamA and/or teamB still null, waiting on a previous round
  //   ready — both participants known, match.status is still "pending"
  //   inProgress / completed — match.status, unchanged
  // Distinguishing locked from ready is what's genuinely new here — before
  // this task both read as the same "pending" status, so the UI could only
  // infer "locked" itself by re-checking teamA/teamB, ad hoc, in the
  // component. Centralizing it here is what "the mapping should come from
  // the bracket structure rather than being hardcoded into the UI" means
  // in practice.
  getMatchState(match) {
    if (!match.teamA || !match.teamB) return "locked";
    if (match.status === "pending") return "ready";
    return match.status; // "inProgress" | "paused" | "completed"
  }

  // Delegates to PlayoffAdvancementService — see that file. Kept as a
  // same-named method on PlayoffEngine so every existing caller
  // (isTournamentComplete below, BracketViewModel, TournamentBracketView)
  // keeps working unchanged.
  isRoundComplete(round) {
    return advancementService.isRoundComplete(round);
  }

  getCurrentRound(bracket) {
    return advancementService.getCurrentRound(bracket);
  }

  // Live Playoff Bracket & Match Operations — see PROJECT.md. Every match
  // across every round currently "inProgress" or "paused" — what the Live
  // Tournament Dashboard's "Active Matches" count and list come from.
  getActiveMatches(bracket) {
    return bracket.rounds.flatMap((r) => r.matches.filter((m) => m.status === "inProgress" || m.status === "paused"));
  }

  // Every match in getCurrentRound()'s round — "Current Round" matches for
  // the same dashboard, without a caller needing to call getCurrentRound()
  // and then re-walk its .matches itself.
  getCurrentRoundMatches(bracket) {
    return this.getCurrentRound(bracket).matches;
  }

  // bracket: Bracket
  // returns: boolean — the championship match (the bracket's last round)
  // has a recorded result, meaning a champion is decided
  isTournamentComplete(bracket) {
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    return this.isRoundComplete(finalRound);
  }

  // Delegates to PlayoffAdvancementService — see that file for the actual
  // logic and PROJECT.md for the Winner Advancement Engine writeup.
  populateNextMatch(bracket, nextRoundIndex, nextMatchNumber, slot, winnerTeam) {
    return advancementService.populateNextMatch(bracket, nextRoundIndex, nextMatchNumber, slot, winnerTeam);
  }

  advanceWinner(bracket, matchId, winnerTeam) {
    return advancementService.advanceWinner(bracket, matchId, winnerTeam);
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
      const matches = r.matches.map((m) =>
        m.id === matchId ? { ...advancementService.updateMatchStatus(m, "inProgress"), startedAt: Date.now() } : m
      );
      return { ...r, matches, status: computeRoundStatus(matches) };
    });
    return { ...bracket, rounds };
  }

  // Live Playoff Bracket & Match Operations — see PROJECT.md. Pause/Resume
  // only ever move a match between "inProgress" and "paused" — a genuinely
  // new status this task adds (additive; pool matches never carry it, see
  // tournamentModel.js's computeRoundStatus comment). Both reject a
  // completed bracket for the same reason startMatch/updateBracket already
  // do, and are no-ops (return the bracket unchanged) if the match isn't
  // currently in the state they expect — pausing an already-paused match,
  // or resuming one that was never paused, shouldn't be an error, just
  // nothing to do.
  pauseMatch(bracket, matchId) {
    if (bracket.status === "completed") {
      throw new Error("This bracket is already completed — matches can't be changed.");
    }
    const found = findBracketMatch(bracket, matchId);
    if (!found || found.match.status !== "inProgress") return bracket;
    const rounds = bracket.rounds.map((r, i) => {
      if (i !== found.roundIndex) return r;
      const matches = r.matches.map((m) => (m.id === matchId ? advancementService.updateMatchStatus(m, "paused") : m));
      return { ...r, matches, status: computeRoundStatus(matches) };
    });
    return { ...bracket, rounds };
  }

  resumeMatch(bracket, matchId) {
    if (bracket.status === "completed") {
      throw new Error("This bracket is already completed — matches can't be changed.");
    }
    const found = findBracketMatch(bracket, matchId);
    if (!found || found.match.status !== "paused") return bracket;
    const rounds = bracket.rounds.map((r, i) => {
      if (i !== found.roundIndex) return r;
      const matches = r.matches.map((m) => (m.id === matchId ? advancementService.updateMatchStatus(m, "inProgress") : m));
      return { ...r, matches, status: computeRoundStatus(matches) };
    });
    return { ...bracket, rounds };
  }

  // "Mark a walkover (WO)" — completes a match without a real score: the
  // named winner advances exactly like a normal completed match (same
  // advanceWinner/tournament-completion path below, via updateBracket),
  // but score stays { teamA: null, teamB: null } and `walkover: true`
  // marks it as decided by forfeit rather than play, so the UI/history can
  // show that distinctly instead of implying an 0-0 or fabricated score.
  // Reuses updateBracket entirely rather than duplicating its winner-
  // advancement/tournament-completion logic — the only difference is what
  // "result" it's called with.
  recordWalkover(bracket, matchId, winnerId) {
    const found = findBracketMatch(bracket, matchId);
    if (!found) throw new Error("Match not found.");
    if (winnerId !== found.match.teamA?.participantId && winnerId !== found.match.teamB?.participantId) {
      throw new Error("Walkover winner must be one of this match's two participants.");
    }
    const updated = this.updateBracket(bracket, matchId, { scoreA: 0, scoreB: 0, winnerId });
    return {
      ...updated,
      rounds: updated.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => (m.id === matchId ? { ...m, score: { teamA: null, teamB: null }, walkover: true, lastUpdatedAt: Date.now() } : m)),
      })),
    };
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
      ...advancementService.updateMatchStatus(found.match, "completed"),
      score: { teamA: numA, teamB: numB },
      winner: winnerId,
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

  // Winner Advancement Engine — see PROJECT.md. Every rule the spec's
  // "Validation" section names, as one real, callable, testable method
  // returning every failing check at once — the same `{valid, errors[]}`
  // shape validateBracket() (PlayoffBracketGenerator) already
  // established for the equivalent ask on bracket generation.
  // Deliberately NOT wired into updateBracket()'s own internals for the
  // same reason validateBracket() wasn't wired into generateBracket():
  // updateBracket is the hot path every real score save goes through, with
  // an already-tested throw-per-rule contract callers (BracketMatchCard's
  // localError handling) depend on; this is a separate, richer check for a
  // caller that wants the full picture at once.
  validateAdvancement(bracket, matchId, result) {
    return advancementService.validateAdvancement(bracket, matchId, result);
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
