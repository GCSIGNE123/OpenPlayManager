// Result Grouping (winners' court / losers' court inside each skill
// division) — automated, headless, logic-layer coverage. Same approach as
// scripts/verify-fairness-selection.mjs: calls the real
// AdaptiveSkillRotationEngine directly. See the RESULT GROUPING header in
// src/engines/AdaptiveSkillRotationEngine.js and FEATURES.md.
//
// Usage: node scripts/verify-result-grouping.mjs
import fs from "node:fs";
import {
  AdaptiveSkillRotationEngine,
  REST_GUARD_GAP_MINUTES,
  GROUPING_SKIP_WAIT_GAP_MINUTES,
  GROUPING_SKIP_GAMES_GAP,
  RESULT_GROUPING_MODES,
  normalizeResultGrouping,
  resultMixPenalty,
  describeResultGroup,
} from "../src/engines/AdaptiveSkillRotationEngine.js";
import { getRotationEngine, refreshNextMatchups } from "../src/lib/utils.js";
import { defaultState, RESULT_GROUPING_OPTIONS, DEFAULT_RESULT_GROUPING } from "../src/lib/constants.js";

let pass = 0;
let fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
    console.log(`  ok ${desc}`);
  } else {
    fail++;
    console.log(`  FAIL: ${desc}`);
  }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function makePlayer(id, overrides = {}) {
  return {
    id,
    name: id,
    skill: "beginner",
    games: 3,
    wins: 0,
    losses: 0,
    streak: 0,
    lastResult: null,
    partnerCounts: {},
    recentPartnerIds: [],
    opponentCounts: {},
    recentOpponentIds: [],
    checkedIn: true,
    ...overrides,
  };
}

// Builds a division pool from a compact spec: [{ id, r: "W"|"L"|null, wait (min), games }]
function pool(spec, now = Date.now(), skill = "beginner") {
  const players = {};
  for (const s of spec) {
    players[s.id] = makePlayer(s.id, {
      skill,
      lastResult: s.r === "W" ? "win" : s.r === "L" ? "loss" : null,
      games: s.games ?? 3,
      lastMatchEndAt: now - s.wait * 60000,
    });
  }
  return players;
}

const engine = new AdaptiveSkillRotationEngine();
const ids = (m) => [...m.teamA, ...m.teamB];
const run = (players, resultGrouping) =>
  engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [], resultGrouping });
const resultsOf = (m, players) => ids(m).map((id) => players[id].lastResult);
const isPure = (m, players) => resultMixPenalty(ids(m), players) === 0;

console.log("\n1. Mode normalisation — anything unknown is 'off' (old sessions never change behaviour on redeploy)");
{
  assert("the three modes are off/prefer/strict", RESULT_GROUPING_MODES.join(",") === "off,prefer,strict");
  assert("undefined -> off", normalizeResultGrouping(undefined) === "off");
  assert("null -> off", normalizeResultGrouping(null) === "off");
  assert("garbage -> off", normalizeResultGrouping("yes please") === "off");
  assert("prefer/strict pass through", normalizeResultGrouping("prefer") === "prefer" && normalizeResultGrouping("strict") === "strict");
}

console.log("\n2. resultMixPenalty / describeResultGroup");
{
  const p = pool([
    { id: "w1", r: "W", wait: 10 }, { id: "w2", r: "W", wait: 10 }, { id: "w3", r: "W", wait: 10 }, { id: "w4", r: "W", wait: 10 },
    { id: "l1", r: "L", wait: 10 }, { id: "l2", r: "L", wait: 10 },
    { id: "n1", r: null, wait: 10 }, { id: "n2", r: null, wait: 10 },
  ]);
  assert("4 winners -> penalty 0, 'winners'", resultMixPenalty(["w1", "w2", "w3", "w4"], p) === 0 && describeResultGroup(["w1", "w2", "w3", "w4"], p) === "winners");
  assert("2W+2L -> penalty 2, 'mixed'", resultMixPenalty(["w1", "w2", "l1", "l2"], p) === 2 && describeResultGroup(["w1", "w2", "l1", "l2"], p) === "mixed");
  assert("3W+1L -> penalty 1", resultMixPenalty(["w1", "w2", "w3", "l1"], p) === 1);
  assert("players with no result are neutral: 2W+2none -> penalty 0, 'winners'", resultMixPenalty(["w1", "w2", "n1", "n2"], p) === 0 && describeResultGroup(["w1", "w2", "n1", "n2"], p) === "winners");
  assert("2L+2none -> 'losers'", describeResultGroup(["l1", "l2", "n1", "n2"], p) === "losers");
  assert("4 none -> 'fresh'", describeResultGroup(["n1", "n2", "n1", "n2"], p) === "fresh");
}

