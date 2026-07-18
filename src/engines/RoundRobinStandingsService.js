// Round Robin's TournamentStandingsService implementation — see
// TournamentStandingsService.js for the shared interface this conforms to.
// Standings are pure derived data: nothing here reads or writes anything
// beyond the Tournament object already in memory, and nothing new is
// persisted — a caller just recomputes on every render, which is what
// makes this "live" with zero extra plumbing (see
// TournamentDashboardView.jsx, which already holds one up-to-date copy of
// the tournament after every match save).
import { TournamentStandingsService } from "./TournamentStandingsService.js";

// Default Round Robin ranking rules, exactly as specified: Wins desc, then
// Win % desc, then Point Differential desc, then Points For desc. Exported
// on its own (not inlined into sortStandings) so a future tie-breaker
// feature can import this as a starting point, or pass an entirely
// different comparator into sortStandings without touching this file.
export function defaultRoundRobinComparator(a, b) {
  return (
    b.wins - a.wins ||
    b.winPct - a.winPct ||
    b.pointDiff - a.pointDiff ||
    b.pointsFor - a.pointsFor
  );
}

export class RoundRobinStandingsService extends TournamentStandingsService {
  // Aggregates every COMPLETED, non-bye match — a match that's merely
  // "inProgress" or "pending" hasn't happened yet and shouldn't move
  // anyone's record. Every entrant appears in the result even with zero
  // matches played (all-zero row), so the table always lists the full
  // field, not just whoever's played so far.
  calculateStandings(tournament) {
    const rows = new Map(
      tournament.entrants.map((p) => [
        p.id,
        {
          participantId: p.id,
          label: p.label,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        },
      ])
    );

    const completedMatches = tournament.rounds
      .flatMap((r) => r.matches)
      .filter((m) => !m.isBye && m.status === "completed");

    for (const match of completedMatches) {
      const a = rows.get(match.teamA.id);
      const b = rows.get(match.teamB.id);
      // a participant no longer in tournament.entrants (shouldn't happen —
      // entrants don't change after generation — but guard rather than throw
      // on a stale/foreign match id)
      if (!a || !b) continue;

      const scoreA = match.score?.teamA ?? 0;
      const scoreB = match.score?.teamB ?? 0;
      const aWon = match.winner === match.teamA.id;

      a.matchesPlayed += 1;
      b.matchesPlayed += 1;
      a.pointsFor += scoreA;
      a.pointsAgainst += scoreB;
      b.pointsFor += scoreB;
      b.pointsAgainst += scoreA;
      if (aWon) {
        a.wins += 1;
        b.losses += 1;
      } else {
        b.wins += 1;
        a.losses += 1;
      }
    }

    return [...rows.values()].map((row) => ({
      ...row,
      winPct: row.matchesPlayed === 0 ? 0 : row.wins / row.matchesPlayed,
      pointDiff: row.pointsFor - row.pointsAgainst,
    }));
  }

  // Full recompute-and-resort, not an incremental patch onto whatever
  // standings existed before this match — correctness over micro-
  // optimization. A Round Robin tournament has at most a few dozen matches,
  // so recomputing from scratch on every save is effectively instant.
  updateAfterMatch(tournament) {
    return this.sortStandings(this.calculateStandings(tournament));
  }

  sortStandings(rows, comparator = defaultRoundRobinComparator) {
    return [...rows].sort(comparator).map((row, i) => ({ ...row, rank: i + 1 }));
  }
}
