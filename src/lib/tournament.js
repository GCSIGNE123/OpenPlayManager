// Orchestration glue between a session's registered players and the Round
// Robin engine — builds entrants (Singles: one per player; Doubles: one per
// team, paired via RoundRobinScheduler.pairIntoTeams), splits them into
// pools (Round Robin Pool Support), generates each pool's own schedule, and
// persists the whole thing as its own Tournament record. Kept separate from
// lib/tournamentModel.js (pure data shapes + storage) and
// engines/RoundRobinScheduler.js (the scheduling algorithm itself, called
// once per pool — it has no idea pools exist), which don't need to know
// anything about session players.
import { makeEntrant, makeTournament, makeTournamentPool, makeCourt, saveTournament, startMatch } from "./tournamentModel.js";
import { generateRoundRobinSchedule, pairIntoTeams } from "../engines/RoundRobinScheduler.js";
import { assignPools, poolLabel } from "../engines/PoolAssignment.js";
import { RoundRobinEngine } from "../engines/RoundRobinEngine.js";
import { SingleEliminationEngine } from "../engines/SingleEliminationEngine.js";
import { DoubleEliminationEngine } from "../engines/DoubleEliminationEngine.js";
import { PlayoffEngine } from "../engines/PlayoffEngine.js";
import { CourtAssignmentService } from "../engines/CourtAssignmentService.js";

const playoffEngine = new PlayoffEngine();
const courtAssignmentService = new CourtAssignmentService();

export function buildEntrants(players, mode) {
  if (mode === "doubles") {
    return pairIntoTeams(players).map(([a, b]) => makeEntrant(`${a.name} / ${b.name}`, [a.id, b.id]));
  }
  return players.map((p) => makeEntrant(p.name, [p.id]));
}

export async function buildAndSaveRoundRobinTournament({
  sessionCode,
  players,
  mode,
  courtsCount,
  poolCount = 1,
  assignmentMethod = "random",
  advancesPerPool = 1,
}) {
  const entrants = buildEntrants(players, mode);
  const groups = assignPools(entrants, poolCount, assignmentMethod);
  // "Teams Advancing Per Pool" can't exceed the smallest pool's size — the
  // UI already blocks this before Generate is even clickable, this is the
  // belt to that suspenders (same pattern as the "2 players per pool"
  // check Round Robin Pool Support added).
  const smallestPool = Math.min(...groups.map((g) => g.length));
  if (advancesPerPool > smallestPool) {
    throw new Error(`Teams Advancing Per Pool (${advancesPerPool}) can't exceed the smallest pool's size (${smallestPool}).`);
  }
  const pools = groups.map((group, i) =>
    makeTournamentPool({
      label: poolLabel(i),
      entrants: group,
      rounds: generateRoundRobinSchedule({ entrants: group, courtsCount }),
    })
  );
  const tournament = makeTournament({
    sessionCode,
    format: "roundRobin",
    mode,
    courtsCount,
    poolCount,
    assignmentMethod,
    pools,
    advancesPerPool,
  });
  return saveTournament(tournament);
}

// Tournament Engine Foundation's format -> engine registry (Strategy
// pattern, same role src/lib/utils.js's getRotationEngine plays for Open
// Play's rotation strategies). Not wired into buildAndSaveRoundRobinTournament
// above — that function is the already-shipped, tested Round Robin flow and
// is deliberately left as-is so this foundation work can't regress it. This
// registry exists for future callers (e.g. a Tournament Dashboard action)
// that want to go through the generic TournamentEngine interface instead.
const engines = {
  roundRobin: new RoundRobinEngine(),
  singleElimination: new SingleEliminationEngine(),
  doubleElimination: new DoubleEliminationEngine(),
};

export function getTournamentEngine(format) {
  return engines[format] || engines.roundRobin;
}

