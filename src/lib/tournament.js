// Orchestration glue between a session's registered players and the Round
// Robin engine — builds entrants (Singles: one per player; Doubles: one per
// team, paired via RoundRobinScheduler.pairIntoTeams), generates the
// schedule, and persists it as its own Tournament record. Kept separate
// from lib/tournamentModel.js (pure data shapes + storage) and
// engines/RoundRobinScheduler.js (the scheduling algorithm itself), which
// don't need to know anything about session players.
import { makeEntrant, makeTournament, saveTournament } from "./tournamentModel.js";
import { generateRoundRobinSchedule, pairIntoTeams } from "../engines/RoundRobinScheduler.js";
import { RoundRobinEngine } from "../engines/RoundRobinEngine.js";
import { SingleEliminationEngine } from "../engines/SingleEliminationEngine.js";
import { DoubleEliminationEngine } from "../engines/DoubleEliminationEngine.js";

export function buildEntrants(players, mode) {
  if (mode === "doubles") {
    return pairIntoTeams(players).map(([a, b]) => makeEntrant(`${a.name} / ${b.name}`, [a.id, b.id]));
  }
  return players.map((p) => makeEntrant(p.name, [p.id]));
}

export async function buildAndSaveRoundRobinTournament({ sessionCode, players, mode, courtsCount }) {
  const entrants = buildEntrants(players, mode);
  const rounds = generateRoundRobinSchedule({ entrants, courtsCount });
  const tournament = makeTournament({ sessionCode, format: "roundRobin", mode, courtsCount, entrants, rounds });
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
