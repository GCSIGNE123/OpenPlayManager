// Organizer Acceptance Test — automated, headless, logic-layer coverage.
//
// This is NOT a UI test — it doesn't click anything or render React. It
// drives the same pure functions PickleballOpenPlay.jsx calls (imported
// directly from src/lib/*, unmodified) through a full organizer session —
// create, register, check in, generate matchups, manual court assignment,
// score, end match, replace a player, edit session settings, and verify
// standings/history — asserting the data comes out shaped exactly like the
// real app produces it. A few small pieces of orchestration glue that only
// exist as inline closures in PickleballOpenPlay.jsx (adjustScore's win
// condition, fillCourt's dequeue, endMatch's stat bookkeeping) are
// deliberately re-expressed here in miniature, the same precedent already
// set by src/lib/simulation/RotationSimulationEngine.js for the same reason
// — see that file's own header comment.
//
// UI-level gaps (confirm() dialogs, missing toasts, disabled-button
// explanations, etc.) are NOT caught here — see TESTING.md's "Findings"
// section, which came from an actual browser walkthrough, for those.
//
// Usage: node scripts/run-acceptance-test.mjs

import { emptyCourt, resetCourtForNextMatch, ROTATION_MODES } from "../src/lib/constants.js";
import { dispatchAvailableCourts } from "../src/lib/courtDispatch.js";
import {
  getRotationEngine,
  refreshNextMatchups,
  manuallyReservedIds,
  buildReplacementCandidates,
  dissolveMatchupIfReserved,
  recordRotationHistory,
  reservedMatchupIds,
  applyReportedScore,
} from "../src/lib/utils.js";
import { calculatePerformanceRating } from "../src/lib/performanceRating.js";
import { uid } from "../src/lib/random.js";

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(step, description, condition) {
  if (condition) {
    passCount += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${description}`);
  } else {
    failCount += 1;
    failures.push(`[${step}] ${description}`);
    console.log(`  \x1b[31m✗ ${description}\x1b[0m`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

function newPlayer(name, skill) {
  const id = uid();
  return {
    id,
    name,
    photo: null,
    skill,
    checkedIn: false,
    skipped: false,
    games: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    lastResult: null,
    pointsFor: 0,
    pointsAgainst: 0,
    partnerCounts: {},
    recentPartnerIds: [],
    opponentCounts: {},
    lastOpponentIds: [],
    recentOpponentIds: [],
    courtCounts: {},
    lastCourt: null,
  };
}

// ---------------------------------------------------------------------
// Step 1 + 2: Create Session, Register Players
// ---------------------------------------------------------------------
section("1-2. Create Session / Register Players");

const roster = [
  newPlayer("John", "beginner"),
  newPlayer("Lloyd", "intermediate"),
  newPlayer("Lara", "beginner"),
  newPlayer("Doy2x", "intermediate"),
  newPlayer("Melit", "beginner"),
];
const players = {};
roster.forEach((p) => (players[p.id] = p));
const [johnId, lloydId, laraId, doy2xId, melitId] = roster.map((p) => p.id);

let state = {
  venue: "Acceptance Test Venue",
  courts: [emptyCourt(1), emptyCourt(2)],
  players,
  queueIds: [],
  nextMatchups: [],
  matchHistory: [],
  rotationMode: "continuous",
  expectedGamesPerPlayer: 6,
  progressiveSkillThresholds: { mentorshipMax: 30, transitionMax: 60 },
  updatedAt: Date.now(),
};

assert("Create Session", "venue name stored", state.venue === "Acceptance Test Venue");
assert("Create Session", "2 courts created, both open", state.courts.length === 2 && state.courts.every((c) => c.status === "open"));
assert("Create Session", "rotation mode is a valid ROTATION_MODES value", ROTATION_MODES.some((m) => m.value === state.rotationMode));
assert("Register Players", "5 players registered, none checked in yet", Object.keys(state.players).length === 5 && Object.values(state.players).every((p) => !p.checkedIn));

// ---------------------------------------------------------------------
// Step 3: Player Check-in (4 registered + 1 walk-in, mirroring
// checkInExisting / quickAddCheckIn)
// ---------------------------------------------------------------------
section("3. Player Check-in");

[johnId, lloydId, laraId, doy2xId].forEach((id) => {
  state.players[id] = { ...state.players[id], checkedIn: true };
  state.queueIds = [...state.queueIds, id];
});
const jeffreyId = uid();
state.players[jeffreyId] = { ...newPlayer("Jeffrey", "intermediate"), checkedIn: true };
state.queueIds = [...state.queueIds, jeffreyId];

assert("Check-in", "4 registered players checked in via checkInExisting path", [johnId, lloydId, laraId, doy2xId].every((id) => state.players[id].checkedIn));
assert("Check-in", "walk-in player added and checked in via quickAddCheckIn path", state.players[jeffreyId].checkedIn === true);
assert("Check-in", "Melit (not checked in) stays out of the queue", !state.queueIds.includes(melitId));
assert("Check-in", "queue has exactly the 5 checked-in players", state.queueIds.length === 5);

// ---------------------------------------------------------------------
// Step 4: Generate Matchups
// ---------------------------------------------------------------------
section("4. Generate Matchups");

const engine = getRotationEngine(state.rotationMode);
state.nextMatchups = refreshNextMatchups(state.queueIds, state.players, state.nextMatchups, engine, null);

assert("Generate Matchups", "at least one matchup was generated from 5 waiting players", state.nextMatchups.length >= 1);
const firstMatchup = state.nextMatchups[0];
assert("Generate Matchups", "generated matchup has 2 players per side", firstMatchup && firstMatchup.teamA.length === 2 && firstMatchup.teamB.length === 2);
assert(
  "Generate Matchups",
  "generated matchup mixes a beginner and an intermediate per team (BalancedRotationEngine rule)",
  firstMatchup &&
    [firstMatchup.teamA, firstMatchup.teamB].every((team) => {
      const skills = team.map((id) => state.players[id].skill);
      return skills.includes("beginner") && skills.includes("intermediate");
    })
);

// ---------------------------------------------------------------------
// Step 8 (checked here too): Waiting Queue — reservation accounting
// ---------------------------------------------------------------------
section("8. Waiting Queue (post-matchup-generation)");

const reserved = reservedMatchupIds(state.nextMatchups);
assert("Waiting Queue", "reservedMatchupIds tracks everyone inside nextMatchups", [...reserved].length === firstMatchup.teamA.length + firstMatchup.teamB.length);
assert(
  "Waiting Queue",
  "players still counted in queueIds even once reserved into a matchup (they don't leave until deployed to a live court)",
  [...reserved].every((id) => state.queueIds.includes(id))
);

// ---------------------------------------------------------------------
// Step 6: Score Entry + Step 7: Court Rotation (deploy the generated
// matchup onto Court 1, mirroring fillCourt, then score + end it,
// mirroring adjustScore/declareWinner + endMatch's continuous-queue path)
// ---------------------------------------------------------------------
section("6-7. Score Entry / Court Rotation (Court 1, automatic matchup)");

{
  const [nextMatch, ...rest] = state.nextMatchups;
  const consumed = new Set([...nextMatch.teamA, ...nextMatch.teamB]);
  state.queueIds = state.queueIds.filter((id) => !consumed.has(id));
  state.courts = state.courts.map((c, i) =>
    i === 0 ? { ...c, status: "live", teamA: nextMatch.teamA, teamB: nextMatch.teamB, scoreA: 0, scoreB: 0 } : c
  );
  state.nextMatchups = rest;
}
assert("Court Rotation", "Court 1 is live with the deployed matchup's teams", state.courts[0].status === "live" && state.courts[0].teamA.length === 2);
assert("Court Rotation", "deployed players removed from queueIds", !state.courts[0].teamA.concat(state.courts[0].teamB).some((id) => state.queueIds.includes(id)));

// declareWinner-style: Team A wins 11-0
state.courts = state.courts.map((c, i) => (i === 0 ? { ...c, scoreA: 11, scoreB: 0, status: "finished" } : c));
assert("Score Entry", "score recorded and court marked finished at 11 points", state.courts[0].scoreA === 11 && state.courts[0].status === "finished");

// endMatch-style: stats, rotation history, matchHistory, requeue
{
  const court = state.courts[0];
  const { teamA, teamB, scoreA, scoreB } = court;
  const aWon = scoreA > scoreB;
  let updatedPlayers = { ...state.players };
  teamA.forEach((id) => {
    const p = updatedPlayers[id];
    updatedPlayers[id] = { ...p, games: p.games + 1, wins: p.wins + (aWon ? 1 : 0), losses: p.losses + (aWon ? 0 : 1), pointsFor: p.pointsFor + scoreA, pointsAgainst: p.pointsAgainst + scoreB };
  });
  teamB.forEach((id) => {
    const p = updatedPlayers[id];
    updatedPlayers[id] = { ...p, games: p.games + 1, wins: p.wins + (aWon ? 0 : 1), losses: p.losses + (aWon ? 1 : 0), pointsFor: p.pointsFor + scoreB, pointsAgainst: p.pointsAgainst + scoreA };
  });
  updatedPlayers = recordRotationHistory(updatedPlayers, teamA, teamB, court.number);

  const matchRecord = {
    round: state.matchHistory.length + 1,
    court: court.number,
    teamA,
    teamB,
    winner: aWon ? "A" : "B",
    scoreA,
    scoreB,
    endedAt: Date.now(),
    phase: null,
  };
  state.matchHistory = [...state.matchHistory, matchRecord];
  state.queueIds = [...state.queueIds, ...teamA, ...teamB];
  state.courts = state.courts.map((c, i) => (i === 0 ? emptyCourt(c.number) : c));
  state.players = updatedPlayers;
}

assert("Court Rotation", "match #1 recorded in matchHistory as round 1", state.matchHistory.length === 1 && state.matchHistory[0].round === 1);
assert("Court Rotation", "Court 1 reset to open/empty after end-match (continuous mode, non-pooling)", state.courts[0].status === "open" && state.courts[0].teamA.length === 0);
assert("Court Rotation", "all 4 played players requeued into queueIds", state.matchHistory[0].teamA.concat(state.matchHistory[0].teamB).every((id) => state.queueIds.includes(id)));
assert("Score Entry", "winning team's players credited a win, losing team a loss", state.matchHistory[0].teamA.every((id) => state.players[id].wins === 1) && state.matchHistory[0].teamB.every((id) => state.players[id].losses === 1));

// ---------------------------------------------------------------------
// Step 9: Manual Court Assignment (Court 2)
// ---------------------------------------------------------------------
section("9. Manual Court Assignment");

state.courts = state.courts.map((c, i) => (i === 1 ? { ...c, assignmentMode: "manual" } : c));
assert("Manual Court Assignment", "Court 2 switched to manual mode", state.courts[1].assignmentMode === "manual");

// draft: pull a player who is currently reserved in nextMatchups (if any),
// exercising dissolveMatchupIfReserved the same way setManualCourtPlayer does
const manualPick1 = state.queueIds[0];
state.nextMatchups = dissolveMatchupIfReserved(state.nextMatchups, manualPick1);
state.courts = state.courts.map((c, i) => (i === 1 ? { ...c, teamA: [manualPick1] } : c));

const remainingPicks = state.queueIds.filter((id) => id !== manualPick1).slice(0, 3);
state.courts = state.courts.map((c, i) =>
  i === 1 ? { ...c, teamA: [...c.teamA, remainingPicks[0]], teamB: [remainingPicks[1], remainingPicks[2]] } : c
);

const manualCourt = state.courts[1];
const manualIds = [...manualCourt.teamA, ...manualCourt.teamB];
assert("Manual Court Assignment", "draft has exactly 4 unique players before locking", manualIds.length === 4 && new Set(manualIds).size === 4);

const reservedByManual = manuallyReservedIds(state.courts);
assert("Manual Court Assignment", "manuallyReservedIds sees all 4 drafted players", manualIds.every((id) => reservedByManual.has(id)));

// lockManualCourt-style
state.queueIds = state.queueIds.filter((id) => !manualIds.includes(id));
state.courts = state.courts.map((c, i) => (i === 1 ? { ...c, status: "live", scoreA: 0, scoreB: 0, manualLocked: true } : c));
assert("Manual Court Assignment", "Court 2 live and manualLocked after lock", state.courts[1].status === "live" && state.courts[1].manualLocked === true);
assert("Manual Court Assignment", "locked players removed from queueIds", !manualIds.some((id) => state.queueIds.includes(id)));

// ---------------------------------------------------------------------
// Step 10: Player Replacement (substitute one of Court 2's players)
// ---------------------------------------------------------------------
section("10. Player Replacement");

const outgoingId = state.courts[1].teamA[0];
const unassigned = state.queueIds.map((id) => state.players[id]).filter(Boolean);
const candidates = buildReplacementCandidates(state.nextMatchups, unassigned, state.players);
assert("Player Replacement", "candidate pool has at least one player available to sub in", candidates.waiting.length + candidates.upcoming.length > 0);

const incomingId = candidates.waiting[0]?.id ?? candidates.upcoming[0]?.id;
if (incomingId) {
  state.nextMatchups = dissolveMatchupIfReserved(state.nextMatchups, incomingId);
  state.courts = state.courts.map((c, i) => {
    if (i !== 1) return c;
    return { ...c, teamA: c.teamA.map((id) => (id === outgoingId ? incomingId : id)) };
  });
  state.queueIds = state.queueIds.filter((id) => id !== incomingId);
  state.queueIds = [...state.queueIds, outgoingId];
}
assert("Player Replacement", "outgoing player returned to queueIds", state.queueIds.includes(outgoingId));
assert("Player Replacement", "incoming player now on Court 2, not in queueIds", state.courts[1].teamA.includes(incomingId) && !state.queueIds.includes(incomingId));
assert("Player Replacement", "Court 2 still has exactly 4 unique players after the swap", new Set([...state.courts[1].teamA, ...state.courts[1].teamB]).size === 4);

// ---------------------------------------------------------------------
// Step 11: Session Settings (edit venue, expected games, thresholds —
// mirroring updateSessionSettings)
// ---------------------------------------------------------------------
section("11. Session Settings");

const prevRotationMode = state.rotationMode;
state = {
  ...state,
  venue: "Renamed Venue",
  expectedGamesPerPlayer: 8,
  progressiveSkillThresholds: { mentorshipMax: 25, transitionMax: 55 },
};
assert("Session Settings", "venue name updated", state.venue === "Renamed Venue");
assert("Session Settings", "expected games per player updated", state.expectedGamesPerPlayer === 8);
assert("Session Settings", "progressive skill thresholds updated", state.progressiveSkillThresholds.mentorshipMax === 25 && state.progressiveSkillThresholds.transitionMax === 55);
assert("Session Settings", "rotation mode NOT changed by session settings (by design — chosen once at creation)", state.rotationMode === prevRotationMode);

// ---------------------------------------------------------------------
// Step 12: Standings
// ---------------------------------------------------------------------
section("12. Standings");

const winnerSample = state.matchHistory[0].teamA[0];
const loserSample = state.matchHistory[0].teamB[0];
const winnerRating = calculatePerformanceRating(state.players[winnerSample]);
const loserRating = calculatePerformanceRating(state.players[loserSample]);
assert("Standings", "a player with a completed win has a non-null performance rating", winnerRating.rating !== null);
assert("Standings", "the winning player's rating is higher than the losing player's", winnerRating.rating > loserRating.rating);
assert("Standings", "a player with 0 games played has a null rating (not shown in standings)", calculatePerformanceRating(state.players[melitId]).rating === null);

// ---------------------------------------------------------------------
// Step 13: History
// ---------------------------------------------------------------------
section("13. History");

assert("History", "matchHistory has exactly 1 completed game recorded", state.matchHistory.length === 1);
const historyEntry = state.matchHistory[0];
assert("History", "history entry has round/court/teams/score/winner/endedAt — the reusable shape PROJECT.md documents", ["round", "court", "teamA", "teamB", "winner", "scoreA", "scoreB", "endedAt"].every((k) => k in historyEntry));
assert("History", "history entry is immutable player-id data, not display strings (names resolved at render/export time)", typeof historyEntry.teamA[0] === "string" && !historyEntry.teamA[0].includes(" "));

// ---------------------------------------------------------------------
// Self-Service Score Reporting — applyReportedScore (lib/utils.js) is the
// SAME function PickleballOpenPlay.jsx's reportScore calls directly, so
// this exercises the real, actual implementation, not a miniature
// reimplementation (unlike adjustScore/endMatch above, which are closures
// only reachable from inside the component). Runs against an isolated
// mock court — never state.courts[1], so it can't disturb the "Court 2
// still live" End Session checks that follow.
// ---------------------------------------------------------------------
section("14. Self-Service Score Reporting");

{
  const liveCourt = { number: 9, status: "live", teamA: ["px1", "px2"], teamB: ["px3", "px4"], scoreA: 3, scoreB: 5 };

  const win = applyReportedScore(liveCourt, "A", 11, 7);
  assert("Score Reporting", "a valid submission (own > opponent) succeeds", win.ok === true);
  assert("Score Reporting", "scoreA/scoreB are re-derived from ownTeam, not merely echoed", win.ok && win.court.scoreA === 11 && win.court.scoreB === 7);
  assert("Score Reporting", "court is marked 'finished' on success — the SAME terminal state adjustScore reaches at game point, no parallel completion system", win.ok && win.court.status === "finished");
  assert("Score Reporting", "team membership is untouched by a score report", win.ok && win.court.teamA.length === 2 && win.court.teamB.length === 2);

  const winOtherSide = applyReportedScore(liveCourt, "B", 15, 13);
  assert("Score Reporting", "supports match formats other than 11 (e.g. 15-13) — no hardcoded winning score", winOtherSide.ok && winOtherSide.court.scoreA === 13 && winOtherSide.court.scoreB === 15);

  const tie = applyReportedScore(liveCourt, "A", 10, 10);
  assert("Score Reporting", "a tied score is rejected", tie.ok === false);

  const loss = applyReportedScore(liveCourt, "A", 7, 11);
  assert("Score Reporting", "a submission where the 'own' team's score is LOWER is rejected — a client-side winner flag alone is never trusted", loss.ok === false);

  const negative = applyReportedScore(liveCourt, "A", -1, 5);
  assert("Score Reporting", "a negative score is rejected", negative.ok === false);

  const nonInteger = applyReportedScore(liveCourt, "A", 11.5, 7);
  assert("Score Reporting", "a non-integer score is rejected", nonInteger.ok === false);

  const missingBoth = applyReportedScore(liveCourt, "A", undefined, undefined);
  assert("Score Reporting", "missing/undefined scores are rejected, not coerced to 0", missingBoth.ok === false);

  const badTeam = applyReportedScore(liveCourt, "C", 11, 7);
  assert("Score Reporting", "an invalid team identifier is rejected", badTeam.ok === false);

  const openCourt = { number: 9, status: "open", teamA: [], teamB: [], scoreA: 0, scoreB: 0 };
  const onOpenCourt = applyReportedScore(openCourt, "A", 11, 7);
  assert("Score Reporting", "a court that is no longer live/finished (e.g. already ended and reset to open) is not reportable", onOpenCourt.ok === false);

  const missingCourt = applyReportedScore(null, "A", 11, 7);
  assert("Score Reporting", "a missing/deleted court is not reportable rather than throwing", missingCourt.ok === false);

  // Duplicate-submit safety — the SAME call applied twice in a row (as a
  // duplicate tap would) must not corrupt or double-apply anything; the
  // second call is simply evaluated fresh against the (now-finished)
  // court and still produces the identical, correct result.
  const firstTap = applyReportedScore(liveCourt, "A", 11, 9);
  const secondTap = applyReportedScore(firstTap.court, "A", 11, 9);
  assert("Score Reporting", "an identical duplicate submission after the first succeeds is idempotent, not additive or corrupting", secondTap.ok && secondTap.court.scoreA === 11 && secondTap.court.scoreB === 9);
}

// ---------------------------------------------------------------------
// Self-Service Score Reporting — Full Completion Flow. A valid Submit
// Score no longer stops at status:"finished" — it runs the SAME
// finalization the manual "End match & requeue players" button does
// (PickleballOpenPlay.jsx's endMatch), then relies on save()'s own
// always-on Smart Court Dispatch step (dispatchAvailableCourts,
// lib/courtDispatch.js) to immediately redispatch the next eligible
// matchup onto the very same, now-open court. This mirrors that EXACT
// non-pooling endMatch sequence using the real, imported library
// functions endMatch itself calls (recordRotationHistory,
// resetCourtForNextMatch, dispatchAvailableCourts) — never a
// reimplementation of the finalize decision itself (applyReportedScore is
// imported and called for real, unmodified).
// ---------------------------------------------------------------------
section("15. Self-Service Score Reporting — Full Completion Flow");

function finalizeSelfReportedMatch(input, courtIdx, ownTeam, ownScore, opponentScore) {
  const court = input.courts[courtIdx];
  const result = applyReportedScore(court, ownTeam, ownScore, opponentScore);
  if (!result.ok) return { ok: false, error: result.error, state: input };

  const finishedCourt = result.court;
  const { teamA, teamB, scoreA, scoreB } = finishedCourt;
  const playedIds = [...teamA, ...teamB];
  let players = { ...input.players };
  const aWon = scoreA > scoreB;
  const bWon = scoreB > scoreA;
  teamA.forEach((id) => {
    const p = players[id];
    if (!p) return;
    players[id] = { ...p, games: (p.games || 0) + 1, wins: (p.wins || 0) + (aWon ? 1 : 0), losses: (p.losses || 0) + (bWon ? 1 : 0), pointsFor: (p.pointsFor || 0) + scoreA, pointsAgainst: (p.pointsAgainst || 0) + scoreB };
  });
  teamB.forEach((id) => {
    const p = players[id];
    if (!p) return;
    players[id] = { ...p, games: (p.games || 0) + 1, wins: (p.wins || 0) + (bWon ? 1 : 0), losses: (p.losses || 0) + (aWon ? 1 : 0), pointsFor: (p.pointsFor || 0) + scoreB, pointsAgainst: (p.pointsAgainst || 0) + scoreA };
  });
  players = recordRotationHistory(players, teamA, teamB, finishedCourt.number);

  const matchRecord = { round: (input.matchHistory || []).length + 1, court: finishedCourt.number, teamA, teamB, winner: aWon ? "A" : bWon ? "B" : null, scoreA, scoreB, endedAt: Date.now(), phase: null };
  const matchHistory = [...(input.matchHistory || []), matchRecord];
  const queueIds = [...input.queueIds, ...playedIds];
  const courtsAfterReset = input.courts.map((c, i) => (i === courtIdx ? resetCourtForNextMatch(c) : c));

  // save()'s own always-on Smart Court Dispatch step — the SAME call
  // endMatch's save() triggers for every court-freeing action.
  const dispatchResult = dispatchAvailableCourts({
    courts: courtsAfterReset,
    nextMatchups: input.nextMatchups || [],
    queueIds,
    players,
    autoFillCourts: true,
    isCourtReserved: () => false,
  });

  return {
    ok: true,
    state: {
      ...input,
      courts: dispatchResult.courts,
      nextMatchups: dispatchResult.nextMatchups,
      queueIds: dispatchResult.queueIds,
      players,
      matchHistory,
    },
    dispatched: dispatchResult.dispatched,
  };
}

// ---- A/B: valid self-reported score (11 and a non-11 format) fully completes ----
{
  const base = {
    players: {
      a1: { id: "a1", name: "Alfred", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      a2: { id: "a2", name: "Eubert", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      b1: { id: "b1", name: "Mae", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      b2: { id: "b2", name: "Roel", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      q1: { id: "q1", name: "Queued1" },
      q2: { id: "q2", name: "Queued2" },
      q3: { id: "q3", name: "Queued3" },
      q4: { id: "q4", name: "Queued4" },
    },
    courts: [{ number: 1, status: "live", teamA: ["a1", "a2"], teamB: ["b1", "b2"], scoreA: 6, scoreB: 8, assignmentMode: "automatic" }],
    nextMatchups: [{ id: "nm1", teamA: ["q1", "q2"], teamB: ["q3", "q4"] }],
    queueIds: [],
    matchHistory: [],
  };

  const outcome = finalizeSelfReportedMatch(base, 0, "B", 11, 8);
  assert("Self-Service Completion", "a valid submission (11-8) is accepted and fully finalized in one step", outcome.ok === true);
  assert("Self-Service Completion", "exactly one matchHistory entry is recorded for this match", outcome.state.matchHistory.length === 1 && outcome.state.matchHistory[0].scoreA === 8 && outcome.state.matchHistory[0].scoreB === 11 && outcome.state.matchHistory[0].winner === "B");
  assert("Self-Service Completion", "the winning team's players are credited a win, losing team a loss — same stat bookkeeping as manual End Match", outcome.state.players.b1.wins === 1 && outcome.state.players.a1.losses === 1);
  assert("Self-Service Completion", "old players (Alfred/Eubert/Mae/Roel) no longer occupy Court 1 — a NEW matchup is there instead", !outcome.state.courts[0].teamA.includes("a1") && !outcome.state.courts[0].teamB.includes("b1"));
  assert("Self-Service Completion", "the next queued matchup was immediately dispatched onto the SAME court (Court 1), not left open waiting for the organizer", outcome.state.courts[0].status === "dispatching" && outcome.state.courts[0].teamA.includes("q1"));
  assert("Self-Service Completion", "the dispatched matchup is consumed from nextMatchups exactly once — no duplicate matchup left behind", outcome.state.nextMatchups.length === 0);
  assert("Self-Service Completion", "the dispatch event log reports exactly one court dispatched, not two", outcome.dispatched.length === 1);

  // B: non-11 final score (15-13) — no hardcoded winning score anywhere in this path
  const base2 = { ...base, courts: [{ ...base.courts[0], scoreA: 12, scoreB: 12 }] };
  const outcome2 = finalizeSelfReportedMatch(base2, 0, "A", 15, 13);
  assert("Self-Service Completion", "a non-11 final score (15-13) completes the exact same full lifecycle", outcome2.ok === true && outcome2.state.matchHistory[0].scoreA === 15 && outcome2.state.matchHistory[0].scoreB === 13);
  assert("Self-Service Completion", "15-13's winner (Team A) is credited correctly, and the same court still gets redispatched", outcome2.state.players.a1.wins === 1 && outcome2.state.courts[0].status === "dispatching");
}

// ---- C: duplicate submit safety (data-level) — a second finalize attempt against the ALREADY-finalized court is rejected, never double-applied ----
{
  const base = {
    players: { a1: { id: "a1", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }, a2: { id: "a2", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }, b1: { id: "b1", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }, b2: { id: "b2", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 } },
    courts: [{ number: 1, status: "live", teamA: ["a1", "a2"], teamB: ["b1", "b2"], scoreA: 9, scoreB: 6, assignmentMode: "automatic" }],
    nextMatchups: [],
    queueIds: [],
    matchHistory: [],
  };
  const firstSubmit = finalizeSelfReportedMatch(base, 0, "A", 11, 6);
  assert("Self-Service Completion", "the first submission of a double-tap succeeds", firstSubmit.ok === true);
  assert("Self-Service Completion", "exactly one match history entry after the first submission", firstSubmit.state.matchHistory.length === 1);

  // A second call with the exact same courtIdx now sees the ALREADY-reset
  // court (status:'open' with different/no teams) — the SAME
  // applyReportedScore status check that protects the manual path also
  // protects this: it is no longer 'live'/'finished', so it's rejected,
  // never double-applied. (In the real app, the finalizingMatchesRef guard
  // in PickleballOpenPlay.jsx additionally blocks a same-tick duplicate
  // before even reaching this check — see the browser verification.)
  const secondSubmit = finalizeSelfReportedMatch(firstSubmit.state, 0, "A", 11, 6);
  assert("Self-Service Completion", "a duplicate submission against the same court after it was already finalized/reset is rejected, not double-applied", secondSubmit.ok === false);
  assert("Self-Service Completion", "matchHistory still has exactly ONE entry after the rejected duplicate — no double-counting", secondSubmit.state.matchHistory.length === 1);
  assert("Self-Service Completion", "player stats were not incremented twice by the rejected duplicate", secondSubmit.state.players.a1.wins === 1);
}

// ---- F: no next matchup available — match still finalizes correctly, court simply stays open ----
{
  const base = {
    players: { a1: { id: "a1", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }, a2: { id: "a2", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }, b1: { id: "b1", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }, b2: { id: "b2", games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 } },
    courts: [{ number: 1, status: "live", teamA: ["a1", "a2"], teamB: ["b1", "b2"], scoreA: 4, scoreB: 11, assignmentMode: "automatic" }],
    nextMatchups: [], // nothing queued
    queueIds: [],
    matchHistory: [],
  };
  const outcome = finalizeSelfReportedMatch(base, 0, "B", 11, 4);
  assert("Self-Service Completion", "with no next matchup available, the match still finalizes correctly (recorded, stats applied)", outcome.ok === true && outcome.state.matchHistory.length === 1);
  assert("Self-Service Completion", "the court is released to 'open' (existing no-next-match behavior), never left showing the old finished match", outcome.state.courts[0].status === "open" && outcome.state.courts[0].teamA.length === 0);
  assert("Self-Service Completion", "no fabricated players/matchup ever appear when nothing is queued", outcome.dispatched.length === 0);
  assert("Self-Service Completion", "the just-finished players are correctly requeued into queueIds (existing behavior), not stranded", ["a1", "a2", "b1", "b2"].every((id) => outcome.state.queueIds.includes(id)));
}

// ---------------------------------------------------------------------
// Step 5 (End Session) — logic-layer check only; the actual Supabase
// delete + native confirm() dialog can't be safely exercised headlessly.
// See TESTING.md Finding #1 for why that confirm() is itself a problem.
// ---------------------------------------------------------------------
section("5. End Session (data-integrity check only)");

const stillLiveCourts = state.courts.filter((c) => c.status === "live" || c.status === "finished");
assert("End Session", "Court 2 still live going into end-of-session (expected — this test never explicitly ended it)", stillLiveCourts.length === 1);
assert("End Session", "no player id appears in queueIds AND on a live court at the same time", stillLiveCourts.every((c) => [...c.teamA, ...c.teamB].every((id) => !state.queueIds.includes(id))));
assert("End Session", "matchHistory survived every subsequent mutation unchanged (round-1 record untouched)", state.matchHistory.length === 1 && state.matchHistory[0].round === 1 && state.matchHistory[0].scoreA === 11);

// ---------------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  console.log("\nFailed assertions:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log("All organizer acceptance checks passed.");
}