// ---- Tournament Match Management ----
// Both throw (propagating validation errors from startMatch/
// updateMatchResult) rather than swallowing them — callers surface the
// message directly to the organizer instead of silently no-op'ing.

export async function saveMatchStart(tournament, matchId) {
  const updated = startMatch(tournament, matchId);
  return saveTournament(updated);
}

export async function saveMatchResult(tournament, matchId, result) {
  const engine = getTournamentEngine(tournament.format);
  const updated = engine.updateMatchResult(tournament, matchId, result);
  return saveTournament(updated);
}

// ---- Playoff Match Management & Winner Advancement ----
// Same "call the engine, persist what it returns" shape as saveMatchStart/
// saveMatchResult above, but scoped to tournament.bracket via PlayoffEngine
// rather than tournament.pools via startMatch/RoundRobinEngine — a
// completely separate engine (see PlayoffEngine.js's file header for why).

export async function savePlayoffMatchStart(tournament, matchId) {
  const bracket = playoffEngine.startMatch(tournament.bracket, matchId);
  return saveTournament({ ...tournament, bracket });
}

export async function savePlayoffMatchResult(tournament, matchId, result) {
  const bracket = playoffEngine.updateBracket(tournament.bracket, matchId, result);
  return saveTournament({ ...tournament, bracket });
}

// ---- Tournament Court Assignment & Match Queue ----
// assignCourt/releaseCourt go through CourtAssignmentService (validation +
// the actual match.court write); addCourt/removeCourt/setCourtStatus/
// renameCourt are simple enough (they only ever touch tournament.courts
// metadata, never a match) to handle inline here rather than adding four
// more one-line CourtAssignmentService methods beyond the five the
// architecture calls for.

export async function saveCourtAssignment(tournament, matchId, courtNumber) {
  const updated = courtAssignmentService.assignMatchToCourt(tournament, matchId, courtNumber);
  return saveTournament(updated);
}

export async function saveCourtRelease(tournament, courtNumber) {
  const updated = courtAssignmentService.releaseCourt(tournament, courtNumber);
  return saveTournament(updated);
}

// "Reassign a match before it starts": release + assign performed on the
// SAME in-memory tournament, in one synchronous chain, before the single
// saveTournament call — not two separate saveCourtRelease/saveCourtAssignment
// calls in sequence, which would race (the second call's `tournament`
// argument would still be the pre-release version until the caller's own
// state re-renders in between).
export async function saveCourtReassignment(tournament, matchId, fromCourtNumber, toCourtNumber) {
  const released = courtAssignmentService.releaseCourt(tournament, fromCourtNumber);
  const updated = courtAssignmentService.assignMatchToCourt(released, matchId, toCourtNumber);
  return saveTournament(updated);
}

export async function saveAddCourt(tournament, name) {
  const nextNumber = Math.max(0, ...tournament.courts.map((c) => c.number)) + 1;
  const courts = [...tournament.courts, makeCourt(nextNumber, name)];
  return saveTournament({ ...tournament, courts });
}

// Removing an occupied court would silently orphan its current match (a
// non-completed match left pointing at a court number that no longer
// exists) — released first, same as the organizer explicitly clearing it
// via the Courts tab, so it lands back in the queue rather than vanishing.
export async function saveRemoveCourt(tournament, courtId) {
  const court = tournament.courts.find((c) => c.id === courtId);
  if (!court) return tournament;
  const released = courtAssignmentService.releaseCourt(tournament, court.number);
  const courts = released.courts.filter((c) => c.id !== courtId);
  return saveTournament({ ...released, courts });
}

export async function saveSetCourtStatus(tournament, courtId, status) {
  const courts = tournament.courts.map((c) => (c.id === courtId ? { ...c, status } : c));
  return saveTournament({ ...tournament, courts });
}

export async function saveRenameCourt(tournament, courtId, name) {
  const courts = tournament.courts.map((c) => (c.id === courtId ? { ...c, name } : c));
  return saveTournament({ ...tournament, courts });
}
