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
import { ChampionshipSeriesService } from "./ChampionshipSeriesService.js";

const advancementService = new PlayoffAdvancementService();
const seriesService = new ChampionshipSeriesService();

// Bronze Medal Match — see PROJECT.md. bracket.bronzeMatch is a sibling
// field, not a round inside bracket.rounds (see PlayoffBracketGenerator's
// header comment for why), so this also checks it as a fallback. isBronze
// is what writeBackMatch below branches on to know where to write updates
// back — roundIndex stays null for the bronze match, since it has no round.
function findBracketMatch(bracket, matchId) {
  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    const round = bracket.rounds[roundIndex];
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return { round, match, roundIndex, isBronze: false };
  }
  if (bracket.bronzeMatch?.id === matchId) {
    return { round: null, match: bracket.bronzeMatch, roundIndex: null, isBronze: true };
  }
  return null;
}

// The one place every status/score write-back happens, for both a normal
// round match and the bronze match — replaces three near-identical
// `rounds.map(...)` blocks that startMatch/pauseMatch/resumeMatch each used
// to inline, and is what makes those three methods (and updateBracket)
// work on the bronze match with no further special-casing: `found` (from
// findBracketMatch above) already knows where `updatedMatch` belongs.
function writeBackMatch(bracket, found, updatedMatch) {
  if (found.isBronze) {
    return { ...bracket, bronzeMatch: updatedMatch };
  }
  const rounds = bracket.rounds.map((r, i) => {
    if (i !== found.roundIndex) return r;
    const matches = r.matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
    return { ...r, matches, status: computeRoundStatus(matches) };
  });
  return { ...bracket, rounds };
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
  // Includes the bronze match (not part of `rounds`) when it's live too.
  getActiveMatches(bracket) {
    const active = bracket.rounds.flatMap((r) => r.matches.filter((m) => m.status === "inProgress" || m.status === "paused"));
    if (bracket.bronzeMatch && (bracket.bronzeMatch.status === "inProgress" || bracket.bronzeMatch.status === "paused")) {
      active.push(bracket.bronzeMatch);
    }
    return active;
  }

  // Every match in getCurrentRound()'s round — "Current Round" matches for
  // the same dashboard, without a caller needing to call getCurrentRound()
  // and then re-walk its .matches itself.
  getCurrentRoundMatches(bracket) {
    return this.getCurrentRound(bracket).matches;
  }

  // bracket: Bracket
  // returns: boolean — the championship match (the bracket's last round)
  // has a recorded result AND, if a Bronze Medal Match exists, it's also
  // completed. Tournament completion "waits for both the Final and Bronze
  // Match when enabled" — see PROJECT.md's Bronze Medal Match section.
  isTournamentComplete(bracket) {
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    if (!this.isRoundComplete(finalRound)) return false;
    if (bracket.bronzeMatch) return bracket.bronzeMatch.status === "completed";
    return true;
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
    const updatedMatch = { ...advancementService.updateMatchStatus(found.match, "inProgress"), startedAt: Date.now() };
    return writeBackMatch(bracket, found, updatedMatch);
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
    return writeBackMatch(bracket, found, advancementService.updateMatchStatus(found.match, "paused"));
  }

  resumeMatch(bracket, matchId) {
    if (bracket.status === "completed") {
      throw new Error("This bracket is already completed — matches can't be changed.");
    }
    const found = findBracketMatch(bracket, matchId);
    if (!found || found.match.status !== "paused") return bracket;
    return writeBackMatch(bracket, found, advancementService.updateMatchStatus(found.match, "inProgress"));
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
  recordWalkover(bracket, matchId, winnerId, options) {
    const found = findBracketMatch(bracket, matchId);
    if (!found) throw new Error("Match not found.");
    if (winnerId !== found.match.teamA?.participantId && winnerId !== found.match.teamB?.participantId) {
      throw new Error("Walkover winner must be one of this match's two participants.");
    }
    const updated = this.updateBracket(bracket, matchId, { scoreA: 0, scoreB: 0, winnerId }, options);
    const overlay = { score: { teamA: null, teamB: null }, walkover: true, lastUpdatedAt: Date.now() };
    if (found.isBronze) {
      return { ...updated, bronzeMatch: { ...updated.bronzeMatch, ...overlay } };
    }
    return {
      ...updated,
      rounds: updated.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => (m.id === matchId ? { ...m, ...overlay } : m)),
      })),
    };
  }

  // result: { scoreA, scoreB, winnerId }
  // returns: the updated Bracket (never mutates the one passed in). Writes
  // the result, advances the winner into the next round, rolls up round
  // statuses, and — the moment isTournamentComplete() becomes true —
  // stamps champion/runnerUp/completedAt and locks the bracket
  // (status: "completed", rejecting further edits from that point on).
  // options.seriesFormat: "bestOf3" | undefined — see PROJECT.md's Best-of-3
  // Finals section. Passed straight from tournament.matchScoringRules.
  // matchFormat by the caller (lib/tournament.js), since PlayoffEngine only
  // ever sees a bracket, never the tournament itself.
  updateBracket(bracket, matchId, result, options = {}) {
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
    let next = writeBackMatch(bracket, found, updatedMatch);

    if (found.isBronze) {
      // Bronze Medal Match completion — see PROJECT.md. Sets 3rd/4th place,
      // never champion/runnerUp, and never advances anyone anywhere (this
      // IS the last match either of these two participants play).
      next = { ...next, thirdPlace: winnerTeam, fourthPlace: loserTeam };
    } else {
      next = { ...next, rounds: this.advanceWinner(next, matchId, winnerTeam) };

      // The just-completed match's own SEMIFINAL round (the one immediately
      // before the Final, whatever the overall bracket size) is where a
      // Bronze Medal Match's two participants come from — see
      // PlayoffAdvancementService.populateBronzeMatch. A no-op bracket-shape
      // check when bronzeMatch doesn't exist (disabled, or no semifinal to
      // draw from at all).
      if (next.bronzeMatch && found.roundIndex === bracket.rounds.length - 2) {
        next = { ...next, bronzeMatch: advancementService.populateBronzeMatch(next.bronzeMatch, found.match.matchNumber, loserTeam) };
      }

      // Best-of-3 Finals — see PROJECT.md. Runs after EVERY non-bronze
      // completion, not just ones inside the Final round: the trigger for
      // seeding Game 2 is a SEMIFINAL completing (which is what makes
      // advanceWinner populate Game 1's teams above), not the Final round's
      // own match completing. startSeries()/completeGame() are both cheap,
      // idempotent no-ops whenever their condition isn't met, so calling
      // them unconditionally here is safe and correct — no isFinalRound
      // gate needed. advanceWinner/populateNextMatch are never touched by
      // any of this.
      if (options.seriesFormat === "bestOf3") {
        const finalRoundIndex = next.rounds.length - 1;
        let finalMatches = next.rounds[finalRoundIndex].matches;
        finalMatches = seriesService.startSeries(finalMatches);
        finalMatches = seriesService.completeGame(finalMatches);
        next = {
          ...next,
          rounds: next.rounds.map((r, i) => (i === finalRoundIndex ? { ...r, matches: finalMatches, status: computeRoundStatus(finalMatches) } : r)),
        };
        if (seriesService.isSeriesComplete(finalMatches)) {
          const champion = seriesService.determineChampion(finalMatches);
          const reference = finalMatches[0];
          next = { ...next, champion, runnerUp: champion.participantId === reference.teamA.participantId ? reference.teamB : reference.teamA };
        }
      } else if (found.roundIndex === bracket.rounds.length - 1) {
        // Single-match Final — unchanged. Champion/runner-up decided the
        // moment the Final completes, independent of whether the Bronze
        // Match (if enabled) has finished yet, so results appear
        // immediately rather than waiting on an unrelated match. Locking
        // the whole bracket (below) is what waits for both.
        next = { ...next, champion: winnerTeam, runnerUp: loserTeam };
      }
    }

    if (this.isTournamentComplete(next)) {
      next = { ...next, status: "completed", completedAt: Date.now() };
    } else {
      const anyStartedOrDone =
        next.rounds.some((r) => r.matches.some((m) => m.status === "inProgress" || m.status === "completed")) ||
        (next.bronzeMatch && (next.bronzeMatch.status === "inProgress" || next.bronzeMatch.status === "completed"));
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
    const next = { ...bracket, status: "running", completedAt: null, champion: null, runnerUp: null };
    if (bracket.bronzeMatch) {
      next.thirdPlace = null;
      next.fourthPlace = null;
    }
    return next;
  }
}
