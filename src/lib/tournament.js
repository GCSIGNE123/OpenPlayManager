// Orchestration glue between a session's registered players and the Round
// Robin engine — builds entrants (Singles: one per player; Doubles: one per
// team, paired via RoundRobinScheduler.pairIntoTeams), splits them into
// pools (Round Robin Pool Support), generates each pool's own schedule, and
// persists the whole thing as its own Tournament record. Kept separate from
// lib/tournamentModel.js (pure data shapes + storage) and
// engines/RoundRobinScheduler.js (the scheduling algorithm itself, called
// once per pool — it has no idea pools exist), which don't need to know
// anything about session players.
import { makeEntrant, makeTournament, makeTournamentPool, makeCourt, saveTournament, startMatch, findMatch, deleteTournament } from "./tournamentModel.js";
import { TournamentHistoryService } from "../engines/TournamentHistoryService.js";
import { generateRoundRobinSchedule, pairIntoTeams } from "../engines/RoundRobinScheduler.js";
import { assignPools, poolLabel } from "../engines/PoolAssignment.js";
import { RoundRobinEngine } from "../engines/RoundRobinEngine.js";
import { SingleEliminationEngine } from "../engines/SingleEliminationEngine.js";
import { DoubleEliminationEngine } from "../engines/DoubleEliminationEngine.js";
import { PlayoffEngine } from "../engines/PlayoffEngine.js";
import { CourtAssignmentService } from "../engines/CourtAssignmentService.js";
import { CourtAssignmentEngine } from "../engines/CourtAssignmentEngine.js";
import { TournamentRulesService } from "../engines/TournamentRulesService.js";
import { RatingEngine } from "../engines/RatingEngine.js";
import { AchievementService } from "../engines/AchievementService.js";
import { PoolQualificationService } from "../engines/PoolQualificationService.js";
import { fetchPlayer } from "./playerDatabase.js";

const playoffEngine = new PlayoffEngine();
const courtAssignmentService = new CourtAssignmentService();
const courtAssignmentEngine = new CourtAssignmentEngine();
const rulesService = new TournamentRulesService();
const ratingEngine = new RatingEngine();
const achievementService = new AchievementService();
const qualificationService = new PoolQualificationService();
const historyService = new TournamentHistoryService();

// A pool match's teamA/teamB are full Participant objects (id, playerIds).
// A bracket match's teamA/teamB are SeededTeam objects (participantId,
// label — playerIds isn't carried through bracket seeding, see
// BracketSeeding.js/SingleEliminationBracketGenerator.js), so their
// underlying playerIds have to be looked back up from the original pool
// entrant they came from, matched by participantId.
function resolvePlayerIds(tournament, team) {
  if (team.playerIds) return team.playerIds; // pool match — already a Participant
  const participantId = team.participantId;
  for (const pool of tournament.pools || []) {
    const entrant = pool.entrants.find((e) => e.id === participantId);
    if (entrant) return entrant.playerIds;
  }
  return [];
}