// Alternating W/L by wait, everyone within a couple of minutes and on the
// same games count — the canonical case where grouping should kick in.
const ALT = [
  { id: "a", r: "W", wait: 20 }, { id: "b", r: "L", wait: 19 }, { id: "c", r: "W", wait: 18 }, { id: "d", r: "L", wait: 17 },
  { id: "e", r: "W", wait: 16 }, { id: "f", r: "L", wait: 15 }, { id: "g", r: "W", wait: 14 }, { id: "h", r: "L", wait: 13 },
];

console.log("\n3. OFF — exactly the pre-feature behaviour (strict front four by wait)");
{
  const p = pool(ALT);
  const off = run(p, "off");
  const none = run(p, undefined); // no context field at all (older callers / other engines' contexts)
  assert("two matchups from 8 players", off.length === 2 && none.length === 2);
  assert("off: first court is the 4 longest-waiting (a,b,c,d) — mixed results", ids(off[0]).sort().join() === "a,b,c,d");
  assert("missing field behaves identically to off", ids(none[0]).sort().join() === "a,b,c,d" && ids(none[1]).sort().join() === "e,f,g,h");
  assert("off never reports grouping", off.every((m) => m.fairness.usedResultGrouping === false));
}

console.log("\n4. PREFER — same-result courts are formed inside the fairness window");
{
  const p = pool(ALT);
  const out = run(p, "prefer");
  assert("two matchups", out.length === 2);
  const first = out.find((m) => ids(m).includes("a"));
  const second = out.find((m) => !ids(m).includes("a"));
  assert("the longest-waiting player (a) is still on the first court", Boolean(first));
  assert("winners' court: a,c,e,g", ids(first).sort().join() === "a,c,e,g");
  assert("losers' court: b,d,f,h", ids(second).sort().join() === "b,d,f,h");
  assert("both courts are pure", isPure(first, p) && isPure(second, p));
  assert("fairness metadata says grouping was used and names the court type", first.fairness.usedResultGrouping === true && first.fairness.resultGroup === "winners" && /Winners' court/.test(first.fairness.reason));
  assert("the losers' court is labelled too", second.fairness.resultGroup === "losers" && /Losers' court/.test(second.fairness.reason));
}

console.log("\n5. PREFER — the skip guard protects anyone clearly ahead on WAIT");
{
  // b (a loser) has waited GROUPING_SKIP_WAIT_GAP_MINUTES longer than c (a
  // winner). Grouping a winners' court would have to skip b in favour of
  // c -> not allowed in "prefer".
  const p = pool([
    { id: "a", r: "W", wait: 30 }, { id: "b", r: "L", wait: 29 },
    { id: "c", r: "W", wait: 29 - GROUPING_SKIP_WAIT_GAP_MINUTES }, { id: "d", r: "L", wait: 20 },
    { id: "e", r: "W", wait: 19 }, { id: "f", r: "L", wait: 18 }, { id: "g", r: "W", wait: 17 }, { id: "h", r: "L", wait: 16 },
  ]);
  const out = run(p, "prefer");
  const first = out.find((m) => ids(m).includes("a"));
  assert("b is NOT skipped for a winners' court (front four kept)", ids(first).sort().join() === "a,b,c,d");
  assert("grouping not reported for that court", first.fairness.usedResultGrouping === false);
  // ...but STRICT does allow it
  const strict = run(p, "strict").find((m) => ids(m).includes("a"));
  assert("strict: winners' court formed anyway (a,c,e,g)", ids(strict).sort().join() === "a,c,e,g" && strict.fairness.usedResultGrouping === true);
}

console.log("\n6. PREFER — the skip guard protects anyone clearly behind on GAMES");
{
  const p = pool([
    { id: "a", r: "W", wait: 20, games: 4 }, { id: "b", r: "L", wait: 19, games: 2 }, // b has played 2 fewer than the winners
    { id: "c", r: "W", wait: 18, games: 4 }, { id: "d", r: "L", wait: 17, games: 4 },
    { id: "e", r: "W", wait: 16, games: 4 }, { id: "f", r: "L", wait: 15, games: 4 }, { id: "g", r: "W", wait: 14, games: 4 }, { id: "h", r: "L", wait: 13, games: 4 },
  ]);
  const out = run(p, "prefer");
  const first = out.find((m) => ids(m).includes("a"));
  assert(`b (${GROUPING_SKIP_GAMES_GAP} games behind) is NOT skipped for a winners' court`, ids(first).includes("b"));
  const strict = run(p, "strict").find((m) => ids(m).includes("a"));
  assert("strict: winners' court formed anyway", ids(strict).sort().join() === "a,c,e,g");
}

console.log("\n7. The HARD rest guard still wins in every mode (fresh players can't be pulled in to make a court pure)");
{
  const p = pool([
    { id: "a", r: "W", wait: 20 }, { id: "b", r: "L", wait: 19 }, { id: "c", r: "L", wait: 18 }, { id: "d", r: "L", wait: 17 },
    { id: "e", r: "W", wait: 2 }, { id: "f", r: "W", wait: 1.5 }, { id: "g", r: "W", wait: 1 }, // just finished (< 5 min), everyone else waited 8+ longer
  ]);
  for (const mode of ["prefer", "strict"]) {
    const out = run(p, mode);
    const first = out.find((m) => ids(m).includes("a"));
    assert(`${mode}: fresh winners e/f/g are not selected over b/c/d (rest guard: gap >= ${REST_GUARD_GAP_MINUTES} min)`, ids(first).sort().join() === "a,b,c,d");
  }
}

console.log("\n8. The longest-waiting player in a division is never skipped, whatever the mode");
{
  // front player is the only loser in a sea of winners
  const p = pool([
    { id: "front", r: "L", wait: 25 },
    { id: "w1", r: "W", wait: 20 }, { id: "w2", r: "W", wait: 19 }, { id: "w3", r: "W", wait: 18 }, { id: "w4", r: "W", wait: 17 }, { id: "w5", r: "W", wait: 16 },
    { id: "l2", r: "L", wait: 15 },
  ]);
  for (const mode of ["off", "prefer", "strict"]) {
    const out = run(p, mode);
    assert(`${mode}: 'front' is on the first court`, ids(out[0]).includes("front") || out.some((m) => ids(m).includes("front")));
  }
}

console.log("\n9. Partner Requests (fixed pairs) still move as one unit under grouping");
{
  const p = pool(ALT);
  p.a.partnerId = "b";
  p.b.partnerId = "a"; // a winner and a loser who asked to stay together
  const out = run(p, "prefer");
  const withA = out.find((m) => ids(m).includes("a"));
  assert("a and b are on the same court", ids(withA).includes("b"));
  assert("a and b are on the same TEAM", (withA.teamA.includes("a") && withA.teamA.includes("b")) || (withA.teamB.includes("a") && withA.teamB.includes("b")));
}

console.log("\n10. Division wall is untouched — Beginners never share a court with Intermediates, grouping or not");
{
  const now = Date.now();
  const beg = pool(ALT, now, "beginner");
  const inter = pool(ALT.map((s) => ({ ...s, id: `i_${s.id}` })), now, "intermediate");
  const players = { ...beg, ...inter };
  for (const mode of ["prefer", "strict"]) {
    const out = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [], resultGrouping: mode });
    assert(`${mode}: every matchup is single-skill`, out.every((m) => new Set(ids(m).map((id) => players[id].skill)).size === 1));
    assert(`${mode}: 4 matchups, all pure`, out.length === 4 && out.every((m) => isPure(m, players)));
  }
}

