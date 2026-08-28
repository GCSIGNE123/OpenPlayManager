// Orchestration glue between a session's registered players and the Round
// Robin engine — builds entrants (Singles: one per player; Doubles: one per
// team, paired via RoundRobinScheduler.pairIntoTeams), splits them into
// pools (Round Robin Pool Support), generates each pool's own schedule, and
// persists the whole thing as its own Tournament record. Kept separate from
// lib/tournamentModel.js (pure data shapes + storage) and
// engines/RoundRobinScheduler.js (the scheduling algorithm itself, called
// once per pool — it has no idea pools exist), which don't need to know
// anything about session players.
import { makeEntrant, makeTournament, makeTournamentPool, makeCourt, saveTournament, startMatch, findMatch, deleteTournament, computeTournamentStatus } from "./tournamentModel.js";
import { uid } from "./random.js";
import { TournamentHistoryService } from "../engines/TournamentHistoryService.js";
import { generateRoundRobinSchedule, pairIntoTeams } from "../engines/RoundRobinScheduler.js";
import { assignPools, poolLabel } from "../engines/PoolAssignment.js";
import { RoundRobinEngine } from "../engines/RoundRobinEngine.js";
import { SingleEliminationEngine } from "../engines/SingleEliminationEngine.js";
import { DoubleEliminationEngine } from "../engines/DoubleEliminationEngine.js";
import { PlayoffEngine } from "../engines/PlayoffEngine.js";
import { CourtAssignmentService, collectMatches } from "../engines/CourtAssignmentService.js";
import { CourtAssignmentEngine } from "../engines/CourtAssignmentEngine.js";
import { TournamentRulesService } from "../engines/TournamentRulesService.js";
import { RatingEngine } from "../engines/RatingEngine.js";
import { AchievementService } from "../engines/AchievementService.js";
import { PoolQualificationService } from "../engines/PoolQualificationService.js";
import { PlayoffBracketGenerator } from "../engines/PlayoffBracketGenerator.js";
import { PlayoffAdvancementService } from "../engines/PlayoffAdvancementService.js";
import { PlacementBracketService } from "../engines/PlacementBracketService.js";
import { getSeedingStrategy } from "../engines/BracketSeeding.js";
import { QualificationAuditService } from "../engines/QualificationAuditService.js";
import { fetchPlayerRating } from "./ratingModel.js";
import { fetchPlayer } from "./playerDatabase.js";

const playoffEngine = new PlayoffEngine();
const bracketGenerator = new PlayoffBracketGenerator();
const doubleEliminationEngine = new DoubleEliminationEngine();
const advancementService = new PlayoffAdvancementService();
const placementService = new PlacementBracketService();
const courtAssignmentService = new CourtAssignmentService();
const courtAssignmentEngine = new CourtAssignmentEngine();
const rulesService = new TournamentRulesService();
const ratingEngine = new RatingEngine();
const achievementService = new AchievementService();
const qualificationService = new PoolQualificationService();
const historyService = new TournamentHistoryService();
const qualificationAuditService = new QualificationAuditService();

