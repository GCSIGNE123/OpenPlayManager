// Development-only tool for tuning/debugging Adaptive Skill Rotation's
// cross-division fairness redesign (see PROJECT.md/FEATURES.md). Never
// imported by, or reachable from, any production UI component — this is a
// standalone CLI script, same category as scripts/run-simulation.mjs.
//
// Runs a multi-round simulated session (3 courts by default) and, on
// request, prints a per-candidate-matchup ranking breakdown (Avg Games /
// Max Games / Partner / Opponent / Winner / Quality / Waiting) using
// AdaptiveSkillRotationEngine.scoreBreakdownFor — itself a dev-only method
// never called from generateMatchups or any other production code path.
// Candidates are sorted the same lexicographic way generateMatchups itself
// ranks them (avg games, then max games, then quality, then waiting) —
// see AdaptiveSkillRotationEngine.js's header comment for why.
//
// Usage:
//   node scripts/simulate-adaptive-fairness.mjs
//   node scripts/simulate-adaptive-fairness.mjs --beginners=24 --intermediates=8 --courts=3 --rounds=40
//   node scripts/simulate-adaptive-fairness.mjs --breakdown              (print the score breakdown every round)
//   node scripts/simulate-adaptive-fairness.mjs --breakdown --rounds=3   (just a few rounds of detail)
import { getRotationEngine, refreshNextMatchups, maxUpcomingMatchups } from "../src/lib/utils.js";
import { dispatchAvailableCourts } from "../src/lib/courtDispatch.js";
import { AdaptiveSkillRotationEngine } from "../src/engines/AdaptiveSkillRotationEngine.js";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const withValue = raw.match(/^--([\w-]+)=(.+)$/);
    if (withValue) { args[withValue[1]] = withValue[2]; continue; }
    const bareFlag = raw.match(/^--([\w-]+)$/);
    if (bareFlag) args[bareFlag[1]] = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const BEGINNERS = Number(args.beginners) || 24;
const INTERMEDIATES = Number(args.intermediates) || 8;
const COURTS = Number(args.courts) || 3;
const ROUNDS = Number(args.rounds) || 20;
const SHOW_BREAKDOWN = Boolean(args.breakdown);
const ROUND_MINUTES = 15; // matches CreateSessionScreen's default avg match duration

function buildPlayers(virtualNow) {
  const players = {};
  const queueIds = [];
  for (let i = 0; i < BEGINNERS; i++) {
    const id = `b${i}`;
    queueIds.push(id);
    players[id] = { id, name: `Beg${i}`, skill: "beginner", games: 0, lastResult: null, checkedInAt: virtualNow };
  }
  for (let i = 0; i < INTERMEDIATES; i++) {
    const id = `i${i}`;
    queueIds.push(id);
    players[id] = { id, name: `Int${i}`, skill: "intermediate", games: 0, lastResult: null, checkedInAt: virtualNow };
  }
  return { players, queueIds };
}

function printBreakdown(round, engine, pool, players, baselines) {
  const beginnerIds = pool.filter((id) => players[id]?.skill !== "intermediate");
  const intermediateIds = pool.filter((id) => players[id]?.skill === "intermediate");
  const beginnerMatchups = engine.generateDivisionMatchups(beginnerIds, players);
  const intermediateMatchups = engine.generateDivisionMatchups(intermediateIds, players);
  const rows = [...beginnerMatchups, ...intermediateMatchups].map((m) => {
    const b = engine.scoreBreakdownFor(m, players, baselines);
    return {
      Division: players[m.teamA[0]].skill === "intermediate" ? "INT" : "BEG",
      Matchup: `${m.teamA.join("/")} vs ${m.teamB.join("/")}`,
      AvgGames: b.avgGamesInMatchup,
      MaxGames: b.maxGamesInMatchup,
      Partner: b.partnerScore,
      Opponent: b.opponentScore,
      Winner: b.winnerBonus,
      Quality: b.qualityScore,
      Waiting: Math.round(b.waitingBonus * 10) / 10,
    };
  });
  // same tuple generateMatchups itself ranks by: avg games, then max
  // games, then quality, then waiting
  rows.sort(
    (a, b) =>
      a.AvgGames - b.AvgGames ||
      a.MaxGames - b.MaxGames ||
      b.Quality - a.Quality ||
      b.Waiting - a.Waiting
  );
  console.log(`\n--- Round ${round} candidate matchups (ranked: lowest avg games -> lowest max games -> quality -> waiting) ---`);
  console.table(rows);
}

