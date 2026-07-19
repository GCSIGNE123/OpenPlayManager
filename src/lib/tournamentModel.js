// Tournament data model + storage — deliberately independent of Open Play's
// state shape (courts/nextMatchups/matchHistory). A Tournament is its own
// KV record (opl-tournament-{id}, shared, see TOURNAMENT_PREFIX), the same
// one-record-per-entity pattern sessions and the Player Database already
// use. An Open Play session only carries a `tournamentId` pointer to one of
// these — see PickleballOpenPlay.jsx — it never embeds the schedule itself.
//
// As of Round Robin Pool Support, a Tournament no longer carries its own
// entrants/rounds/champion directly — those live one level down, on each
// TournamentPool in `tournament.pools` (see makeTournamentPool below). This
// is a breaking schema change from every earlier task's shape; there's no
// migration for tournament records saved before this task, since the
// Tournament Manager epic is still unreleased/in-progress (unlike Rotation
// Mode, which stays backward-compatible deliberately — see PROJECT.md).
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

// ---- Round Robin Pool Support ----
// A TournamentPool is a fully independent Round Robin sub-tournament: its
// own entrants, schedule, standings, and champion. It's deliberately given
// the same { entrants, rounds } shape a Tournament used to carry directly —
// that's what lets TournamentStandingsService/TournamentCompletionService
// (engines/) work on a pool with ZERO changes: those services only ever
// read `entity.entrants`/`entity.rounds`, so a pool satisfies their
// interface exactly as well as a single-pool tournament used to. A single-
// pool tournament (poolCount: 1, the default) is just a tournament with one
// pool in the array — not a structurally different case anything needs to
// special-case.
export function makeTournamentPool({ label, entrants, rounds }) {
  return {
    id: uid(),
    label,
    entrants,
    rounds,
    status: computePoolStatus({ rounds }), // 'ready' | 'running' | 'completed'
    completedAt: null,
    champion: null,
    runnerUp: null,
    thirdPlace: null,
  };
}

// Renamed from the old (pre-pools) computeTournamentStatus — identical
// logic, now explicitly scoped to one pool's rounds rather than assumed to
// be the whole tournament's. 'draft' is preserved as-is (nothing creates a
// draft pool yet). Otherwise: every real match completed -> 'completed';
// any match started or finished -> 'running'; else 'ready'.
export function computePoolStatus(pool) {
  if (pool.status === "draft") return "draft";
  const real = pool.rounds.flatMap((r) => r.matches.filter((m) => !m.isBye));
  if (real.length > 0 && real.every((m) => m.status === "completed")) return "completed";
  if (real.some((m) => m.status === "inProgress" || m.status === "completed")) return "running";
  return "ready";
}

// Overall tournament status derived from every pool's own status — pools
// are fully independent, so the tournament as a whole is only 'completed'
// once ALL of them are; 'running' as soon as any one of them has started or
// finished; 'ready' otherwise. There's no cross-pool combining here (that's
// what a future Playoff Qualification feature would add).
export function computeTournamentStatus(tournament) {
  const statuses = tournament.pools.map((p) => p.status);
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.some((s) => s === "running" || s === "completed")) return "running";
  return "ready";
}

// ---- Tournament Match Management ----
// Format-agnostic helpers for locating and progressing matches — used by
// both startMatch below (a plain status flip, not specific to any format)
// and RoundRobinEngine.updateMatchResult (which reuses computeRoundStatus/
// computePoolStatus after actually writing the result). Not part of the
// TournamentEngine interface itself since "find a match" and "roll up a
// round/pool/tournament's status from its matches" aren't scheduling/
// results logic a format needs to customize.