// A pool match's teamA/teamB are full Participant objects (id, playerIds).
// A bracket match's teamA/teamB are SeededTeam objects (participantId,
// label — playerIds isn't carried through bracket seeding, see
// BracketSeeding.js/PlayoffBracketGenerator.js), so their
// underlying playerIds have to be looked back up from the original pool
// entrant they came from, matched by participantId.
export function resolvePlayerIds(tournament, team) {
  if (team.playerIds) return team.playerIds; // pool match — already a Participant
  const participantId = team.participantId;
  for (const pool of tournament.pools || []) {
    const entrant = pool.entrants.find((e) => e.id === participantId);
    if (entrant) return entrant.playerIds;
  }
  // Standalone Double Elimination — see buildAndSaveDoubleEliminationTournament
  // below. No pools exist to search; entrants live directly on the
  // tournament instead (tournamentModel.js's makeTournament `entrants` field).
  for (const entrant of tournament.entrants || []) {
    if (entrant.id === participantId) return entrant.playerIds;
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

// Standalone Double Elimination — see PROJECT.md/FEATURES.md. Deliberately
// NOT built on RoundRobinScheduler/pools at all: a Double Elimination
// bracket is generated directly from registered/checked-in entrants, with
// NO Round Robin pool stage first (that's the explicit design decision —
// contrast with tournament.bracketFormat === "doubleElimination", which
// still requires Round Robin pools to complete and qualify first). Both
// paths share the exact same DoubleEliminationEngine/tournament.
// doubleEliminationBracket shape and progression logic — this function only
// handles getting straight from a roster to a real Winners+Losers Bracket +
// Grand Final, with no qualification step in between.
//
// Seeding — reuses the existing seeding strategies (BracketSeeding.js)
// exactly as instructed, not a new mechanism: "Standard Cross-Pool" and
// "Snake" both require pool rank/poolLabel data that doesn't exist without
// a pool stage, so only the three pool-agnostic strategies are valid here —
// "random" (the default), "rating" (seeds by each entrant's current Club
// Rating, falling back to random if none exist), and "manual" (organizer-
// assigned seed numbers, same ManualSeedingStrategy/validateSeeds the
// post-Round-Robin playoff path already uses).
export async function buildAndSaveDoubleEliminationTournament({
  sessionCode,
  players,
  mode,
  courtsCount,
  seedingMethod = "random",
  seedContext = {},
}) {
  const entrants = buildEntrants(players, mode);
  const size = entrants.length;
  if (size < 4 || (size & (size - 1)) !== 0) {
    throw new Error(`Double Elimination requires a power-of-two team count of at least 4 (4, 8, 16, ...) — currently ${size}.`);
  }
  if (!["random", "rating", "manual"].includes(seedingMethod)) {
    throw new Error(`Seeding method "${seedingMethod}" needs pool data a standalone Double Elimination bracket doesn't have — use "random", "rating", or "manual".`);
  }

  // Same QualifiedTeam shape PoolQualificationService.determineQualifiers
  // produces (rank/poolLabel are simply null here — nothing about a
  // standalone bracket has pools to derive them from), so BracketSeeding.js's
  // existing strategies work completely unchanged.
  const seedableTeams = entrants.map((e) => ({
    poolId: null,
    poolLabel: null,
    rank: null,
    participantId: e.id,
    label: e.label,
    qualificationType: "standalone",
  }));
  const strategy = getSeedingStrategy(seedingMethod);
  const validation = strategy.validateSeeds(seedableTeams, seedContext);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const winnersRounds = doubleEliminationEngine.createWinnersBracket(seedableTeams, seedingMethod, seedContext);
  const losersRounds = doubleEliminationEngine.createLosersBracket(size);
  const grandFinal = doubleEliminationEngine.createGrandFinal();

  const tournament = makeTournament({
    sessionCode,
    format: "doubleElimination",
    mode,
    courtsCount,
    poolCount: 0,
    assignmentMethod: "random",
    pools: [],
    entrants,
    advancesPerPool: 0,
    seedingMethod,
  });
  tournament.doubleEliminationBracket = {
    id: uid(),
    status: "ready",
    completedAt: null,
    winnersBracket: { id: uid(), size, status: "ready", rounds: winnersRounds, champion: null, runnerUp: null },
    losersBracket: { id: uid(), size, status: "ready", rounds: losersRounds, champion: null, runnerUp: null },
    grandFinal,
  };
  tournament.status = computeTournamentStatus(tournament);
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
  const withNextMatchCleared =
    withAutoFill.nextMatchId === matchId ? { ...withAutoFill, nextMatchId: null } : withAutoFill;
  return saveTournament(withNextMatchCleared);
}

// Next Match (facilitator announcement) — purely a facilitator designation
// for the Round Robin match to announce next. Never touches scheduling,
// standings, or match data itself; only stamps tournament.nextMatchId, the
// same "call something small, saveTournament what it returns" shape every
// other wrapper here uses. Only a pending match already found in the
// schedule can be designated — picking a different match simply replaces
// the field (only one value can ever be stored, so there is only ever one
// Next Match). Cleared automatically once that match completes (see
// saveMatchResult above) or becomes invalid (saveClearNextMatch, for the
// organizer/UI to call defensively if the match disappears, e.g. a
// schedule regeneration).
// Uses collectMatches (not the pools-only findMatch above) so a Next Match
// designation works from anywhere a pending match can appear — the Schedule
// tab's Round Robin pool matches AND the Courts tab's Match Queue, which
// also surfaces bracket/consolation/Double Elimination matches once those
// formats reach a live tournament with a Match Queue. teamA/teamB must both
// already be known (same "actually playable" gate CourtAssignmentService.
// getPlayableMatches uses) — a bracket slot that hasn't been seated yet
// can't be announced as a name-bearing "Next Match".
export async function saveSetNextMatch(tournament, matchId) {
  const entry = collectMatches(tournament).find((e) => e.match.id === matchId);
  if (!entry || entry.match.isBye || entry.match.status !== "pending" || !entry.match.teamA || !entry.match.teamB) {
    throw new Error("Only a pending match can be set as Next Match.");
  }
  return saveTournament({ ...tournament, nextMatchId: matchId });
}

export async function saveClearNextMatch(tournament) {
  if (tournament.nextMatchId == null) return tournament;
  return saveTournament({ ...tournament, nextMatchId: null });
}

// ---- Playoff Match Management & Winner Advancement ----
// Same "call the engine, persist what it returns" shape as saveMatchStart/
// saveMatchResult above, but scoped to tournament.bracket via PlayoffEngine
// rather than tournament.pools via startMatch/RoundRobinEngine — a
// completely separate engine (see PlayoffEngine.js's file header for why).

// Consolation & Placement Brackets — see PlacementBracketService.js. A
// given matchId lives in EITHER tournament.bracket OR
// tournament.consolationBracket (never both — the two brackets partition
// participants) — every save* below that used to assume `tournament.bracket`
// unconditionally now resolves which sibling field actually holds it first.
function matchExistsInBracket(bracket, matchId) {
  if (!bracket) return false;
  if (bracket.rounds.some((r) => r.matches.some((m) => m.id === matchId))) return true;
  return bracket.bronzeMatch?.id === matchId;
}

function resolveBracketField(tournament, matchId) {
  if (matchExistsInBracket(tournament.bracket, matchId)) return "bracket";
  if (matchExistsInBracket(tournament.consolationBracket, matchId)) return "consolationBracket";
  throw new Error("Match not found.");
}

export async function savePlayoffMatchStart(tournament, matchId) {
  const field = resolveBracketField(tournament, matchId);
  const bracket = playoffEngine.startMatch(tournament[field], matchId);
  return saveTournament({ ...tournament, [field]: bracket });
}

// Same auto-fill trigger as saveMatchResult above, for the bracket side —
// see that function's comment for why the freed court is read straight off
// the just-completed match.
export async function savePlayoffMatchResult(tournament, matchId, result) {
  const field = resolveBracketField(tournament, matchId);
  const before = tournament[field];
  const found = before.rounds.find((r) => r.matches.some((m) => m.id === matchId));
  const wasChampionshipFirstRound = field === "bracket" && found?.roundNumber === 1;
  const priorMatch = wasChampionshipFirstRound ? found.matches.find((m) => m.id === matchId) : null;

  const bracket = playoffEngine.updateBracket(before, matchId, result, { seriesFormat: tournament.matchScoringRules?.matchFormat });
  // Bronze Medal Match is a sibling field, not a round inside bracket.rounds
  // (see PlayoffBracketGenerator's header comment) — checked as a fallback
  // so its own completion still gets court auto-fill/rating credit.
  const match = bracket.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId) ?? (bracket.bronzeMatch?.id === matchId ? bracket.bronzeMatch : null);
  let updated = { ...tournament, [field]: bracket };

  // Consolation & Placement Brackets — a completed championship FIRST-round
  // match seats its loser straight into the consolation bracket's round 1,
  // the moment the result is saved — see PlacementBracketService.
  // seatConsolationParticipant's own comment for the shared adjacency math.
  if (wasChampionshipFirstRound && updated.consolationBracket) {
    const winnerId = match.winner;
    const loserTeam = winnerId === priorMatch.teamA.participantId ? priorMatch.teamB : priorMatch.teamA;
    const consolationBracket = placementService.seatConsolationParticipant(updated.consolationBracket, match.matchNumber, loserTeam, advancementService);
    updated = { ...updated, consolationBracket };
  }

  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(updated, match, "tournament");
  // Tournament Champion — awarded the moment the championship match
  // completes the whole bracket, to every one of the champion team's
  // underlying players (both, for doubles).
  if (field === "bracket" && bracket.status === "completed" && bracket.champion) {
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
  const field = resolveBracketField(tournament, matchId);
  const bracket = playoffEngine.pauseMatch(tournament[field], matchId);
  return saveTournament({ ...tournament, [field]: bracket });
}

export async function saveResumeMatch(tournament, matchId) {
  const field = resolveBracketField(tournament, matchId);
  const bracket = playoffEngine.resumeMatch(tournament[field], matchId);
  return saveTournament({ ...tournament, [field]: bracket });
}

// Same auto-fill-freed-court + rating/achievement hooks savePlayoffMatchResult
// already applies to a normal result — a walkover is still a real completed
// match as far as the rest of the tournament is concerned, just decided by
// forfeit rather than play.
export async function saveWalkover(tournament, matchId, winnerId) {
  const field = resolveBracketField(tournament, matchId);
  const before = tournament[field];
  const found = before.rounds.find((r) => r.matches.some((m) => m.id === matchId));
  const wasChampionshipFirstRound = field === "bracket" && found?.roundNumber === 1;
  const priorMatch = wasChampionshipFirstRound ? found.matches.find((m) => m.id === matchId) : null;

  const bracket = playoffEngine.recordWalkover(before, matchId, winnerId, { seriesFormat: tournament.matchScoringRules?.matchFormat });
  const match = bracket.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
  let updated = { ...tournament, [field]: bracket };

  if (wasChampionshipFirstRound && updated.consolationBracket) {
    const loserTeam = winnerId === priorMatch.teamA.participantId ? priorMatch.teamB : priorMatch.teamA;
    const consolationBracket = placementService.seatConsolationParticipant(updated.consolationBracket, match.matchNumber, loserTeam, advancementService);
    updated = { ...updated, consolationBracket };
  }

  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(updated, match, "tournament");
  if (field === "bracket" && bracket.status === "completed" && bracket.champion) {
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

// Court Board Live Scoring — same "call the CourtAssignmentService method,
// saveTournament what it returns" shape as saveCourtAssignment/saveCourtRelease
// above.
export async function saveAdjustMatchScore(tournament, matchId, side, delta) {
  const updated = courtAssignmentService.adjustScore(tournament, matchId, side, delta);
  return saveTournament(updated);
}

// Court Board "Won" — same shape as saveAdjustMatchScore above.
export async function saveDeclareCourtWinner(tournament, matchId, side) {
  const updated = courtAssignmentService.declareWinner(tournament, matchId, side);
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

// ---- Manual & Advanced Seeding ----
// manualSeeds: { [participantId]: seedNumber } — captured by the Seeding
// page as the organizer edits seed-number fields, saved independently of
// actually generating the bracket (so progress isn't lost between visits).
export async function saveManualSeeds(tournament, manualSeeds) {
  return saveTournament({ ...tournament, manualSeeds });
}

// PKR Ranking — organizer/admin classification. Deliberately a standalone
// save (same "plain field set, no locking/validation" shape as
// saveManualSeeds above), NOT routed through
// TournamentRulesService/saveTournamentSettings — that service only
// applies to Round Robin tournaments and locks fields by tournament
// phase, neither of which is appropriate here: ranking classification
// must work for BOTH formats and must remain editable even on a
// completed/historical tournament (that's exactly how an existing
// tournament becomes ranking-eligible after the fact — see
// PKR_RANKING_DESIGN's Historical Tournament Handling). 1-4 | null
// ("not yet classified" — never defaults to a guessed tier).
export async function saveRankingTier(tournament, rankingTier) {
  return saveTournament({ ...tournament, rankingTier });
}

// Builds whatever a seeding strategy needs beyond the plain qualified-team
// list — an async ratings fetch for "rating" (the one thing
// PlayoffBracketGenerator's synchronous interface can't do itself) or the
// organizer's own manualSeeds for "manual". Exported so the Seeding page's
// live bracket preview can build the exact same context saveGenerateBracket
// below actually generates with, rather than approximating it separately.
export async function buildSeedingContext(tournament, method, qualifiedTeams) {
  if (method === "manual") {
    return { manualSeeds: tournament.manualSeeds || {} };
  }
  if (method === "rating") {
    const ratings = new Map();
    for (const team of qualifiedTeams) {
      const playerIds = resolvePlayerIds(tournament, team);
      const fetched = (await Promise.all(playerIds.map((id) => fetchPlayerRating(id)))).filter(Boolean);
      if (fetched.length > 0) {
        ratings.set(team.participantId, fetched.reduce((sum, r) => sum + r.currentRating, 0) / fetched.length);
      }
    }
    return { ratings };
  }
  return {};
}

// The explicit "Generate Bracket" action every non-default seeding method
// requires — see RoundRobinEngine.updateMatchResult's header comment for
// why auto-generation only fires for Standard Cross-Pool. Validates the
// built context via the strategy's own validateSeeds() BEFORE calling
// PlayoffBracketGenerator at all, and throws with every failing rule
// joined into one message if invalid — the same "call the service, let it
// throw, persist what it returns" shape every other save* function here
// already uses.
export async function saveGenerateBracket(tournament) {
  const engine = getTournamentEngine(tournament.format);
  const method = tournament.seedingMethod ?? "standardCrossPool";
  const strategy = getSeedingStrategy(method);
  const qualification = qualificationService.determineQualifiers(tournament, engine);

  // Manual Qualification Override — see PROJECT.md. "Prevent generating the
  // playoff bracket while the qualification list is invalid" — checked
  // here (and, for the auto-generating default seeding path, inside
  // RoundRobinEngine.updateMatchResult) rather than inside
  // PlayoffBracketGenerator itself, which stays untouched and keeps
  // consuming qualification.qualifiedTeams exactly as it always has.
  if (tournament.allowManualQualificationOverride && !qualification.qualificationListValidation.valid) {
    throw new Error(qualification.qualificationListValidation.errors.join(" "));
  }

  const context = await buildSeedingContext(tournament, method, qualification.qualifiedTeams);

  const validation = strategy.validateSeeds(qualification.qualifiedTeams, context);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const generated = bracketGenerator.generateBracket(tournament, engine, context);
  if (!generated.ready) {
    throw new Error(
      generated.reason === "unsupported_size"
        ? `Qualified team count (${generated.size}) must be a power of two to generate a bracket.`
        : "Qualification isn't finalized yet — every pool must be complete first."
    );
  }
  const { ready, consolationBracket, ...bracket } = generated;
  return saveTournament({ ...tournament, bracket: { ...bracket, generatedAt: Date.now() }, consolationBracket: consolationBracket ?? null });
}

// Double Elimination Foundation — see PROJECT.md / DoubleEliminationEngine.js.
// A separate explicit action from saveGenerateBracket above, never both on
// the same tournament: tournament.bracketFormat picks exactly one of
// PlayoffBracketGenerator (tournament.bracket) or DoubleEliminationEngine
// (tournament.doubleEliminationBracket) — no auto-generation this
// milestone (structure only, no progression to auto-generate INTO yet).
export async function saveGenerateDoubleEliminationBracket(tournament) {
  const engine = getTournamentEngine(tournament.format);
  const method = tournament.seedingMethod ?? "standardCrossPool";
  const context = await buildSeedingContext(tournament, method, qualificationService.determineQualifiers(tournament, engine).qualifiedTeams);

  const validation = doubleEliminationEngine.validateBracket(tournament, engine);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const generated = doubleEliminationEngine.generateBracket(tournament, engine, context);
  const { ready, ...bracket } = generated;
  return saveTournament({ ...tournament, doubleEliminationBracket: { ...bracket, generatedAt: Date.now() } });
}

// Winners Bracket Progression — see PROJECT.md. Reuses the existing,
// already-generic PlayoffEngine singleton directly for start/pause/resume
// (it operates on any { rounds: [...] } bracket object with zero format-
// specific knowledge — already proven by reuse on tournament.bracket AND
// tournament.consolationBracket) rather than building a parallel Double
// Elimination lifecycle. Only match-result saving is genuinely new
// (DoubleEliminationEngine.updateWinnersBracket, since it also needs to
// stamp the loser's Losers Bracket destination placeholder) — see that
// file for why. Every one of these is scoped to
// tournament.doubleEliminationBracket.winnersBracket only: Losers Bracket
// and Grand Final matches aren't startable/scoreable yet (no progression
// logic exists for them this sprint).

export async function saveDoubleEliminationMatchStart(tournament, matchId) {
  const winnersBracket = playoffEngine.startMatch(tournament.doubleEliminationBracket.winnersBracket, matchId);
  const deBracket = { ...tournament.doubleEliminationBracket, winnersBracket };
  return saveTournament(stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket }));
}

// Winners Bracket Progression — real seating (see DoubleEliminationEngine.
// updateWinnersBracket): the loser is actually written into the Losers
// Bracket, not just given a placeholder descriptor, and Grand Final Game 1
// auto-populates the moment both bracket champions are known. Court
// auto-fill and rating/achievement credit are unchanged from before.
export async function saveDoubleEliminationMatchResult(tournament, matchId, result) {
  const { winnersBracket: beforeWinners, losersBracket: beforeLosers, grandFinal: beforeGrandFinal } = tournament.doubleEliminationBracket;
  const { winnersBracket, losersBracket, grandFinal } = doubleEliminationEngine.updateWinnersBracket(beforeWinners, beforeLosers, beforeGrandFinal, matchId, result);
  const match = winnersBracket.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
  const deBracket = { ...tournament.doubleEliminationBracket, winnersBracket, losersBracket, grandFinal };
  let updated = stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket });
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(withAutoFill, match, "tournament");
  return saveTournament(withAutoFill);
}

export async function saveDoubleEliminationPauseMatch(tournament, matchId) {
  const winnersBracket = playoffEngine.pauseMatch(tournament.doubleEliminationBracket.winnersBracket, matchId);
  return saveTournament({ ...tournament, doubleEliminationBracket: { ...tournament.doubleEliminationBracket, winnersBracket } });
}

export async function saveDoubleEliminationResumeMatch(tournament, matchId) {
  const winnersBracket = playoffEngine.resumeMatch(tournament.doubleEliminationBracket.winnersBracket, matchId);
  return saveTournament({ ...tournament, doubleEliminationBracket: { ...tournament.doubleEliminationBracket, winnersBracket } });
}

// Same "decided by forfeit rather than play" overlay saveWalkover already
// applies for the championship bracket — winner still advances and the
// loser is really seated into the Losers Bracket, exactly like a normal
// completed match, just with a null score and a walkover flag.
export async function saveDoubleEliminationWalkover(tournament, matchId, winnerId) {
  const { winnersBracket: beforeWinners, losersBracket: beforeLosers, grandFinal: beforeGrandFinal } = tournament.doubleEliminationBracket;
  const found = beforeWinners.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
  const { winnersBracket, losersBracket, grandFinal } = doubleEliminationEngine.updateWinnersBracket(beforeWinners, beforeLosers, beforeGrandFinal, matchId, { scoreA: 0, scoreB: 0, winnerId });
  const overlay = { score: { teamA: null, teamB: null }, walkover: true };
  const finalWinnersBracket = {
    ...winnersBracket,
    rounds: winnersBracket.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => (m.id === matchId ? { ...m, ...overlay } : m)) })),
  };
  const match = { ...found, ...overlay };
  const deBracket = { ...tournament.doubleEliminationBracket, winnersBracket: finalWinnersBracket, losersBracket, grandFinal };
  let updated = stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket });
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(withAutoFill, match, "tournament");
  return saveTournament(withAutoFill);
}

