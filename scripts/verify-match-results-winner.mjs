// Reports -> Match Results — Winner column bug fix. A pool match's teams
// are Participant objects (`.id`); a playoff/bracket match's teams are
// SeededTeam objects (`.participantId`, no `.id` at all — see
// BracketSeeding.js/PlayoffBracketGenerator.js). generateMatchReport used
// to compare match.winner against only `.id`, so every playoff-sourced row
// (Championship Match, semifinals, etc.) showed a blank "—" Winner even
// though the winner is correctly known everywhere else (Tournament Summary,
// Playoff Results, Bracket, Standings). Fixed by resolving whichever id
// field the team shape actually has, same precedent already used by
// lib/tournament.js's rateMatch and TournamentDashboardView's
// handleEndMatch.
//
// Usage: node scripts/verify-match-results-winner.mjs
import { TournamentReportService } from "../src/engines/TournamentReportService.js";
import { makeParticipant } from "../src/lib/tournamentModel.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

const service = new TournamentReportService();

console.log("\n1. Pool match — Winner column already worked, must keep working");
{
  const teamA = makeParticipant("Ana / Ben", ["a", "b"]);
  const teamB = makeParticipant("Cara / Dan", ["c", "d"]);
  const tournament = {
    pools: [{
      id: "P1", label: "Pool A", entrants: [teamA, teamB],
      rounds: [{ roundNumber: 1, matches: [{
        id: "M1", round: 1, court: 1, teamA, teamB, isBye: false,
        status: "completed", winner: teamA.id, score: { teamA: 11, teamB: 7 },
        completedAt: Date.now(),
      }] }],
    }],
    bracket: null,
  };
  const report = service.generateMatchReport(tournament);
  const row = report.rows[0];
  assert("pool match Winner column resolves to the winning team's label", row[4] === "Ana / Ben");
}

console.log("\n2. Playoff/bracket match — the bug: SeededTeam shape has participantId, not id");
{
  const seededA = { poolId: "P1", poolLabel: "Pool A", rank: 1, participantId: "u1p0gu4", label: "Player A / Player C", qualificationType: "qualified", seed: 1 };
  const seededB = { poolId: "P1", poolLabel: "Pool A", rank: 2, participantId: "b1a3jmz", label: "Player B / Player D", qualificationType: "qualified", seed: 2 };
  assert("SeededTeam objects genuinely have no .id field (confirms the root cause)", seededA.id === undefined && seededB.id === undefined);

  const tournament = {
    pools: [],
    bracket: {
      status: "completed",
      rounds: [{
        roundNumber: 1, name: "Championship Match",
        matches: [{
          id: "9qqrj5a", round: 1, matchNumber: 1, matchType: "playoff", court: 1,
          teamA: seededA, teamB: seededB, isBye: false, status: "completed",
          winner: seededB.participantId, // the #2 seed won — an upset, exactly like the rehearsal
          score: { teamA: 0, teamB: 11 }, completedAt: Date.now(),
        }],
      }],
      bronzeMatch: null,
    },
  };
  const report = service.generateMatchReport(tournament);
  const row = report.rows[0];
  assert("Winner column no longer blank for a playoff-sourced row", row[4] !== "—");
  assert("Winner column shows the ACTUAL winner (the upset team), not the higher seed", row[4] === "Player B / Player D");
  assert("Teams column still reads correctly for a playoff row", row[2] === "Player A / Player C vs Player B / Player D");
  assert("Score column still reads correctly", row[3] === "0–11");
}

console.log("\n3. Consistency: the same tournament's Playoff Results / Tournament Summary already agreed with the engine's own winner — Match Results must now match them, not the other way around");
{
  const seededA = { poolId: "P1", poolLabel: "Pool A", rank: 1, participantId: "t1", label: "Team One", qualificationType: "qualified", seed: 1 };
  const seededB = { poolId: "P1", poolLabel: "Pool A", rank: 2, participantId: "t2", label: "Team Two", qualificationType: "qualified", seed: 2 };
  const bracketMatch = {
    id: "gf1", round: 1, matchNumber: 1, matchType: "playoff", court: 2,
    teamA: seededA, teamB: seededB, isBye: false, status: "completed",
    winner: seededA.participantId, score: { teamA: 11, teamB: 3 }, completedAt: Date.now(),
  };
  const tournament = {
    pools: [], bracket: { status: "completed", rounds: [{ roundNumber: 1, name: "Final", matches: [bracketMatch] }], champion: seededA, runnerUp: seededB, bronzeMatch: null },
  };
  const matchReport = service.generateMatchReport(tournament);
  const summary = service.generateTournamentSummary(tournament);
  const summaryChampionRow = summary.rows.find((r) => r[0].includes("Champion"));
  assert("Match Results winner label matches the Bracket's own champion label", matchReport.rows[0][4] === tournament.bracket.champion.label);
  assert("...and matches Tournament Summary's Champion row", matchReport.rows[0][4] === summaryChampionRow?.[1]);
}

console.log("\n4. Scorer column (name entered at Start Match)");
{
  const a = makeParticipant("Ana / Ben", ["a", "b"]);
  const b = makeParticipant("Cara / Dan", ["c", "d"]);
  const mk = (id, extra) => ({ id, round: 1, court: 1, teamA: a, teamB: b, isBye: false, status: "completed", winner: a.id, score: { teamA: 11, teamB: 3 }, completedAt: Date.now(), ...extra });
  const report = service.generateMatchReport({ pools: [{ id: "P1", label: "Pool A", entrants: [a, b], rounds: [{ roundNumber: 1, matches: [mk("S1", { scorerName: "Sam Scorer" }), mk("S2", {})] }] }], bracket: null });
  assert("column header present between Winner and Completion Time", report.columns.join("|") === "Round|Court|Teams|Score|Winner|Scorer|Completion Time");
  assert("scorer name shown", report.rows[0][5] === "Sam Scorer");
  assert("no scorer recorded -> em dash", report.rows[1][5] === "—");
  assert("every row matches the column count", report.rows.every((r) => r.length === report.columns.length));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
