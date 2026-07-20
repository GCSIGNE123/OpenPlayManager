// Best-of-3 Finals — see PROJECT.md. Owns exactly one concern: turning the
// Championship round's single match into a variable-length series (2 or 3
// games) and deciding when it's won. Deliberately does NOT touch
// PlayoffAdvancementService's advanceWinner/populateNextMatch — a series
// rematch needs no advancement (both games share the same two participants
// from the start), so this only ever clones the Final round's own matches,
// never reaches into feeder rounds. PlayoffEngine.updateBracket calls this
// after every non-bronze match completion when the tournament is
// configured for Best-of-3; every method here is a cheap, idempotent
// no-op when its condition isn't met, so calling it unconditionally is
// safe and correct.
import { uid } from "../lib/random.js";

// A new game with the exact same participants as `reference` — used for
// both Game 2 (cloned from Game 1 the moment its teams are known) and
// Game 3 (cloned from Game 1 or 2 once the series is tied 1-1). Never
// copies score/status/court — every clone starts fresh and pending.
function cloneAsNextGame(reference, matchNumber) {
  return {
    id: uid(),
    round: reference.round,
    matchNumber,
    court: null,
    teamA: reference.teamA,
    teamB: reference.teamB,
    isBye: false,
    status: "pending",
    winner: null,
    score: { teamA: null, teamB: null },
    completedAt: null,
  };
}

export class ChampionshipSeriesService {
  // games: the Championship round's own matches (BracketMatch[]) — every
  // game in a series shares the same two participants, so participantId is
  // enough to tally wins without re-resolving teamA/teamB each time.
  // returns: { [participantId]: winCount }
  getSeriesScore(games) {
    const score = {};
    for (const g of games) {
      if (g.status !== "completed" || g.winner == null) continue;
      score[g.winner] = (score[g.winner] || 0) + 1;
    }
    return score;
  }

  // "Champion is determined by: first participant to win two games."
  isSeriesComplete(games) {
    return Object.values(this.getSeriesScore(games)).some((wins) => wins >= 2);
  }

  // SeededTeam | null — teamA/teamB are identical across every game in the
  // series, so any game (games[0]) is a valid reference for resolving which
  // side the two-win participantId corresponds to.
  determineChampion(games) {
    const score = this.getSeriesScore(games);
    const winnerId = Object.keys(score).find((id) => score[id] >= 2);
    if (!winnerId) return null;
    const reference = games[0];
    return winnerId === reference.teamA?.participantId ? reference.teamA : reference.teamB;
  }

  // Seeds Game 2 the moment Game 1's participants are known — whether from
  // PlayoffBracketGenerator directly (a 2-team bracket, where the Final IS
  // round 1 and already has real teams at generation time) or from
  // PlayoffAdvancementService.advanceWinner once both semifinals finish.
  // No-op once Game 2 already exists, or while Game 1 is still "TBD."
  startSeries(games) {
    if (games.length > 1) return games;
    const game1 = games[0];
    if (!game1.teamA || !game1.teamB) return games;
    return [game1, cloneAsNextGame(game1, 2)];
  }

  // Called after any game in the series completes. Appends Game 3 only
  // when exactly Games 1 and 2 exist, both are completed, and the series
  // is tied 1-1 — "Game 3 should only be played if the series is tied
  // 1-1." No-op in every other case: series not there yet, already has
  // Game 3, or already decided 2-0.
  completeGame(games) {
    if (games.length !== 2) return games;
    const [game1, game2] = games;
    if (game1.status !== "completed" || game2.status !== "completed") return games;
    const score = this.getSeriesScore(games);
    const tied = Object.keys(score).length === 2 && Object.values(score).every((wins) => wins === 1);
    if (!tied) return games;
    return [...games, cloneAsNextGame(game1, 3)];
  }
}