console.log("\n11. Wiring — the session setting reaches the engine through refreshNextMatchups' extraContext");
{
  const p = pool(ALT);
  const eng = getRotationEngine("adaptiveSkill");
  const viaRefresh = refreshNextMatchups(Object.keys(p), p, [], eng, null, Infinity, null, null, { resultGrouping: "prefer" });
  assert("refreshNextMatchups + { resultGrouping: 'prefer' } forms pure courts", viaRefresh.length === 2 && viaRefresh.every((m) => isPure(m, p)));
  const viaRefreshOff = refreshNextMatchups(Object.keys(p), p, [], eng, null, Infinity, null, null, { resultGrouping: "off" });
  assert("...and 'off' keeps the strict front four", ids(viaRefreshOff[0]).sort().join() === "a,b,c,d");
  const app = read("src/PickleballOpenPlay.jsx");
  assert("the app forwards state.resultGrouping in BOTH the save() refresh and the manual regenerate (rotationEngineContext)", (app.match(/rotationEngineContext\((next|state)\)/g) || []).length === 2 && /resultGrouping: s\.resultGrouping/.test(app));
  assert("defaultState.resultGrouping is 'prefer' (new sessions), and the constant agrees", defaultState.resultGrouping === "prefer" && DEFAULT_RESULT_GROUPING === "prefer");
  assert("RESULT_GROUPING_OPTIONS lists exactly the engine's modes", RESULT_GROUPING_OPTIONS.map((o) => o.value).join(",") === RESULT_GROUPING_MODES.join(","));
  const dlg = read("src/components/SessionSettingsDialog.jsx");
  assert("Session Settings has the control, gated on showResultGrouping, and saves resultGrouping", /showResultGrouping &&/.test(dlg) && /aria-label="Result Grouping"/.test(dlg) && /resultGrouping: resultGroupingDraft/.test(dlg));
  const scorer = read("src/components/ScorerView.jsx");
  assert("Scorer passes the setting and only shows it for Skill Divisions", /showResultGrouping=\{rotationMode === "adaptiveSkill"\}/.test(scorer) && /resultGrouping=\{state\.resultGrouping\}/.test(scorer));
  assert("other engines ignore the field (BalancedRotationEngine source never reads resultGrouping)", !/resultGrouping/.test(read("src/engines/BalancedRotationEngine.js")));
}