// ---- Losers Bracket Progression ----
// Same "call the engine, persist what it returns" shape as every Winners
// Bracket wrapper above.

export async function saveDoubleEliminationLosersMatchStart(tournament, matchId) {
  const losersBracket = playoffEngine.startMatch(tournament.doubleEliminationBracket.losersBracket, matchId);
  const deBracket = { ...tournament.doubleEliminationBracket, losersBracket };
  return saveTournament(stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket }));
}

export async function saveDoubleEliminationLosersMatchResult(tournament, matchId, result) {
  const { winnersBracket, losersBracket: beforeLosers, grandFinal: beforeGrandFinal } = tournament.doubleEliminationBracket;
  const { losersBracket, grandFinal } = doubleEliminationEngine.updateLosersBracket(beforeLosers, winnersBracket, beforeGrandFinal, matchId, result);
  const match = losersBracket.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
  const deBracket = { ...tournament.doubleEliminationBracket, losersBracket, grandFinal };
  let updated = stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket });
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(withAutoFill, match, "tournament");
  return saveTournament(withAutoFill);
}

export async function saveDoubleEliminationLosersPauseMatch(tournament, matchId) {
  const losersBracket = playoffEngine.pauseMatch(tournament.doubleEliminationBracket.losersBracket, matchId);
  return saveTournament({ ...tournament, doubleEliminationBracket: { ...tournament.doubleEliminationBracket, losersBracket } });
}

