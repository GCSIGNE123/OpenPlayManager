// Player Portal — read-only tournament lookups for participants, no
// organizer access required. See PROJECT.md's Player Portal section. Pure
// derivation, same "read-view, not a data migration" precedent as
// TournamentSettings/TournamentReportService: nothing here is persisted,
// every method recomputes fresh from the `tournament` object it's given.
//
// Deliberately read-only by construction, not by a guard: this file never
// imports a single `save*`/mutate function, so there's nothing to disable —
// the same precedent TournamentDisplayView already set for Tournament
// Display Mode.
import { RoundRobinStandingsService } from "./RoundRobinStandingsService.js";
import { TOURNAMENT_FORMATS } from "../lib/constants.js";

const standingsService = new RoundRobinStandingsService();
const FORMAT_LABELS = Object.fromEntries(TOURNAMENT_FORMATS.map((f) => [f.value, f.label]));

// Same "walk tournament.pools (if present) and tournament.bracket (if
// present)" traversal CourtAssignmentService.collectMatches/
// TournamentReportService's collectAllMatches already established —
// duplicated locally rather than shared since it's a private detail of
// each consumer, not an exported traversal utility.
function collectAllMatches(tournament) {
  const matches = [];
  for (const pool of tournament.pools || []) {
    for (const round of pool.rounds) {
      for (const match of round.matches) {
        if (!match.isBye) matches.push({ match, source: "pool", sourceLabel: pool.label });
      }
    }
  }
  if (tournament.bracket) {
    for (const round of tournament.bracket.rounds) {
      for (const match of round.matches) {
        if (!match.isBye) matches.push({ match, source: "bracket", sourceLabel: round.name });
      }
    }
  }
  return matches;
}

// Player Number is a derived, non-persisted 1-based index across every pool
// entrant in pool order — there's no numbering scheme anywhere else in this
// app (no real Player Login/authentication exists yet, per this task's own
// scope), so this is the MVP stand-in: shown next to each name in search
// results, not something a player has to already know. An organizer wanting
// numbers usable ahead of time (e.g. printed on a bracket sheet) would read
// them from this same ordering.
export function listAllParticipants(tournament) {
  let n = 0;
  return (tournament.pools || []).flatMap((pool) =>
    pool.entrants.map((entrant) => ({
      participantId: entrant.id,
      playerNumber: ++n,
      label: entrant.label,
      poolId: pool.id,
      poolLabel: pool.label,
    }))
  );
}

export class PlayerPortalService {
  // query: free text. A pure number matches Player Number exactly; anything
  // else is a case-insensitive substring match against the participant's
  // name/team label. Empty query returns nobody — same "search first,
  // browse never" shape a public player-facing lookup should have, rather
  // than listing every participant in the tournament by default.
  searchParticipants(tournament, query) {
    const q = query.trim();
    if (!q) return [];
    const all = listAllParticipants(tournament);
    if (/^\d+$/.test(q)) {
      const n = Number(q);
      return all.filter((p) => p.playerNumber === n);
    }
    const lower = q.toLowerCase();
    return all.filter((p) => p.label.toLowerCase().includes(lower));
  }

  // "Current Status" mirrors TournamentDisplayView's currentStage logic
  // (no bracket yet -> pool play; bracket in progress -> active round;
  // bracket done -> champion crowned) so a player sees the same phase
  // language the TV display already uses.
  getParticipantSummary(tournament, participantId) {
    const all = listAllParticipants(tournament);
    const entry = all.find((p) => p.participantId === participantId);
    if (!entry) return null;
    const pool = tournament.pools.find((p) => p.id === entry.poolId);
    const standings = standingsService.updateAfterMatch(pool);
    const row = standings.find((r) => r.participantId === participantId);

    let status;
    if (!tournament.bracket) {
      status = tournament.status === "completed" ? "Pool Play Complete" : "Pool Play";
    } else if (tournament.bracket.status === "completed") {
      status = "Champion Crowned";
    } else {
      const activeRound = tournament.bracket.rounds.find((r) => r.matches.some((m) => m.status !== "completed"));
      status = `Playoffs — ${activeRound?.name ?? tournament.bracket.rounds[0].name}`;
    }

    return {
      participantId,
      label: entry.label,
      playerNumber: entry.playerNumber,
      tournamentName: tournament.name,
      event: `${tournament.mode === "doubles" ? "Doubles" : "Singles"} ${FORMAT_LABELS[tournament.format] ?? tournament.format}`,
      status,
      poolLabel: entry.poolLabel,
      rank: row?.rank ?? null,
    };
  }

