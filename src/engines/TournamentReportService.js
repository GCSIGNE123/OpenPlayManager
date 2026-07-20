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
    // Bronze Medal Match — a sibling field, not a round inside
    // tournament.bracket.rounds (see PlayoffBracketGenerator's header
    // comment for why), so it needs its own explicit inclusion here.
    if (tournament.bracket.bronzeMatch) {
      matches.push({ match: tournament.bracket.bronzeMatch, source: "bracket", sourceLabel: "Bronze Medal Match" });
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
  // TournamentDashboardView's PoolPodium), so all four read "—".
  if (tournament.bracket?.status === "completed") {
    return {
      champion: tournament.bracket.champion?.label ?? null,
      runnerUp: tournament.bracket.runnerUp?.label ?? null,
      // Only real once a Bronze Medal Match exists and has been played —
      // tournament.bracket.thirdPlace/fourthPlace are null until then
      // (see PlayoffEngine.updateBracket's bronze-completion branch).
      thirdPlace: tournament.bracket.thirdPlace?.label ?? null,
      fourthPlace: tournament.bracket.fourthPlace?.label ?? null,
    };
  }
  if (tournament.pools.length === 1) {
    const pool = tournament.pools[0];
    return {
      champion: pool.champion?.label ?? null,
      runnerUp: pool.runnerUp?.label ?? null,
      thirdPlace: pool.thirdPlace?.label ?? null,
      fourthPlace: null,
    };
  }
  return { champion: null, runnerUp: null, thirdPlace: null, fourthPlace: null };
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
        // Podium order, per PROJECT.md's Bronze Medal Match section —
        // Fourth Place only ever has a real value when a Bronze Medal
        // Match was enabled and has been played; otherwise "—".
        ["🥇 Champion", podium.champion ?? "—"],
        ["🥈 Runner-up", podium.runnerUp ?? "—"],
        ["🥉 Third Place", podium.thirdPlace ?? "—"],
        ["🏅 Fourth Place", podium.fourthPlace ?? "—"],
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

  // Per-participant career line for THIS tournament, spanning both pool play
  // and (if the participant advanced) the bracket — built by reusing
  // RoundRobinStandingsService.calculateStandings() for the pool half
  // (matchesPlayed/wins/losses/pointsFor/pointsAgainst, not re-derived here)
  // then folding in every completed bracket match keyed by participantId,
  // the same id a pool entrant and its SeededTeam share. Final Placement
  // reads off the same podiumFor() every other report already uses, so it
  // can never disagree with the Tournament Summary's own Champion/Runner-up.
  generatePlayerStatistics(tournament) {
    const stats = new Map();
    for (const pool of tournament.pools) {
      for (const row of standingsService.calculateStandings(pool)) {
        stats.set(row.participantId, {
          participantId: row.participantId,
          label: row.label,
          pool: pool.label,
          matchesPlayed: row.matchesPlayed,
          wins: row.wins,
          losses: row.losses,
          pointsFor: row.pointsFor,
          pointsAgainst: row.pointsAgainst,
        });
      }
    }
    const bracketMatches = [...(tournament.bracket?.rounds || []).flatMap((r) => r.matches)];
    if (tournament.bracket?.bronzeMatch) bracketMatches.push(tournament.bracket.bronzeMatch);
    for (const match of bracketMatches) {
      if (match.isBye || match.status !== "completed") continue;
      for (const team of [match.teamA, match.teamB]) {
        const entry = team && stats.get(team.participantId);
        if (!entry) continue;
        entry.matchesPlayed += 1;
        if (match.winner === team.participantId) entry.wins += 1;
        else entry.losses += 1;
        const isTeamA = team === match.teamA;
        entry.pointsFor += (isTeamA ? match.score?.teamA : match.score?.teamB) ?? 0;
        entry.pointsAgainst += (isTeamA ? match.score?.teamB : match.score?.teamA) ?? 0;
      }
    }
    const podium = podiumFor(tournament);
    const rows = [...stats.values()].map((e) => {
      const winPct = e.matchesPlayed === 0 ? 0 : e.wins / e.matchesPlayed;
      const placement =
        e.label === podium.champion
          ? "Champion"
          : e.label === podium.runnerUp
            ? "Runner-up"
            : e.label === podium.thirdPlace
              ? "Third Place"
              : e.label === podium.fourthPlace
                ? "Fourth Place"
                : "—";
      return [
        e.label,
        tournament.pools.length > 1 ? e.pool : undefined,
        String(e.matchesPlayed),
        String(e.wins),
        String(e.losses),
        `${Math.round(winPct * 100)}%`,
        String(e.pointsFor),
        String(e.pointsAgainst),
        placement,
      ].filter((v) => v !== undefined);
    });
    const columns = ["Player / Team", "Matches Played", "Wins", "Losses", "Win %", "Points Scored", "Points Conceded", "Final Placement"];
    if (tournament.pools.length > 1) columns.splice(1, 0, "Pool");
    return { title: "Player Statistics", columns, rows };
  }

  // Bracket matches only, grouped by round (Quarterfinals/Semifinals/Final —
  // whatever PlayoffBracketGenerator named the rounds), broken out
  // from the generic Match Results report so a spectator can read straight
  // down "playoffs only" without pool-play matches mixed in.
  generatePlayoffReport(tournament) {
    if (!tournament.bracket) {
      return { title: "Playoff Results", columns: ["Match #", "Round", "Participants", "Score", "Winner", "Court", "Date & Time"], rows: [] };
    }
    const matchRow = (match, roundName) => [
      String(match.matchNumber),
      roundName,
      `${match.teamA?.label ?? "TBD"} vs ${match.teamB?.label ?? "TBD"}`,
      match.status === "completed" ? `${match.score?.teamA ?? "—"}–${match.score?.teamB ?? "—"}` : "—",
      match.winner == null ? "—" : match.winner === match.teamA?.participantId ? match.teamA.label : match.teamB?.label ?? "—",
      match.court != null ? String(match.court) : "—",
      match.completedAt ? new Date(match.completedAt).toLocaleString() : "—",
    ];
    const rows = tournament.bracket.rounds.flatMap((round) => round.matches.filter((m) => !m.isBye).map((m) => matchRow(m, round.name)));
    // Bronze Medal Match — a sibling field, not a round inside
    // tournament.bracket.rounds, appended after the semifinal/final rows
    // rather than mixed into the rounds.flatMap above so it doesn't need a
    // synthetic round object.
    if (tournament.bracket.bronzeMatch) rows.push(matchRow(tournament.bracket.bronzeMatch, "Bronze Medal Match"));
    return { title: "Playoff Results", columns: ["Match #", "Round", "Participants", "Score", "Winner", "Court", "Date & Time"], rows };
  }

  // Chronological event log, synthesized entirely from timestamps that
  // already exist on the record (tournament.createdAt, per-pool
  // completedAt, tournament.qualificationFinalizedAt, bracket.generatedAt,
  // per-round completion inferred as the latest completedAt among that
  // round's own matches, bracket.completedAt for Champion Declared) — no
  // separate event log is persisted, same "derive, don't persist" precedent
  // as every other report here.
  generateTournamentTimeline(tournament) {
    const events = [{ label: "Tournament Created", timestamp: tournament.createdAt }];
    for (const pool of tournament.pools) {
      if (pool.status === "completed" && pool.completedAt) {
        events.push({ label: `${pool.label} Completed`, timestamp: pool.completedAt });
      }
    }
    if (tournament.qualificationFinalizedAt) {
      events.push({ label: "Qualification Finalized", timestamp: tournament.qualificationFinalizedAt });
    }
    if (tournament.bracket?.generatedAt) {
      events.push({ label: "Bracket Generated", timestamp: tournament.bracket.generatedAt });
    }
    for (const round of tournament.bracket?.rounds || []) {
      if (round.status !== "completed") continue;
      const completions = round.matches.filter((m) => !m.isBye).map((m) => m.completedAt ?? 0);
      const ts = completions.length ? Math.max(...completions) : 0;
      if (ts > 0) events.push({ label: `${round.name} Completed`, timestamp: ts });
    }
    if (tournament.bracket?.bronzeMatch?.status === "completed" && tournament.bracket.bronzeMatch.completedAt) {
      events.push({ label: "Bronze Medal Match Completed", timestamp: tournament.bracket.bronzeMatch.completedAt });
    }
    // Champion Declared uses the Final match's OWN completedAt, not
    // bracket.completedAt — the latter now only stamps once the whole
    // bracket locks, which (with Bronze Medal Match enabled) can happen
    // later than the Final itself, since champion/runnerUp are decided the
    // moment the Final completes regardless of whether Bronze has finished
    // yet (see PlayoffEngine.updateBracket).
    if (tournament.bracket?.champion) {
      const finalRound = tournament.bracket.rounds[tournament.bracket.rounds.length - 1];
      const finalMatch = finalRound.matches.find((m) => m.status === "completed");
      if (finalMatch?.completedAt) {
        events.push({ label: `Champion Declared — ${tournament.bracket.champion.label}`, timestamp: finalMatch.completedAt });
      }
    }
    events.sort((a, b) => a.timestamp - b.timestamp);
    return {
      title: "Tournament Timeline",
      columns: ["Event", "Date & Time"],
      rows: events.map((e) => [e.label, new Date(e.timestamp).toLocaleString()]),
    };
  }

  // Sprint 5 Validation — "Prevent exporting incomplete tournaments as final
  // reports." Called by TournamentReportsView before invoking ExportService,
  // which itself stays format-agnostic (see ExportService.js's header
  // comment) and so doesn't know what "complete" means for a tournament.
  assertExportable(tournament) {
    if (tournament.status !== "completed") {
      throw new Error("This tournament isn't complete yet — finish all matches before exporting a final report.");
    }
  }
}