export async function saveDoubleEliminationLosersResumeMatch(tournament, matchId) {
  const losersBracket = playoffEngine.resumeMatch(tournament.doubleEliminationBracket.losersBracket, matchId);
  return saveTournament({ ...tournament, doubleEliminationBracket: { ...tournament.doubleEliminationBracket, losersBracket } });
}

export async function saveDoubleEliminationLosersWalkover(tournament, matchId, winnerId) {
  const { winnersBracket, losersBracket: beforeLosers, grandFinal: beforeGrandFinal } = tournament.doubleEliminationBracket;
  const found = beforeLosers.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId);
  const { losersBracket, grandFinal } = doubleEliminationEngine.updateLosersBracket(beforeLosers, winnersBracket, beforeGrandFinal, matchId, { scoreA: 0, scoreB: 0, winnerId });
  const overlay = { score: { teamA: null, teamB: null }, walkover: true };
  const finalLosersBracket = {
    ...losersBracket,
    rounds: losersBracket.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => (m.id === matchId ? { ...m, ...overlay } : m)) })),
  };
  const match = { ...found, ...overlay };
  const deBracket = { ...tournament.doubleEliminationBracket, losersBracket: finalLosersBracket, grandFinal };
  let updated = stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket });
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(withAutoFill, match, "tournament");
  return saveTournament(withAutoFill);
}