// Virtual wall-clock — a synchronous loop runs in milliseconds of real
// time, but the waiting bonus is measured in real minutes, exactly like a
// live session where actual minutes pass between rounds. Monkey-patched
// for the duration of this script only; pure test/dev technique, no
// production code touched.
let virtualNow = Date.now();
const realDateNow = Date.now;
Date.now = () => virtualNow;

const { players, queueIds: initialQueueIds } = buildPlayers(virtualNow);
let courts = Array.from({ length: COURTS }, (_, i) => ({
  number: i + 1, status: "open", assignmentMode: "automatic", teamA: [], teamB: [], scoreA: 0, scoreB: 0,
}));
let nextMatchups = [];
let queueIds = [...initialQueueIds];
const engine = getRotationEngine("adaptiveSkill");

console.log(`=== Adaptive Skill Rotation fairness simulation — ${BEGINNERS} Beginner / ${INTERMEDIATES} Intermediate, ${COURTS} courts, ${ROUNDS} rounds ===`);

for (let round = 1; round <= ROUNDS; round++) {
  virtualNow += ROUND_MINUTES * 60000;
  const cap = maxUpcomingMatchups(courts);

  if (SHOW_BREAKDOWN) {
    const reserved = new Set(nextMatchups.flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = queueIds.filter((id) => !reserved.has(id) && players[id]);
    const baselines = { overallAvgWaitMinutes: engine.avgWaitMinutes(pool, players), overallAvgGames: engine.avgGames(pool, players) };
    printBreakdown(round, engine, pool, players, baselines);
  }

  nextMatchups = refreshNextMatchups(queueIds, players, nextMatchups, engine, null, cap);
  const dispatched = dispatchAvailableCourts({ courts, nextMatchups, queueIds, players, autoFillCourts: true, isCourtReserved: () => false });
  courts = dispatched.courts.map((c) => (c.status === "dispatching" ? { ...c, status: "live" } : c));
  nextMatchups = dispatched.nextMatchups;
  queueIds = dispatched.queueIds;

  for (const c of courts) {
    if (c.status !== "live") continue;
    const aWon = Math.random() < 0.5;
    for (const id of [...c.teamA, ...c.teamB]) players[id].games += 1;
    c.teamA.forEach((id) => (players[id].lastResult = aWon ? "win" : "loss"));
    c.teamB.forEach((id) => (players[id].lastResult = aWon ? "loss" : "win"));
    c.teamA.forEach((id) => (players[id].lastMatchEndAt = virtualNow));
    c.teamB.forEach((id) => (players[id].lastMatchEndAt = virtualNow));
    queueIds.push(...c.teamA, ...c.teamB);
  }
  courts = courts.map((c) => (c.status === "live"
    ? { number: c.number, status: "open", assignmentMode: "automatic", teamA: [], teamB: [], scoreA: 0, scoreB: 0 }
    : c));
}

Date.now = realDateNow;

const beginnerGames = Object.values(players).filter((p) => p.skill === "beginner").reduce((s, p) => s + p.games, 0);
const intermediateGames = Object.values(players).filter((p) => p.skill === "intermediate").reduce((s, p) => s + p.games, 0);
console.log(`\n=== Totals after ${ROUNDS} rounds ===`);
console.log(`  Beginner games:     ${beginnerGames}  (avg ${(beginnerGames / BEGINNERS).toFixed(2)}/player)`);
console.log(`  Intermediate games: ${intermediateGames}  (avg ${(intermediateGames / INTERMEDIATES).toFixed(2)}/player)`);
if (intermediateGames === 0 || beginnerGames === 0) {
  console.log("  WARNING: one division never played at all — starvation.");
}
