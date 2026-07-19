// League Management orchestration — mirrors lib/tournament.js's shape
// almost line for line (build-and-save, match start/result, court
// assignment), calling the SAME engines/services a Tournament already
// does, just persisting through saveLeagueSeason instead of saveTournament.
// See PROJECT.md's League Management section and lib/leagueModel.js's
// header comment for why a LeagueSeason can reuse these unmodified.
import { makeEntrant, makeTournamentPool, findMatch, startMatch } from "./tournamentModel.js";
import { generateRoundRobinSchedule, pairIntoTeams } from "../engines/RoundRobinScheduler.js";
import { RoundRobinEngine } from "../engines/RoundRobinEngine.js";
import { CourtAssignmentService } from "../engines/CourtAssignmentService.js";
import { makeLeagueSeason, makeLeagueWeek, saveLeagueSeason, computeWeekDate } from "./leagueModel.js";

const roundRobinEngine = new RoundRobinEngine();
const courtAssignmentService = new CourtAssignmentService();

// division: { name, players, mode } — mode is read from the season overall
// (Singles/Doubles applies to the whole season, per League Setup's fields,
// not per division).
function buildDivisionPool({ name, players, mode, courtsCount, startDate, matchDay }) {
  const entrants =
    mode === "doubles"
      ? pairIntoTeams(players).map(([a, b]) => makeEntrant(`${a.name} / ${b.name}`, [a.id, b.id]))
      : players.map((p) => makeEntrant(p.name, [p.id]));
  const rounds = generateRoundRobinSchedule({ entrants, courtsCount });
  const weeks = rounds.map((round) =>
    makeLeagueWeek(round.roundNumber, round.matches, computeWeekDate(startDate, matchDay, round.roundNumber))
  );
  return makeTournamentPool({ label: name, entrants, rounds: weeks });
}

// divisions: { name, players }[] — mode/courtsCount/startDate/matchDay
// apply to every division in the season (a season has one match day/time
// and one courts count, shared across all its divisions, per League Setup).
export async function buildAndSaveLeagueSeason({
  leagueId,
  name,
  season,
  startDate,
  endDate,
  matchDay,
  matchTime,
  courtsCount,
  mode,
  divisions,
}) {
  const smallDivision = divisions.find((d) => d.players.length < 2);
  if (smallDivision) throw new Error(`Division "${smallDivision.name}" needs at least 2 players.`);
  const pools = divisions.map((d) => buildDivisionPool({ ...d, mode, courtsCount, startDate, matchDay }));
  const leagueSeason = makeLeagueSeason({
    leagueId,
    name,
    season,
    startDate,
    endDate,
    matchDay,
    matchTime,
    courtsCount,
    mode,
    pools,
  });
  return saveLeagueSeason(leagueSeason);
}

// ---- Weekly Match Scheduling: start/score, same shape as
// lib/tournament.js's saveMatchStart/saveMatchResult, reusing the exact
// same tournamentModel.js/RoundRobinEngine functions.
export async function saveLeagueMatchStart(season, matchId) {
  const updated = startMatch(season, matchId);
  return saveLeagueSeason(updated);
}

export async function saveLeagueMatchResult(season, matchId, result) {
  const updated = roundRobinEngine.updateMatchResult(season, matchId, result);
  return saveLeagueSeason(updated);
}

// ---- Manual edits: court assignment reuses CourtAssignmentService
// directly, exactly like lib/tournament.js's saveCourtAssignment/
// saveCourtRelease do for a Tournament.
export async function saveLeagueCourtAssignment(season, matchId, courtNumber) {
  const updated = courtAssignmentService.assignMatchToCourt(season, matchId, courtNumber);
  return saveLeagueSeason(updated);
}

export async function saveLeagueCourtRelease(season, courtNumber) {
  const updated = courtAssignmentService.releaseCourt(season, courtNumber);
  return saveLeagueSeason(updated);
}

// ---- Manual edits: swap the two teams between two not-yet-started
// matches in the SAME week. Scoped narrowly on purpose — see PROJECT.md:
// this is the one "manual edit" capability this task builds beyond court/
// score edits (already covered above), not a full drag-and-drop
// rescheduler. Both matches must be pending (not started, not a bye) —
// swapping a match that's already in progress or completed would silently
// rewrite real results.
export function swapWeekMatches(season, matchAId, matchBId) {
  const foundA = findMatch(season, matchAId);
  const foundB = findMatch(season, matchBId);
  if (!foundA || !foundB) throw new Error("Match not found.");
  if (foundA.round.roundNumber !== foundB.round.roundNumber || foundA.pool.id !== foundB.pool.id) {
    throw new Error("Both matches must be in the same week of the same division.");
  }
  if (foundA.match.isBye || foundB.match.isBye) throw new Error("Bye matches can't be swapped.");
  if (foundA.match.status !== "pending" || foundB.match.status !== "pending") {
    throw new Error("Only matches that haven't started yet can be swapped.");
  }
  const pools = season.pools.map((pool) => {
    if (pool.id !== foundA.pool.id) return pool;
    const rounds = pool.rounds.map((round) => {
      if (round.roundNumber !== foundA.round.roundNumber) return round;
      const matches = round.matches.map((m) => {
        if (m.id === matchAId) return { ...m, teamA: foundB.match.teamA, teamB: foundB.match.teamB };
        if (m.id === matchBId) return { ...m, teamA: foundA.match.teamA, teamB: foundA.match.teamB };
        return m;
      });
      return { ...round, matches };
    });
    return { ...pool, rounds };
  });
  return { ...season, pools };
}

export async function saveSwapWeekMatches(season, matchAId, matchBId) {
  const updated = swapWeekMatches(season, matchAId, matchBId);
  return saveLeagueSeason(updated);
}