  // Completed vs. upcoming (pending/inProgress) across pool play AND
  // playoffs — a participant's playoff matches show up here the same way
  // their pool matches do, no separate call needed.
  getParticipantMatches(tournament, participantId) {
    const involved = collectAllMatches(tournament).filter(
      (entry) => entry.match.teamA?.id === participantId || entry.match.teamB?.id === participantId
    );
    const toRow = ({ match, sourceLabel }) => {
      const isTeamA = match.teamA?.id === participantId;
      const opponent = isTeamA ? match.teamB : match.teamA;
      return {
        id: match.id,
        round: sourceLabel,
        court: match.court != null ? match.court : null,
        opponent: opponent?.label ?? "TBD",
        status: match.status,
        score: match.score?.teamA != null ? `${isTeamA ? match.score.teamA : match.score.teamB}–${isTeamA ? match.score.teamB : match.score.teamA}` : null,
        won: match.status === "completed" ? match.winner === participantId : null,
        completedAt: match.completedAt,
      };
    };
    return {
      completed: involved.filter((e) => e.match.status === "completed").map(toRow),
      upcoming: involved.filter((e) => e.match.status !== "completed").map(toRow),
    };
  }

  // Wins/Losses/Point Differential/Standing come straight from the
  // participant's pool standings row — the exact same data the organizer's
  // Standings tab and Tournament Reports' Standings Report already compute
  // via RoundRobinStandingsService, so a player's numbers can never drift
  // from what the organizer sees.
  getParticipantResults(tournament, participantId) {
    const all = listAllParticipants(tournament);
    const entry = all.find((p) => p.participantId === participantId);
    if (!entry) return null;
    const pool = tournament.pools.find((p) => p.id === entry.poolId);
    const row = standingsService.updateAfterMatch(pool).find((r) => r.participantId === participantId);
    if (!row) return null;
    return {
      wins: row.wins,
      losses: row.losses,
      pointDiff: row.pointDiff,
      standing: row.rank,
      poolSize: pool.entrants.length,
    };
  }

  // null when there's no bracket yet (pool play only) — the portal's Live
  // Bracket section only renders once this returns something. "Current
  // path" is every bracket match this participant appears in, in round
  // order; "next opponent" is read off the first of those that hasn't
  // finished yet (their name once known, "TBD" if the feeder match hasn't
  // produced a winner, or null once there's no more bracket left to play).
  getParticipantBracketPath(tournament, participantId) {
    if (!tournament.bracket) return null;
    const appearances = [];
    for (const round of tournament.bracket.rounds) {
      for (const match of round.matches) {
        if (match.teamA?.id === participantId || match.teamB?.id === participantId) {
          appearances.push({ roundName: round.name, match });
        }
      }
    }
    const nextMatch = appearances.find((a) => a.match.status !== "completed");
    let nextOpponent = null;
    if (nextMatch) {
      const isTeamA = nextMatch.match.teamA?.id === participantId;
      const opponent = isTeamA ? nextMatch.match.teamB : nextMatch.match.teamA;
      nextOpponent = opponent?.label ?? "TBD";
    }
    return {
      path: appearances.map(({ roundName, match }) => ({
        roundName,
        court: match.court,
        status: match.status,
        opponent: (match.teamA?.id === participantId ? match.teamB : match.teamA)?.label ?? "TBD",
        won: match.status === "completed" ? match.winner === participantId : null,
      })),
      nextOpponent,
      isChampion: tournament.bracket.champion?.id === participantId,
      isRunnerUp: tournament.bracket.runnerUp?.id === participantId,
    };
  }
}
