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
//   winner (Participant['id'] | null),
//   score ({ teamA: number|null, teamB: number|null }) — both null until a
//   result is saved, see updateMatchResult below,
//   completedAt (ms epoch | null) — set when a result is saved,
//   status ('pending' | 'inProgress' | 'completed') — real now, see
//   startMatch/updateMatchResult below (Tournament Match Management)
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
    score: { teamA: null, teamB: null },
    completedAt: null,
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
    status: computeRoundStatus(matches), // 'pending' | 'inProgress' | 'completed'
    courtAssignments: matches.filter((m) => !m.isBye).map((m) => m.court),
    matches,
  };
}

// ---- Tournament Match Management ----
// Format-agnostic helpers for locating and progressing matches — used by
// both startMatch below (a plain status flip, not specific to any format)
// and RoundRobinEngine.updateMatchResult (which reuses computeRoundStatus/
// computeTournamentStatus after actually writing the result). Not part of
// the TournamentEngine interface itself since "find a match" and "roll up a
// round/tournament's status from its matches" aren't scheduling/results
// logic a format needs to customize.

export function findMatch(tournament, matchId) {
  for (const round of tournament.rounds) {
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return { round, match };
  }
  return null;
}

// A bye "match" is always effectively done — it never blocks a round from
// completing. A round with only byes (shouldn't happen with 2+ real
// participants, but guarded anyway) is considered completed.
export function computeRoundStatus(matches) {
  const real = matches.filter((m) => !m.isBye);
  if (real.length === 0) return "completed";
  if (real.every((m) => m.status === "completed")) return "completed";
  if (real.some((m) => m.status === "inProgress" || m.status === "completed")) return "inProgress";
  return "pending";
}

// 'draft' is preserved as-is (nothing in this app creates a draft
// tournament yet — schedule generation always produces one that's
// immediately 'ready' — but this function shouldn't invent a status change
// for a state it doesn't understand). Otherwise: every real match completed
// -> 'completed'; any match started or finished -> 'running'; else 'ready'.
export function computeTournamentStatus(tournament) {
  if (tournament.status === "draft") return "draft";
  const real = tournament.rounds.flatMap((r) => r.matches.filter((m) => !m.isBye));
  if (real.length > 0 && real.every((m) => m.status === "completed")) return "completed";
  if (real.some((m) => m.status === "inProgress" || m.status === "completed")) return "running";
  return "ready";
}

// Live Tournament Progress — Total/Completed/Remaining/Percent, counting
// only real (non-bye) matches. Pure and format-agnostic; used by the
// Tournament Dashboard's Overview tab.
export function getTournamentProgress(tournament) {
  const real = tournament.rounds.flatMap((r) => r.matches.filter((m) => !m.isBye));
  const total = real.length;
  const completed = real.filter((m) => m.status === "completed").length;
  return {
    total,
    completed,
    remaining: total - completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

// "Start Match": pending -> inProgress. Deliberately not part of the
// TournamentEngine interface (see file header above) — every format starts
// a match the same way, there's nothing to customize. No-op on a bye (there
// is no match to start) or once the tournament itself is completed.
export function startMatch(tournament, matchId) {
  if (tournament.status === "completed") {
    throw new Error("This tournament is already completed — matches can't be changed.");
  }
  const found = findMatch(tournament, matchId);
  if (!found || found.match.isBye) return tournament;
  const rounds = tournament.rounds.map((r) => {
    if (r.roundNumber !== found.round.roundNumber) return r;
    const matches = r.matches.map((m) => (m.id === matchId ? { ...m, status: "inProgress" } : m));
    return { ...r, matches, status: computeRoundStatus(matches) };
  });
  const next = { ...tournament, rounds };
  next.status = computeTournamentStatus(next);
  return next;
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