// ---- Grand Final (including Grand Final Reset) ----
// The Grand Final is a small container (game1 always, game2 only if a
// reset was triggered — see DoubleEliminationEngine.createGrandFinal's own
// comment), not a plain bracket of rounds, so it doesn't reuse
// PlayoffEngine.startMatch/pauseMatch/resumeMatch the way Winners/Losers
// Bracket matches do — those assume a `{ rounds: [...] }` shape. Start/
// pause/resume here are simple, self-contained status flips on whichever
// game (game1 or game2) matchId refers to.
function findGrandFinalGame(grandFinal, matchId) {
  if (grandFinal.game1.id === matchId) return "game1";
  if (grandFinal.game2 && grandFinal.game2.id === matchId) return "game2";
  return null;
}

export async function saveGrandFinalMatchStart(tournament, matchId) {
  const grandFinal = tournament.doubleEliminationBracket.grandFinal;
  const gameKey = findGrandFinalGame(grandFinal, matchId);
  if (!gameKey) throw new Error("Match not found.");
  const nextGrandFinal = {
    ...grandFinal,
    status: "running",
    [gameKey]: { ...grandFinal[gameKey], status: "inProgress", startedAt: Date.now() },
  };
  return saveTournament({ ...tournament, doubleEliminationBracket: { ...tournament.doubleEliminationBracket, grandFinal: nextGrandFinal } });
}

