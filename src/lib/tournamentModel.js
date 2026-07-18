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

// A Tournament Participant — a single player for Singles, or a pre-formed
// 2-player team for Doubles. The scheduling engine only ever deals with
// participants generically, never with "players" or "teams" directly, so it
// doesn't need to know which mode produced them.
//
// `seed` and `status` are part of the Tournament Engine Foundation's data
// model but are not read or computed by anything yet — no seeding logic
// exists (that's its own later FEATURES.md item), and `status` has no
// defined values yet (unlike Tournament/TournamentMatch, the task that
// introduced this field didn't specify an enum for it). Both simply carry
// through as null until a future feature gives them meaning.
export function makeParticipant(label, playerIds, seed = null) {
  return { id: uid(), label, playerIds, seed, status: null };
}
// `makeEntrant` is the pre-existing name the working Round Robin scheduler
// and its tests already import — kept as an alias so that code (and every
// already-stored tournament record) needs no changes.
export const makeEntrant = makeParticipant;

// id -> {
//   id, court, round (round number this match belongs to),
//   teamA, teamB (Participant | null — null only for the synthetic BYE side),
//   isBye (true when this "match" is actually a bye for teamA),
//   winner (Participant['id'] | null), score (null | app-defined shape) —
//   part of the Tournament Engine Foundation's data model; nothing writes to
//   either yet, match scoring is a separate later feature,
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
    winner: null,
    score: null,
    status: "pending",
  };
}

// `courtAssignments` is redundant with `matches[].court` (kept there since
// the scheduler already produces it per-match) but surfaced here too as its
// own field, matching the Tournament Engine Foundation's Tournament Round
// model — some future consumer (e.g. a live "what's on court N right now"
// view) may want it without walking every match.
export function makeRound(roundNumber, matches) {
  return {
    roundNumber,
    status: "pending", // 'pending' | 'inProgress' | 'completed' — placeholder only, mirrors TournamentMatch's status values
    courtAssignments: matches.filter((m) => !m.isBye).map((m) => m.court),
    matches,
  };
}

export function makeTournament({ name, sessionCode, format = "roundRobin", mode, courtsCount, entrants, rounds }) {
  const now = Date.now();
  return {
    id: uid(),
    name: name || `${mode === "doubles" ? "Doubles" : "Singles"} ${format === "roundRobin" ? "Round Robin" : format}`,
    sessionCode,
    format,
    mode, // 'singles' | 'doubles'
    courtsCount,
    // 'draft' | 'ready' | 'running' | 'completed' — a freshly generated
    // tournament already has its full schedule, so it starts 'ready' rather
    // than 'draft'. Nothing transitions it further yet (no live match
    // tracking exists), so it stays 'ready' indefinitely for now.
    status: "ready",
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
