// Orchestration glue between a session's registered players and the Round
// Robin engine — builds entrants (Singles: one per player; Doubles: one per
// team, paired via RoundRobinScheduler.pairIntoTeams), generates the
// schedule, and persists it as its own Tournament record. Kept separate
// from lib/tournamentModel.js (pure data shapes + storage) and
// engines/RoundRobinScheduler.js (the scheduling algorithm itself), which
// don't need to know anything about session players.
import { makeEntrant, makeTournament, saveTournament } from "./tournamentModel.js";
import { generateRoundRobinSchedule, pairIntoTeams } from "../engines/RoundRobinScheduler.js";

export function buildEntrants(players, mode) {
  if (mode === "doubles") {
    return pairIntoTeams(players).map(([a, b]) => makeEntrant(`${a.name} / ${b.name}`, [a.id, b.id]));
  }
  return players.map((p) => makeEntrant(p.name, [p.id]));
}

export async function buildAndSaveRoundRobinTournament({ sessionCode, players, mode, courtsCount }) {
  const entrants = buildEntrants(players, mode);
  const rounds = generateRoundRobinSchedule({ entrants, courtsCount });
  const tournament = makeTournament({ sessionCode, mode, courtsCount, entrants, rounds });
  return saveTournament(tournament);
}