export async function saveGrandFinalMatchResult(tournament, matchId, result) {
  const { grandFinal: beforeGrandFinal } = tournament.doubleEliminationBracket;
  const grandFinal = doubleEliminationEngine.updateGrandFinal(beforeGrandFinal, matchId, result);
  const gameKey = findGrandFinalGame(grandFinal, matchId);
  const match = gameKey ? grandFinal[gameKey] : null;
  const deBracket = { ...tournament.doubleEliminationBracket, grandFinal };
  let updated = stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket });
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(withAutoFill, match, "tournament");
  // Tournament Champion — awarded the moment the Grand Final (including a
  // Game 2 reset, if one happened) actually decides a champion.
  if (grandFinal.status === "completed" && grandFinal.champion) {
    const championIds = resolvePlayerIds(withAutoFill, grandFinal.champion);
    for (const playerId of championIds) {
      const player = await fetchPlayer(playerId);
      if (player) await achievementService.awardTournamentChampion(playerId, tournament.id);
    }
  }
  return saveTournament(withAutoFill);
}

// Same "decided by forfeit rather than play" overlay every other walkover
// wrapper in this file already applies — the game still runs through the
// exact same updateGrandFinal logic (Game 1 win/loss decides reset-or-not,
// Game 2 win decides the champion outright), just with a null score and a
// walkover flag once decided.
export async function saveGrandFinalWalkover(tournament, matchId, winnerId) {
  const { grandFinal: beforeGrandFinal } = tournament.doubleEliminationBracket;
  const gameKeyBefore = findGrandFinalGame(beforeGrandFinal, matchId);
  const grandFinal = doubleEliminationEngine.updateGrandFinal(beforeGrandFinal, matchId, { scoreA: 0, scoreB: 0, winnerId });
  const overlay = { score: { teamA: null, teamB: null }, walkover: true };
  const finalGrandFinal = { ...grandFinal, [gameKeyBefore]: { ...grandFinal[gameKeyBefore], ...overlay } };
  const match = finalGrandFinal[gameKeyBefore];
  const deBracket = { ...tournament.doubleEliminationBracket, grandFinal: finalGrandFinal };
  let updated = stampDoubleEliminationStatus({ ...tournament, doubleEliminationBracket: deBracket });
  const withAutoFill = match?.court != null ? courtAssignmentEngine.autoAssign(updated, match.court) : updated;
  if (match) await rateMatch(withAutoFill, match, "tournament");
  if (finalGrandFinal.status === "completed" && finalGrandFinal.champion) {
    const championIds = resolvePlayerIds(withAutoFill, finalGrandFinal.champion);
    for (const playerId of championIds) {
      const player = await fetchPlayer(playerId);
      if (player) await achievementService.awardTournamentChampion(playerId, tournament.id);
    }
  }
  return saveTournament(withAutoFill);
}