// Searches every pool's rounds — a match id is unique across the whole
// tournament regardless of which pool it belongs to.
export function findMatch(tournament, matchId) {
  for (const pool of tournament.pools) {
    for (const round of pool.rounds) {
      const match = round.matches.find((m) => m.id === matchId);
      if (match) return { pool, round, match };
    }
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

// Live progress for anything shaped like { rounds } — a single pool or (by
// aggregating across pools, see getTournamentProgress below) a whole
// tournament. Counts only real (non-bye) matches.
export function getPoolProgress(pool) {
  const real = pool.rounds.flatMap((r) => r.matches.filter((m) => !m.isBye));
  const total = real.length;
  const completed = real.filter((m) => m.status === "completed").length;
  return {
    total,
    completed,
    remaining: total - completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

// Tournament-wide progress — sums every pool's own progress. Used by the
// Tournament Dashboard's Overview tab for the aggregate Total/Completed/
// Remaining stats (pool-by-pool breakdowns use getPoolProgress directly).
export function getTournamentProgress(tournament) {
  const totals = tournament.pools.map(getPoolProgress);
  const total = totals.reduce((sum, p) => sum + p.total, 0);
  const completed = totals.reduce((sum, p) => sum + p.completed, 0);
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
// is no match to start). Locked per pool: a pool that's already completed
// rejects further changes even while a sibling pool is still running.
export function startMatch(tournament, matchId) {
  const found = findMatch(tournament, matchId);
  if (!found) return tournament;
  if (found.pool.status === "completed") {
    throw new Error("This pool is already completed — matches can't be changed.");
  }
  if (found.match.isBye) return tournament;

  const pools = tournament.pools.map((p) => {
    if (p.id !== found.pool.id) return p;
    const rounds = p.rounds.map((r) => {
      if (r.roundNumber !== found.round.roundNumber) return r;
      const matches = r.matches.map((m) => (m.id === matchId ? { ...m, status: "inProgress" } : m));
      return { ...r, matches, status: computeRoundStatus(matches) };
    });
    return { ...p, rounds, status: computePoolStatus({ rounds }) };
  });
  const next = { ...tournament, pools };
  next.status = computeTournamentStatus(next);
  return next;
}

// ---- Tournament Court Assignment & Match Queue ----
// A Court is pure metadata (name + status) — which match, if any, is
// currently "on" a given court is deliberately NOT tracked here as a
// separate field. It's derived instead (see CourtAssignmentService.js):
// a court is occupied exactly when some non-completed match has
// `match.court === court.number`. That's what makes freeing a court when a
// match finishes automatic and bug-free — it happens as a side effect of
// RoundRobinEngine/PlayoffEngine's existing status transitions, with no new
// code needed to keep a second "current match" field in sync.
export function makeCourt(number, name) {
  return { id: uid(), number, name: name || `Court ${number}`, status: "available" }; // 'available' | 'maintenance'
}

export function makeTournament({
  name,
  sessionCode,
  format = "roundRobin",
  mode,
  courtsCount,
  poolCount = 1,
  assignmentMethod = "random",
  pools,
  advancesPerPool = 1,
  courtNames = null, // Tournament Templates' "Default Court Names" — see engines/TournamentTemplateService.js. Applied 1:1 by index; any courts beyond courtNames.length still get the usual "Court N" default
  matchScoringRules = null, // Tournament Templates' "Match Scoring Rules" — captured for reference only, nothing in this app enforces scoring rules yet
}) {
  const now = Date.now();
  const tournament = {
    id: uid(),
    name: name || `${mode === "doubles" ? "Doubles" : "Singles"} ${format === "roundRobin" ? "Round Robin" : format}`,
    sessionCode,
    format,
    mode, // 'singles' | 'doubles'
    courtsCount,
    poolCount,
    assignmentMethod, // 'random' this milestone — see engines/PoolAssignment.js
    pools,
    matchScoringRules,
    // Live court registry — seeded 1..courtsCount, independently editable
    // afterward (rename, add, remove, mark under maintenance) via
    // lib/tournament.js's court-management helpers. Matches no longer come
    // pre-assigned a court at generation time (see RoundRobinScheduler /
    // SingleEliminationBracketGenerator) — CourtAssignmentService is the
    // only thing that sets match.court now.
    courts: Array.from({ length: courtsCount }, (_, i) => makeCourt(i + 1, courtNames?.[i])),
    // Playoff Qualification config — how many of each pool's top finishers
    // advance once every pool completes. Not itself a result: qualifiers
    // are pure derived data (see engines/PoolQualificationService.js),
    // recomputed from this + each pool's standings on every render, same as
    // Standings already are. Validated by the caller (buildAndSave
    // RoundRobinTournament) against every pool's actual size before this
    // runs — this constructor trusts the value it's given.
    advancesPerPool,
    // Playoff Bracket — null until pool play finishes AND the qualified
    // count is a power of two (see RoundRobinEngine.updateMatchResult,
    // which attaches it via SingleEliminationBracketGenerator the moment
    // both are true). Structurally the same { id, status, completedAt,
    // champion, runnerUp, rounds } shape a TournamentPool already has —
    // its lifecycle is owned entirely by PlayoffEngine.js from that point
    // on, independent of tournament.status (which keeps meaning "pool play
    // done," unchanged).
    bracket: null,
    createdAt: now,
    updatedAt: now,
  };
  tournament.status = computeTournamentStatus(tournament);
  return tournament;
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
