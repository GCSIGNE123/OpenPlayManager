// Tournament data model + storage — deliberately independent of Open Play's
// state shape (courts/nextMatchups/matchHistory). A Tournament is its own
// KV record (opl-tournament-{id}, shared, see TOURNAMENT_PREFIX), the same
// one-record-per-entity pattern sessions and the Player Database already
// use. An Open Play session only carries a `tournamentId` pointer to one of
// these — see PickleballOpenPlay.jsx — it never embeds the schedule itself.
//
// Scope for now: schedule generation + display only (see
// engines/RoundRobinScheduler.js and TournamentScheduleView.jsx). No
// scoring, standings, rankings, or bracket logic reads or writes these
// records yet — `TournamentMatch.status` is a static placeholder.
import { uid } from "./random.js";
import { TOURNAMENT_PREFIX } from "./constants.js";

// A generic competitor in the schedule — a single player for Singles, or a
// pre-formed 2-player team for Doubles. The scheduling engine only ever
// deals with entrants, never with "players" or "teams" directly, so it
// doesn't need to know which mode produced them.
export function makeEntrant(label, playerIds) {
  return { id: uid(), label, playerIds };
}

// id -> {
//   id, court, round (round number this match belongs to),
//   teamA, teamB (Entrant | null — null only for the synthetic BYE side),
//   isBye (true when this "match" is actually a bye for teamA),
//   status ('pending' | 'inProgress' | 'completed') — placeholder only,
//   nothing transitions it yet
// }
export function makeMatch({ round, court, teamA, teamB, isBye = false }) {
  return {
    id: uid(),
    round,
    court,
    teamA,
    teamB: isBye ? null : teamB,
    isBye,
    status: "pending",
  };
}

export function makeRound(roundNumber, matches) {
  return { roundNumber, matches };
}

export function makeTournament({ sessionCode, mode, courtsCount, entrants, rounds }) {
  const now = Date.now();
  return {
    id: uid(),
    sessionCode,
    format: "roundRobin",
    mode, // 'singles' | 'doubles'
    courtsCount,
    entrants,
    rounds,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveTournament(tournament) {
  const stamped = { ...tournament, updatedAt: Date.now() };
  await window.storage.set(`${TOURNAMENT_PREFIX}${tournament.id}`, JSON.stringify(stamped), true);
  return stamped;
}

export async function fetchTournament(id) {
  if (!id) return null;
  try {
    const res = await window.storage.get(`${TOURNAMENT_PREFIX}${id}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return null; // deleted, or never existed
  }
}