console.log("\n12. Simulation — pure-court share goes up, games/wait fairness stays level (20 beginners + 8 intermediates, 3 courts, 40 rounds, 12 trials per mode)");
{
  function simulate(mode, trial) {
    // deterministic-ish: seeded result draws; the engine's own tie-shuffles stay random
    let seed = 1000 + trial;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const players = {};
    const now0 = Date.now();
    for (let i = 0; i < 20; i++) players[`b${i}`] = makePlayer(`b${i}`, { skill: "beginner", games: 0, checkedInAt: now0 - (20 - i) * 30000 });
    for (let i = 0; i < 8; i++) players[`i${i}`] = makePlayer(`i${i}`, { skill: "intermediate", games: 0, checkedInAt: now0 - (8 - i) * 30000 });
    const ROUND_MS = 12 * 60000;
    let now = now0;
    let courtsPlayed = 0;
    let pureCourts = 0;
    const waits = []; // minutes waited at the moment a player is put on court (after their first game)
    const realNow = Date.now;
    try {
      for (let round = 0; round < 40; round++) {
        Date.now = () => now; // the engine reads the clock for wait minutes
        const waiting = Object.keys(players);
        const out = engine.generateMatchups({ waitingIds: waiting, players, existingMatchups: [], resultGrouping: mode });
        const dispatched = out.slice(0, 3);
        for (const m of dispatched) {
          courtsPlayed++;
          if (isPure(m, players)) pureCourts++;
          const aWins = rnd() < 0.5;
          for (const id of ids(m)) {
            const p = players[id];
            if (p.games > 0) waits.push((now - p.lastMatchEndAt) / 60000);
            p.games++;
            p.lastResult = (m.teamA.includes(id) ? aWins : !aWins) ? "win" : "loss";
            p.lastMatchEndAt = now + ROUND_MS;
          }
        }
        now += ROUND_MS;
      }
    } finally {
      Date.now = realNow;
    }
    const gamesBeg = Object.values(players).filter((p) => p.skill === "beginner").map((p) => p.games);
    const gamesInt = Object.values(players).filter((p) => p.skill === "intermediate").map((p) => p.games);
    return {
      pureShare: pureCourts / courtsPlayed,
      spreadBeg: Math.max(...gamesBeg) - Math.min(...gamesBeg),
      spreadInt: Math.max(...gamesInt) - Math.min(...gamesInt),
      maxWait: Math.max(...waits),
      avgWait: waits.reduce((a, b) => a + b, 0) / waits.length,
    };
  }
  const avg = (arr, k) => arr.reduce((a, r) => a + r[k], 0) / arr.length;
  const stats = {};
  for (const mode of ["off", "prefer", "strict"]) {
    const trials = Array.from({ length: 12 }, (_, t) => simulate(mode, t));
    stats[mode] = { pureShare: avg(trials, "pureShare"), spreadBeg: avg(trials, "spreadBeg"), spreadInt: avg(trials, "spreadInt"), maxWait: avg(trials, "maxWait"), avgWait: avg(trials, "avgWait") };
    const s = stats[mode];
    console.log(`     ${mode.padEnd(6)} pure courts ${(s.pureShare * 100).toFixed(0).padStart(3)}%   games spread beg ${s.spreadBeg.toFixed(2)} / int ${s.spreadInt.toFixed(2)}   avg wait ${s.avgWait.toFixed(1)} min   max wait ${s.maxWait.toFixed(1)} min`);
  }
  assert("prefer forms far more same-result courts than off (at least +25 percentage points)", stats.prefer.pureShare >= stats.off.pureShare + 0.25);
  assert("strict forms at least as many as prefer", stats.strict.pureShare >= stats.prefer.pureShare - 0.02);
  assert("prefer keeps the beginners' games-played spread within 1 game of off", stats.prefer.spreadBeg <= stats.off.spreadBeg + 1);
  assert("prefer keeps the intermediates' games-played spread within 1 game of off", stats.prefer.spreadInt <= stats.off.spreadInt + 1);
  assert("prefer keeps the average wait within 2 minutes of off", stats.prefer.avgWait <= stats.off.avgWait + 2);
  assert("prefer keeps the longest wait within one round (12 min) of off", stats.prefer.maxWait <= stats.off.maxWait + 12);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
