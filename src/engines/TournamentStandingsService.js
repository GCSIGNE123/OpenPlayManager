// Abstract interface every format's standings logic implements (Strategy
// pattern) — the same role TournamentEngine.js plays one level up. Kept as
// its own service rather than folded into TournamentEngine because a
// format's *ranking* rules (who's ahead of whom) are a genuinely separate
// concern from its *scheduling* rules (RoundRobinScheduler) and its *result
// recording* rules (RoundRobinEngine.updateMatchResult) — a future format
// could reuse one without the others.
//
// Every method throws by default; a subclass overrides what it actually
// implements. See RoundRobinStandingsService.js for the one real
// implementation so far.
export class TournamentStandingsService {
  // entity: Tournament or TournamentPool (see lib/tournamentModel.js) —
  // anything with `.entrants`/`.rounds`. As of Round Robin Pool Support,
  // standings are computed per pool (pools are fully independent), so
  // callers pass a TournamentPool here, not the whole Tournament.
  // returns: StandingsRow[], UNSORTED — { participantId, label, matchesPlayed,
  // wins, losses, winPct, pointsFor, pointsAgainst, pointDiff }
  calculateStandings(entity) {
    throw new Error("calculateStandings() must be implemented by a TournamentStandingsService subclass");
  }

  // entity: Tournament or TournamentPool
  // returns: StandingsRow[], SORTED (see sortStandings) with `rank` assigned
  // Convenience wrapper a caller reaches for after saving a match result —
  // "recalculate and re-rank" in one call. A full recompute rather than an
  // incremental patch (see RoundRobinStandingsService for why that's fine
  // at this scale).
  updateAfterMatch(entity) {
    throw new Error("updateAfterMatch() must be implemented by a TournamentStandingsService subclass");
  }

  // rows: StandingsRow[] (see calculateStandings)
  // comparator: optional (StandingsRow, StandingsRow) => number, defaults to
  // the format's own default ranking rules — the seam a future tie-breaker
  // feature plugs into without touching calculateStandings at all
  // returns: StandingsRow[], sorted, each with `rank` assigned (1-indexed;
  // ties share a rank as sorted, no special tie-break beyond the comparator)
  sortStandings(rows, comparator) {
    throw new Error("sortStandings() must be implemented by a TournamentStandingsService subclass");
  }
}
