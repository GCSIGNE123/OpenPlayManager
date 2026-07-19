// Tournament Reports & Export Center — see PROJECT.md's Tournament Reports
// section. A single concrete class, not a Strategy-pattern hierarchy — same
// precedent as CourtAssignmentService/TournamentRulesService: the spec asks
// for one reusable service, not per-format implementations. Every method
// here is pure derivation (mirrors TournamentSettings.deriveSettingsView's
// "read-view, not a data migration" pattern) — nothing new is persisted,
// every report is recomputed fresh from tournament.pools/bracket/courts on
// every call, exactly like Standings/Qualification/the Court Board already
// are. That's also what makes this format-agnostic for the spec's listed
// future formats: it walks tournament.pools (if present) and
// tournament.bracket (if present), the same generic traversal
// CourtAssignmentService.collectMatches established — a future standalone
// Single/Double Elimination format reuses the same bracket-shaped record
// PlayoffEngine already works with, so this needs no changes for those.
import { RoundRobinStandingsService } from "./RoundRobinStandingsService.js";
import { PoolQualificationService } from "./PoolQualificationService.js";
import { getTournamentProgress, getPoolProgress } from "../lib/tournamentModel.js";

const standingsService = new RoundRobinStandingsService();
const qualificationService = new PoolQualificationService();

// Every real (non-bye) match across every pool, plus the bracket if one
// exists — the same shape CourtAssignmentService.collectMatches produces,
// duplicated locally rather than imported since that function isn't
// exported (it's a private detail of court assignment, not a public
// traversal utility) and reports need a slightly different label
// ("Pool Play" / round name) than court assignment's sourceLabel.
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

function podiumFor(tournament) {
  // A bracket champion (once playoffs exist and finish) supersedes a
  // single pool's own champion — the bracket is the tournament-wide result
  // once playoffs are in play. With no bracket, a single-pool tournament's
  // own podium (stamped by RoundRobinCompletionService) is the tournament
  // result; a multi-pool tournament with no bracket has no single
  // tournament-wide champion (pools are independent — see
  // TournamentDashboardView's PoolPodium), so all three read "—".
  if (tournament.bracket?.status === "completed") {
    return {
      champion: tournament.bracket.champion?.label ?? null,
      runnerUp: tournament.bracket.runnerUp?.label ?? null,
      thirdPlace: null, // no bronze-medal match exists yet — see FEATURES.md's Bronze Match backlog item
    };
  }
  if (tournament.pools.length === 1) {
    const pool = tournament.pools[0];
    return {
      champion: pool.champion?.label ?? null,
      runnerUp: pool.runnerUp?.label ?? null,
      thirdPlace: pool.thirdPlace?.label ?? null,
    };
  }
  return { champion: null, runnerUp: null, thirdPlace: null };
}

export class TournamentReportService {
  generateTournamentSummary(tournament) {
    const progress = getTournamentProgress(tournament);
    const podium = podiumFor(tournament);
    return {
      title: "Tournament Summary",
      columns: ["Field", "Value"],
      rows: [
        ["Tournament Name", tournament.name],
        ["Date", new Date(tournament.createdAt).toLocaleDateString()],
        ["Number of Players / Teams", String(tournament.pools.reduce((sum, p) => sum + p.entrants.length, 0))],
        ["Number of Pools", String(tournament.pools.length)],
        ["Total Matches", String(progress.total)],
        ["Matches Completed", String(progress.completed)],
        ["Champion", podium.champion ?? "—"],
        ["Runner-up", podium.runnerUp ?? "—"],
        ["Third Place", podium.thirdPlace ?? "—"],
      ],
    };
  }

  // Flattens every pool's standings into one table, prefixed with the pool
  // label so a multi-pool tournament's report stays readable as a single
  // printable list rather than needing per-pool pagination.
  generateStandingsReport(tournament) {
    const rows = tournament.pools.flatMap((pool) => {
      const standings = standingsService.updateAfterMatch(pool);
      return standings.map((row) => [
        String(row.rank),
        row.label,
        String(row.wins),
        String(row.losses),
        `${Math.round(row.winPct * 100)}%`,
        row.pointDiff > 0 ? `+${row.pointDiff}` : String(row.pointDiff),
        tournament.pools.length > 1 ? pool.label : undefined,
      ].filter((v) => v !== undefined));
    });
    const columns = ["Rank", "Team / Player", "Wins", "Losses", "Win %", "Point Differential"];
    if (tournament.pools.length > 1) columns.push("Pool");
    return { title: "Standings Report", columns, rows };
  }

  generateMatchReport(tournament) {
    const rows = collectAllMatches(tournament)
      .filter((entry) => entry.match.status === "completed")
      .map(({ match, sourceLabel }) => [
        sourceLabel,
        match.court != null ? String(match.court) : "—",
        `${match.teamA?.label ?? "—"} vs ${match.teamB?.label ?? "—"}`,
        `${match.score?.teamA ?? "—"}–${match.score?.teamB ?? "—"}`,
        match.winner === match.teamA?.id ? match.teamA.label : match.winner === match.teamB?.id ? match.teamB.label : "—",
        match.completedAt ? new Date(match.completedAt).toLocaleString() : "—",
      ]);
    return {
      title: "Match Results Report",
      columns: ["Round", "Court", "Teams", "Score", "Winner", "Completion Time"],
      rows,
    };
  }

  // Court usage is derived from the same "walk every match" traversal every
  // other report uses, not a separately tracked stat — same "derived, not
  // persisted" precedent CourtAssignmentService's occupancy already set.
  // Average match duration has no start-time data to compute it from (only
  // completedAt is tracked, not a match's actual start timestamp), so it's
  // an explicit placeholder per the spec's own "(placeholder if not yet
  // tracked)" allowance.
  generateCourtUtilizationReport(tournament) {
    const completed = collectAllMatches(tournament)
      .map((e) => e.match)
      .filter((m) => m.status === "completed" && m.court != null);
    const totalCompleted = completed.length;
    const rows = (tournament.courts || []).map((court) => {
      const count = completed.filter((m) => m.court === court.number).length;
      const pct = totalCompleted === 0 ? 0 : Math.round((count / totalCompleted) * 100);
      return [court.name, String(count), `${pct}%`, "—"];
    });
    return {
      title: "Court Utilization Report",
      columns: ["Court", "Matches Played", "Usage %", "Avg Match Duration"],
      rows,
    };
  }

  // Per-pool participants/standings/qualified — qualified teams come from
  // PoolQualificationService, which itself only returns real data once
  // every pool has finished (see NOT_READY there); before that, "Qualified"
  // reads "—" for every row rather than a misleading provisional pick.
  generatePoolReport(tournament) {
    const qualification = qualificationService.determineQualifiers(tournament, {
      getStandings: (t, poolId) => standingsService.updateAfterMatch(t.pools.find((p) => p.id === poolId)),
    });
    return tournament.pools.map((pool) => {
      const standings = standingsService.updateAfterMatch(pool);
      const qualifiedIds = new Set(
        (qualification.pools.find((p) => p.poolId === pool.id)?.rows || [])
          .filter((r) => r.qualified)
          .map((r) => r.participantId)
      );
      return {
        title: `Pool Report — ${pool.label}`,
        poolLabel: pool.label,
        columns: ["Rank", "Team / Player", "Wins", "Losses", "Win %", "Qualified"],
        rows: standings.map((row) => [
          String(row.rank),
          row.label,
          String(row.wins),
          String(row.losses),
          `${Math.round(row.winPct * 100)}%`,
          qualifiedIds.has(row.participantId) ? "Yes" : "—",
        ]),
      };
    });
  }
}
