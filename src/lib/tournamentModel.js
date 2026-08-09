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
import { defaultMatchScoringRules } from "../engines/TournamentSettings.js";

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
//   startedAt (ms epoch | null) — set when the match starts, see startMatch
//   below (Court Assignment & Match Queue Engine); enables the Live Court
//   Board's Time Running/Estimated Finish. null for every match started
//   before this field existed — those simply show no elapsed time,
//   completedAt (ms epoch | null) — set when a result is saved,
//   status ('pending' | 'inProgress' | 'completed') — real now, see
//   startMatch/updateMatchResult below (Tournament Match Management),
//   queueOverride ({ pinnedCourt: number|null, delayed: boolean } | undefined)
//   — Court Assignment & Match Queue Engine's manual-override state, see
//   engines/CourtAssignmentEngine.js. Absent/undefined on every match by
//   default (read as { pinnedCourt: null, delayed: false } wherever it
//   matters) — nothing here until an organizer explicitly pins or delays.
//   -- Playoff-bracket-match-only additions (Live Playoff Bracket & Match
//   Operations, see engines/PlayoffEngine.js — never set on a pool match):
//   status can also be 'paused'; lastUpdatedAt (ms epoch | undefined) is
//   stamped by every PlayoffEngine mutation (start/pause/resume/complete/
//   walkover), what the Match Detail view's "Last Updated" reads; walkover
//   (true | undefined) marks a match decided by forfeit rather than play.
// }
// matchType: Double Elimination Foundation — see DoubleEliminationEngine.js.
// Purely descriptive, not read by anything yet; every pool match is
// "roundRobin" (the only kind this function ever builds).
export function makeMatch({ round, court, teamA, teamB, isBye = false }) {
  return {
    id: uid(),
    round,
    court,
    teamA,
    teamB: isBye ? null : teamB,
    isBye,
    matchType: "roundRobin",
    winner: null,
    score: { teamA: null, teamB: null },
    startedAt: null,
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
//
// Standalone Double Elimination (tournament.format === "doubleElimination",
// see lib/tournament.js's buildAndSaveDoubleEliminationTournament) has no
// pools at all — `tournament.pools` is always `[]` for it, which would
// otherwise make the check above vacuously "every pool completed" (an
// empty array's `.every()` is true) the instant the tournament is created,
// before a single match is played. Status is derived from
// tournament.doubleEliminationBracket instead for that format; Round Robin
// (and a Round Robin tournament that later attaches a Double Elimination
// PLAYOFF bracket via tournament.bracketFormat) is completely unaffected —
// this branch only ever applies to a standalone Double Elimination format.
export function computeTournamentStatus(tournament) {
  if (tournament.format === "doubleElimination") {
    return computeDoubleEliminationBracketStatus(tournament.doubleEliminationBracket);
  }
  const statuses = tournament.pools.map((p) => p.status);
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.some((s) => s === "running" || s === "completed")) return "running";
  return "ready";
}

// Standalone Double Elimination's own status rollup — 'ready' before the
// bracket exists; 'running' once any Winners/Losers Bracket match has
// started or finished, or Grand Final Game 1 is seated; 'completed' only
// once the Grand Final (including a Game 2 reset, if one was triggered) has
// a champion. Deliberately reads directly off the bracket's own three
// sub-statuses rather than re-deriving from raw matches — those are already
// correct (see DoubleEliminationEngine.updateWinnersBracket/
// updateLosersBracket/updateGrandFinal), this only rolls them up one level.
export function computeDoubleEliminationBracketStatus(bracket) {
  if (!bracket) return "ready";
  if (bracket.grandFinal.status === "completed") return "completed";
  const anyStarted =
    bracket.winnersBracket.status !== "ready" ||
    bracket.losersBracket.status !== "ready" ||
    bracket.grandFinal.status !== "pending";
  return anyStarted ? "running" : "ready";
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
// "paused" (Live Playoff Bracket & Match Operations — playoff matches only,
// see engines/PlayoffEngine.js's pauseMatch/resumeMatch) counts as
// "underway" for round rollup purposes here, same as "inProgress" — a
// paused match hasn't finished, it's just not actively being played right
// now, so a round containing one still isn't merely "pending". Pool
// matches never carry this status, so this is inert for every existing
// caller.
export function computeRoundStatus(matches) {
  const real = matches.filter((m) => !m.isBye);
  if (real.length === 0) return "completed";
  if (real.every((m) => m.status === "completed")) return "completed";
  if (real.some((m) => m.status === "inProgress" || m.status === "paused" || m.status === "completed")) return "inProgress";
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
//
// Standalone Double Elimination has no pools (see computeTournamentStatus's
// own comment above for why) — delegates to getDoubleEliminationProgress
// instead, which counts real (non-null-team) Winners/Losers Bracket
// matches plus Grand Final Game 1/Game 2. Round Robin is unaffected.
export function getTournamentProgress(tournament) {
  if (tournament.format === "doubleElimination") {
    return getDoubleEliminationProgress(tournament.doubleEliminationBracket);
  }
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

// Standalone Double Elimination's own progress derivation. Only counts
// matches that actually exist to be played — a Losers Bracket/Grand Final
// slot that hasn't been seated yet (both teams still null) isn't a real
// match yet, the same "not playable until populated" invariant
// CourtAssignmentService.getPlayableMatches already enforces for court
// assignment; counting it here too would make "Total Matches" overstate
// what's actually ever going to be played whenever a bracket doesn't reach
// a Grand Final Reset.
export function getDoubleEliminationProgress(bracket) {
  if (!bracket) return { total: 0, completed: 0, remaining: 0, percent: 0 };
  const realMatches = [
    ...bracket.winnersBracket.rounds.flatMap((r) => r.matches),
    ...bracket.losersBracket.rounds.flatMap((r) => r.matches),
    bracket.grandFinal.game1,
    ...(bracket.grandFinal.game2 ? [bracket.grandFinal.game2] : []),
  ].filter((m) => m.teamA && m.teamB);
  const total = realMatches.length;
  const completed = realMatches.filter((m) => m.status === "completed").length;
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
      const matches = r.matches.map((m) => (m.id === matchId ? { ...m, status: "inProgress", startedAt: Date.now() } : m));
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
// status: 'available' | 'maintenance' | 'disabled' — 'disabled' added by the
// Court Assignment & Match Queue Engine (see PROJECT.md), for a court taken
// permanently out of rotation rather than temporarily under maintenance;
// CourtAssignmentService treats both the same way for occupancy/availability
// purposes (never assignable), the UI is what distinguishes them for the
// organizer.
export function makeCourt(number, name) {
  return { id: uid(), number, name: name || `Court ${number}`, status: "available" };
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
  entrants = null, // Standalone Double Elimination only — see lib/tournament.js's buildAndSaveDoubleEliminationTournament. Round Robin (and any tournament with pools) keeps its entrants nested per-pool exactly as before; this is null for every non-standalone-Double-Elimination tournament. Needed because resolvePlayerIds (lib/tournament.js) has to look SOMEWHERE for a bracket team's underlying playerIds when there are no pools to search.
  advancesPerPool = 1,
  courtNames = null, // Tournament Templates' "Default Court Names" — see engines/TournamentTemplateService.js. Applied 1:1 by index; any courts beyond courtNames.length still get the usual "Court N" default
  matchScoringRules = null, // Tournament Settings' Match Rules — { matchFormat, winningScore, winByTwo }, captured for reference only, nothing in this app enforces scoring rules yet. Defaults via TournamentSettings.defaultMatchScoringRules() if not given
  playoffEnabled = true, // Tournament Settings' Playoff Settings — real behavior: gates RoundRobinEngine's auto-generate-bracket step
  autoDetectPlayoffStage = true, // captured for reference only — see TournamentSettings.js header comment
  manualPlayoffStage = null, // only meaningful when autoDetectPlayoffStage is false; captured for reference only
  bronzeMatchEnabled = false, // Bronze Medal Match — real behavior: gates PlayoffBracketGenerator attaching bracket.bronzeMatch. Editable via the Settings tab only (same precedent playoffEnabled already set), locked once playoffs start.
  seedingMethod = "standardCrossPool", // Manual & Advanced Seeding — real behavior: selects a BracketSeeding.js strategy; only "standardCrossPool" auto-generates on pool completion (see RoundRobinEngine.updateMatchResult), every other method waits for an explicit Generate Bracket action.
  manualSeeds = null, // { [participantId]: seedNumber } — only meaningful when seedingMethod === "manual", captured by the Seeding page. null (not {}) when never touched, so "has the organizer started assigning seeds" is distinguishable from "assigned zero seeds."
  qualificationMethod = "standard", // Advanced Qualification — real behavior: selects PoolQualificationService's extra-qualifier logic ("standard" | "wildCard" | "bestThirdPlace"). Editable via the Settings tab only, locked once playoffs start.
  wildCardCount = 1, // only meaningful when qualificationMethod === "wildCard" — 1 | 2 | 4, per Tournament Settings
  bestThirdPlaceCount = 1, // only meaningful when qualificationMethod === "bestThirdPlace" — capped at poolCount (one 3rd-place candidate per pool)
  allowManualQualificationOverride = false, // Manual Qualification Override — real behavior: gates both the promote/eliminate/replace/reset actions AND (like non-standard seeding) whether the bracket auto-generates on pool completion. Editable via the Settings tab only, locked once playoffs start.
  placementMatches = "disabled", // Consolation & Placement Brackets — "disabled" | "bronzeOnly" | "consolationBracket" | "fullPlacement". Only "consolationBracket"/"fullPlacement" build tournament.consolationBracket (identical for now — 9th-16th place isn't implemented this milestone); completely independent of bronzeMatchEnabled, which keeps its own pre-existing meaning unchanged.
  bracketFormat = "singleElimination", // Double Elimination Foundation — "singleElimination" (default, existing PlayoffBracketGenerator) | "doubleElimination" (new DoubleEliminationEngine, builds tournament.doubleEliminationBracket instead of tournament.bracket). Picks which engine builds the PLAYOFF bracket after pool qualification — pool play/scheduling (tournament.format) is completely untouched by this setting.
  venueId = null, // Phase 0: Multi-Tenant Foundation, see lib/venueModel.js — architecture-only, nothing reads this yet. Covers both a plain Tournament and a League Season, since a season is built via this same factory (see lib/leagueModel.js).
}) {
  const now = Date.now();
  const tournament = {
    id: uid(),
    name: name || `${mode === "doubles" ? "Doubles" : "Singles"} ${format === "roundRobin" ? "Round Robin" : format}`,
    sessionCode,
    venueId,
    format,
    mode, // 'singles' | 'doubles'
    courtsCount,
    poolCount,
    assignmentMethod, // 'random' this milestone — see engines/PoolAssignment.js
    pools,
    entrants,
    matchScoringRules: matchScoringRules ?? defaultMatchScoringRules(),
    playoffEnabled,
    autoDetectPlayoffStage,
    manualPlayoffStage,
    bronzeMatchEnabled,
    seedingMethod,
    manualSeeds,
    qualificationMethod,
    wildCardCount,
    bestThirdPlaceCount,
    allowManualQualificationOverride,
    // manualOverrides: { [participantId]: "promoted" | "eliminated" } — the
    // live delta PoolQualificationService.applyManualOverrides layers on
    // top of the automatic/Wild Card/Best Third Place result. null (not {})
    // until the first override, so "no overrides yet" is distinguishable
    // from "overrides exist but happen to be empty."
    manualOverrides: null,
    // qualificationLocked: an explicit organizer action ("Lock Qualification
    // List"), separate from bracket generation itself — set once, never
    // unset in this milestone. Blocks promote/eliminate/replace/reset the
    // same way tournament.bracket existing already does.
    qualificationLocked: false,
    // Live court registry — seeded 1..courtsCount, independently editable
    // afterward (rename, add, remove, mark under maintenance) via
    // lib/tournament.js's court-management helpers. Matches no longer come
    // pre-assigned a court at generation time (see RoundRobinScheduler /
    // PlayoffBracketGenerator) — CourtAssignmentService is the
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
    // which attaches it via PlayoffBracketGenerator the moment
    // both are true). Structurally the same { id, status, completedAt,
    // champion, runnerUp, rounds } shape a TournamentPool already has —
    // its lifecycle is owned entirely by PlayoffEngine.js from that point
    // on, independent of tournament.status (which keeps meaning "pool play
    // done," unchanged).
    bracket: null,
    // Consolation & Placement Brackets — see PROJECT.md. A sibling of
    // `bracket`, not nested inside it — the exact same Bracket shape
    // ({ rounds, bronzeMatch, champion, runnerUp, thirdPlace, fourthPlace }),
    // fed by tournament.bracket's own first-round LOSERS instead of pool
    // qualifiers. That shape reuse is what lets PlayoffEngine's existing
    // startMatch/updateBracket/bronze-match logic operate on it completely
    // unchanged — champion/runnerUp/thirdPlace/fourthPlace here just mean
    // 5th/6th/7th/8th place instead of 1st-4th. null until
    // PlayoffBracketGenerator attaches one (only when tournament.
    // placementMatches is "consolationBracket"/"fullPlacement" AND the
    // championship bracket has a real round before the semifinal to draw
    // losers from).
    placementMatches,
    consolationBracket: null,
    bracketFormat,
    // Double Elimination Foundation — see PROJECT.md / DoubleEliminationEngine.js.
    // A sibling of `bracket`, never populated at the same time as it (a
    // tournament's playoff bracket is either single- or double-elimination,
    // never both) — kept as its own field rather than overloading `bracket`
    // so `bracket`'s existing shape/consumers (PlayoffEngine et al.) stay
    // completely untouched. null until DoubleEliminationEngine.generateBracket
    // attaches one (only when bracketFormat === "doubleElimination", via an
    // explicit organizer action — no auto-generation this milestone).
    doubleEliminationBracket: null,
    // Next Match (facilitator announcement) — see lib/tournament.js's
    // saveSetNextMatch/saveClearNextMatch. Purely a facilitator designation
    // for what to announce next; never read by scheduling, standings, or
    // any engine. null until the organizer picks a pending match; cleared
    // automatically once that match completes or stops being a valid
    // pending match (see saveMatchResult/saveMatchStart).
    nextMatchId: null,
    createdAt: now,
    updatedAt: now,
    // Tournament Reports & History — additive, default false. See
    // saveTournament's header comment for how this locks the record once
    // set; qualificationFinalizedAt (stamped by RoundRobinEngine the moment
    // every pool first completes) and bracket.generatedAt (stamped when
    // PlayoffBracketGenerator's result is attached) are the other
    // two additive fields this task adds, both absent until their event
    // actually happens — used by TournamentReportService.generateTournamentTimeline.
    archived: false,
  };
  tournament.status = computeTournamentStatus(tournament);
  return tournament;
}

// Tournament Reports & History — `archived` (additive, default false) marks
// a completed tournament as locked for good: every mutating save* wrapper in
// lib/tournament.js funnels through this one function, so this is the single
// chokepoint that makes an archived tournament read-only everywhere at once,
// rather than needing a guard in every engine call site. The one legitimate
// write to an already-archived record is the archive action itself (see
// TournamentHistoryService.archiveTournament + lib/tournament.js's
// saveArchiveTournament), which passes { allowArchived: true } explicitly.
export async function saveTournament(tournament, { allowArchived = false } = {}) {
  if (tournament.archived && !allowArchived) {
    throw new Error("This tournament is archived and read-only.");
  }
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

// Tournament History — same fetchAll* pattern as leagueModel.js/
// playerDatabase.js/ratingModel.js: list every key under the prefix, fetch
// and parse each record, drop anything that fails to parse.
export async function fetchAllTournaments() {
  const { keys } = await window.storage.list(TOURNAMENT_PREFIX, true);
  const records = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null;
      }
    })
  );
  return records.filter(Boolean);
}

export async function deleteTournament(id) {
  await window.storage.delete(`${TOURNAMENT_PREFIX}${id}`, true);
}