// Keeps tournament.status in sync with the bracket's own rollup after every
// Double Elimination save — same role RoundRobinEngine.updateMatchResult's
// own `next.status = computeTournamentStatus(next)` line plays for Round
// Robin, just called explicitly here since Double Elimination's several
// save wrappers (Winners/Losers Bracket, Grand Final) each only touch one
// piece of the bracket at a time.
function stampDoubleEliminationStatus(tournament) {
  return { ...tournament, status: computeTournamentStatus(tournament) };
}

// ---- Manual Qualification Override ----
// Every write here funnels through one guard: enabled, no bracket
// generated yet, qualification list not locked. "Manual edits after
// tournament completion" (spec's Validation section) is covered by the
// bracket-exists check — qualification only means anything before a
// bracket exists; once one is generated the tournament's playoff phase has
// already begun.
function assertQualificationEditable(tournament) {
  if (!tournament.allowManualQualificationOverride) {
    throw new Error("Manual Qualification Override is not enabled for this tournament.");
  }
  if (tournament.bracket) {
    throw new Error("The playoff bracket has already been generated — qualification can no longer be edited.");
  }
  if (tournament.qualificationLocked) {
    throw new Error("The qualification list is locked — no further changes are allowed.");
  }
}

// Looks up a participant's CURRENT qualification row (before this action)
// across every pool — what makes the audit trail's previousState accurate
// regardless of whether they were previously eliminated, an automatic
// qualifier, a Wild Card, Best Third Place, or a prior manual override.
function findQualificationRow(tournament, participantId) {
  const engine = getTournamentEngine(tournament.format);
  const qualification = qualificationService.determineQualifiers(tournament, engine);
  const row = qualification.pools.flatMap((p) => p.rows).find((r) => r.participantId === participantId);
  return { qualification, row };
}