// Club Rating & Ranking Engine — the one hook point every completed
// pool/bracket match funnels through. Awaited (not truly fire-and-forget)
// so King Slayer/Tournament Champion checks that run right after always
// see fully-updated ratings — but any rating-side error still can't
// corrupt the tournament record itself, since this only ever writes to
// separate opl-playerrating-*/opl-ratinghistory-*/opl-achievement-* keys,
// never to the tournament object saveTournament persists. Silently skips
// any participant without a Player Database id, per RatingEngine's own
// documented identity constraint.
// Exported so lib/league.js's saveLeagueMatchResult can reuse this exact
// hook (source: "league") instead of duplicating it — a LeagueSeason's
// matches are plain pool matches (Participant teamA/teamB, playerIds
// already present), so this needs no changes to also work there.
export async function rateMatch(tournament, match, source) {
  if (!match.teamA || !match.teamB || match.winner == null) return;
  const teamAId = match.teamA.id ?? match.teamA.participantId;
  const winnerIsA = match.winner === teamAId;
  const winnerIds = resolvePlayerIds(tournament, winnerIsA ? match.teamA : match.teamB);
  const loserIds = resolvePlayerIds(tournament, winnerIsA ? match.teamB : match.teamA);

  // King Slayer — "was this loser the #1 ranked player" has to be checked
  // BEFORE processMatchResult below updates anyone's rating, or the
  // just-defeated #1 could already have moved off the top by the time
  // it's checked.
  const loserWasTopRanked = (await Promise.all(loserIds.map((id) => ratingEngine.isTopRanked(id)))).some(Boolean);

  const rated = await ratingEngine.processMatchResult({ winnerIds, loserIds, matchId: match.id, source });
  for (const { playerId, result, rating } of rated) {
    if (result === "win") await achievementService.awardAchievements(playerId, { totalWins: rating.wins });
  }
  if (loserWasTopRanked) {
    for (const winnerId of winnerIds) {
      const player = await fetchPlayer(winnerId);
      if (player) await achievementService.awardKingSlayer(winnerId, loserIds[0], match.id);
    }
  }
}

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
  courtNames = null, // Tournament Templates' "Default Court Names" — see makeTournament
  matchScoringRules = null, // Tournament Templates' "Match Scoring Rules" — see makeTournament
}) {
  const entrants = buildEntrants(players, mode);
  const groups = assignPools(entrants, poolCount, assignmentMethod);
  // "Teams Advancing Per Pool" can't exceed the smallest pool's size, and
  // (Pool Qualification Engine) at least one qualifier is required — the
  // UI already blocks both before Generate is even clickable, this is the
  // belt to that suspenders. Reuses PoolQualificationService.validateQualifiers
  // rather than re-deriving these same two rules here.
  qualificationService.validateQualifiers(
    groups.map((g) => ({ entrants: g })),
    advancesPerPool
  );
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
    courtNames,
    matchScoringRules,
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

// Court Assignment & Match Queue Engine — "when a court becomes available,
// automatically assign the highest-priority eligible match" — completing a
// match frees its court (see CourtAssignmentService's "derived occupancy"
// header comment: a completed match's court reads as free without any
// explicit release), so this is the actual trigger point. The just-
// completed match still carries its own `.court` field (only its status
// changed), so the freed court number is read straight off the result
// updateMatchResult returns.
export async function saveMatchResult(tournament, matchId, result) {
  const engine = getTournamentEngine(tournament.format);
  const updated = engine.updateMatchResult(tournament, matchId, result);
  const { match } = findMatch(updated, matchId);
  const withAutoFill = match.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (!match.isBye) await rateMatch(updated, match, tournament.format === "league" ? "league" : "tournament");
  return saveTournament(withAutoFill);
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

// Same auto-fill trigger as saveMatchResult above, for the bracket side —
// see that function's comment for why the freed court is read straight off
// the just-completed match.
export async function savePlayoffMatchResult(tournament, matchId, result) {
  const bracket = playoffEngine.updateBracket(tournament.bracket, matchId, result);
  const match = bracket.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
  const updated = { ...tournament, bracket };
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(updated, match, "tournament");
  // Tournament Champion — awarded the moment the championship match
  // completes the whole bracket, to every one of the champion team's
  // underlying players (both, for doubles).
  if (bracket.status === "completed" && bracket.champion) {
    const championIds = resolvePlayerIds(updated, bracket.champion);
    for (const playerId of championIds) {
      const player = await fetchPlayer(playerId);
      if (player) await achievementService.awardTournamentChampion(playerId, tournament.id);
    }
  }
  return saveTournament(withAutoFill);
}

// Round Robin Playoff Engine — see PROJECT.md. Same "call the engine,
// persist what it returns" shape as every other save* function in this
// file; PlayoffEngine.reopenBracket does the actual unlocking.
export async function saveReopenBracket(tournament) {
  const bracket = playoffEngine.reopenBracket(tournament.bracket);
  return saveTournament({ ...tournament, bracket });
}

// ---- Live Playoff Bracket & Match Operations ----
// Same "call the engine, persist what it returns" shape as every other
// save* function in this file. "Move a match to a different court" is
// already fully covered by saveCourtReassignment below (CourtAssignmentService
// is generic over pool AND bracket matches already), so there's no separate
// "change court" wrapper here — PlayoffMatchService.changeCourt exists for
// a caller that wants it as one method, but the UI reuses saveCourtReassignment
// directly, same as the Courts tab already does.

export async function savePauseMatch(tournament, matchId) {
  const bracket = playoffEngine.pauseMatch(tournament.bracket, matchId);
  return saveTournament({ ...tournament, bracket });
}

export async function saveResumeMatch(tournament, matchId) {
  const bracket = playoffEngine.resumeMatch(tournament.bracket, matchId);
  return saveTournament({ ...tournament, bracket });
}

// Same auto-fill-freed-court + rating/achievement hooks savePlayoffMatchResult
// already applies to a normal result — a walkover is still a real completed
// match as far as the rest of the tournament is concerned, just decided by
// forfeit rather than play.
export async function saveWalkover(tournament, matchId, winnerId) {
  const bracket = playoffEngine.recordWalkover(tournament.bracket, matchId, winnerId);
  const match = bracket.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
  const updated = { ...tournament, bracket };
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(updated, match, "tournament");
  if (bracket.status === "completed" && bracket.champion) {
    const championIds = resolvePlayerIds(updated, bracket.champion);
    for (const playerId of championIds) {
      const player = await fetchPlayer(playerId);
      if (player) await achievementService.awardTournamentChampion(playerId, tournament.id);
    }
  }
  return saveTournament(withAutoFill);
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

// Court Assignment & Match Queue Engine: release + auto-fill as one action
// (see CourtAssignmentEngine.releaseAndAutoFill) — a manual "Release" click
// immediately offers the freed court to the next queued match, same as a
// match completing naturally does.
export async function saveCourtRelease(tournament, courtNumber) {
  const updated = courtAssignmentEngine.releaseAndAutoFill(tournament, courtNumber);
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

// ---- Court Assignment & Match Queue Engine: manual override ----
// Same "call the engine, persist what it returns" shape as every other
// save* function in this file; CourtAssignmentEngine does the actual work.

export async function saveSwapCourts(tournament, courtNumberA, courtNumberB) {
  const updated = courtAssignmentEngine.swapCourts(tournament, courtNumberA, courtNumberB);
  return saveTournament(updated);
}

export async function saveDelayMatch(tournament, matchId) {
  const updated = courtAssignmentEngine.delayMatch(tournament, matchId);
  return saveTournament(updated);
}

export async function saveUndelayMatch(tournament, matchId) {
  const updated = courtAssignmentEngine.undelayMatch(tournament, matchId);
  return saveTournament(updated);
}

export async function savePinMatch(tournament, matchId, courtNumber) {
  const updated = courtAssignmentEngine.pinMatchToCourt(tournament, matchId, courtNumber);
  return saveTournament(updated);
}

export async function saveUnpinMatch(tournament, matchId) {
  const updated = courtAssignmentEngine.unpinMatch(tournament, matchId);
  return saveTournament(updated);
}

// ---- Tournament Settings ----
// changes: Partial<SettingsView> (see engines/TournamentSettings.js) — only
// the keys being edited. TournamentRulesService.updateSettings validates
// and throws on any currently-locked field; this is a thin persist wrapper,
// the same "call the service, saveTournament what it returns" shape every
// other save* function in this file already uses.
export async function saveTournamentSettings(tournament, changes) {
  const updated = rulesService.updateSettings(tournament, changes);
  return saveTournament(updated);
}

// ---- Tournament Reports & History ----
// The one save* wrapper in this file that passes { allowArchived: true } —
// every other wrapper relies on saveTournament's default (false) to reject
// writes to an already-archived record, which is exactly what keeps an
// archived tournament read-only everywhere else.
export async function saveArchiveTournament(tournament) {
  const updated = historyService.archiveTournament(tournament);
  return saveTournament(updated, { allowArchived: true });
}

export async function removeTournament(id) {
  return deleteTournament(id);
}