// director/reason: required — see PROJECT.md's Audit Trail section
// ("Reason for the override (required)"). Persists the new overrides map
// AND records one audit entry, in that order — if the save throws
// (locked/bracket exists/disabled), nothing gets logged for a change that
// never actually happened.
export async function saveQualificationPromote(tournament, participantId, { director, reason }) {
  assertQualificationEditable(tournament);
  if (!director?.trim() || !reason?.trim()) throw new Error("Director name and reason are required.");
  const { row } = findQualificationRow(tournament, participantId);
  if (!row) throw new Error("Participant not found.");
  const nextOverrides = qualificationService.promoteParticipant(tournament.manualOverrides, participantId);
  const updated = await saveTournament({ ...tournament, manualOverrides: nextOverrides });
  await qualificationAuditService.recordOverride(tournament.id, {
    director: director.trim(),
    action: "promote",
    reason: reason.trim(),
    previousState: row.qualificationStatus,
    newState: "manualOverride",
    participantId,
    participantLabel: row.label,
  });
  return updated;
}

export async function saveQualificationEliminate(tournament, participantId, { director, reason }) {
  assertQualificationEditable(tournament);
  if (!director?.trim() || !reason?.trim()) throw new Error("Director name and reason are required.");
  const { row } = findQualificationRow(tournament, participantId);
  if (!row) throw new Error("Participant not found.");
  const nextOverrides = qualificationService.eliminateParticipant(tournament.manualOverrides, participantId);
  const updated = await saveTournament({ ...tournament, manualOverrides: nextOverrides });
  await qualificationAuditService.recordOverride(tournament.id, {
    director: director.trim(),
    action: "eliminate",
    reason: reason.trim(),
    previousState: row.qualificationStatus,
    newState: "eliminated",
    participantId,
    participantLabel: row.label,
  });
  return updated;
}

// "Swap two participants" / "replace a participant who withdraws" — one
// atomic map update via PoolQualificationService.replaceQualifiedParticipant,
// and one audit entry naming both participants (matching the spec's own
// "Removed: Player A / Added: Player B" example).
export async function saveQualificationReplace(tournament, outgoingParticipantId, incomingParticipantId, { director, reason }) {
  assertQualificationEditable(tournament);
  if (!director?.trim() || !reason?.trim()) throw new Error("Director name and reason are required.");
  const { row: outgoingRow } = findQualificationRow(tournament, outgoingParticipantId);
  const { row: incomingRow } = findQualificationRow(tournament, incomingParticipantId);
  if (!outgoingRow || !incomingRow) throw new Error("Participant not found.");
  const nextOverrides = qualificationService.replaceQualifiedParticipant(tournament.manualOverrides, outgoingParticipantId, incomingParticipantId);
  const updated = await saveTournament({ ...tournament, manualOverrides: nextOverrides });
  await qualificationAuditService.recordOverride(tournament.id, {
    director: director.trim(),
    action: "replace",
    reason: reason.trim(),
    previousState: `Qualified: ${outgoingRow.label}`,
    newState: `Qualified: ${incomingRow.label}`,
    participantId: outgoingParticipantId,
    participantLabel: `${outgoingRow.label} → ${incomingRow.label}`,
  });
  return updated;
}

// Undoes a single participant's override — no reason required (this is an
// undo, not a new decision needing its own justification), but still
// logged for a complete audit trail.
export async function saveQualificationReset(tournament, participantId, { director }) {
  assertQualificationEditable(tournament);
  const { row } = findQualificationRow(tournament, participantId);
  if (!row) throw new Error("Participant not found.");
  const nextOverrides = qualificationService.resetQualification(tournament.manualOverrides, participantId);
  const updated = await saveTournament({ ...tournament, manualOverrides: nextOverrides });
  await qualificationAuditService.recordOverride(tournament.id, {
    director: director?.trim() || "—",
    action: "reset",
    reason: "Reverted to automatic qualification.",
    previousState: row.qualificationStatus,
    newState: "automatic",
    participantId,
    participantLabel: row.label,
  });
  return updated;
}

// "Lock the qualification list before generating the bracket" — a
// deliberate, separate organizer action from generation itself. Re-runs
// validateQualificationList first so a director can't lock an invalid
// list (duplicate/over-capacity) and get stuck.
export async function saveLockQualification(tournament) {
  assertQualificationEditable(tournament);
  const engine = getTournamentEngine(tournament.format);
  const qualification = qualificationService.determineQualifiers(tournament, engine);
  if (!qualification.qualificationListValidation.valid) {
    throw new Error(qualification.qualificationListValidation.errors.join(" "));
  }
  return saveTournament({ ...tournament, qualificationLocked: true });
}

export async function fetchQualificationAuditHistory(tournamentId) {
  return qualificationAuditService.getAuditHistory(tournamentId);
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
