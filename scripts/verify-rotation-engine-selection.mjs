// Per-session Rotation Engine selection (Adaptive Skill | Adaptive Ranking) and
// Adaptive Ranking's wait-time guard / recent same-four avoidance.
//
// Usage: node scripts/verify-rotation-engine-selection.mjs
import fs from "node:fs";

globalThis.window = { storage: {} };
const { getRotationEngine, refreshNextMatchups } = await import("../src/lib/utils.js");
const { AdaptiveSkillRotationEngine } = await import("../src/engines/AdaptiveSkillRotationEngine.js");
const { AdaptiveRankingRotationEngine, REASONS, WAIT_GUARD_GAP_MINUTES } = await import("../src/engines/AdaptiveRankingRotationEngine.js");
const { SELECTABLE_ROTATION_MODES, ROTATION_MODES, ROTATION_MODE_DESCRIPTIONS, defaultState, rotationModeLabelFor } = await import("../src/lib/constants.js");
const { matchupKeyFor } = await import("../src/lib/matchupMemory.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const NOW = 2_000_000_000_000;
const MIN = 60000;
function mk(id, { wait = 10, pts = 1000, games = 0, skill = "intermediate", extra = {} } = {}) {
  return {
    id, name: id, skill, games, checkedIn: true, held: false, status: "ACTIVE",
    rankingPoints: pts, rankingSource: "rated", checkedInAt: NOW - wait * MIN,
    partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [], ...extra,
  };
}
const mapOf = (arr) => Object.fromEntries(arr.map((p) => [p.id, p]));
const engine = new AdaptiveRankingRotationEngine();
function gen(arr, extra = {}) {
  return engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players: mapOf(arr), existingMatchups: [], now: NOW, ...extra });
}
const idsOf = (m) => [...m.teamA, ...m.teamB];
const has = (m, r) => m.reasons.includes(r);

console.log("\n1. Session configured for Adaptive Skill uses Adaptive Skill");
{
  assert("getRotationEngine('adaptiveSkill') is the AdaptiveSkillRotationEngine", getRotationEngine("adaptiveSkill") instanceof AdaptiveSkillRotationEngine);
  const arr = ["a", "b", "c", "d"].map((id, i) => mk(id, { wait: 20 - i, skill: "beginner" }));
  const out = refreshNextMatchups(arr.map((p) => p.id), mapOf(arr), [], getRotationEngine("adaptiveSkill"), null, Infinity, null, []);
  assert("its matchups carry no ranking metadata", out.length === 1 && out[0].ranking === undefined);
}

console.log("\n2. Session configured for Adaptive Ranking uses Adaptive Ranking");
{
  assert("getRotationEngine('adaptiveRanking') is the AdaptiveRankingRotationEngine", getRotationEngine("adaptiveRanking") instanceof AdaptiveRankingRotationEngine);
  const arr = ["a", "b", "c", "d"].map((id, i) => mk(id, { wait: 20 - i }));
  const out = refreshNextMatchups(arr.map((p) => p.id), mapOf(arr), [], getRotationEngine("adaptiveRanking"), null, Infinity, null, []);
  assert("its matchups carry ranking metadata (Points window / reasons)", out.length === 1 && out[0].ranking && Array.isArray(out[0].reasons));
  assert("the Create Session selector offers BOTH Adaptive Skill and Adaptive Ranking", ["adaptiveSkill", "adaptiveRanking"].every((v) => SELECTABLE_ROTATION_MODES.some((m) => m.value === v)));
  assert("Adaptive Ranking is never the default (default stays continuous, first option unchanged)", defaultState.rotationMode === "continuous" && SELECTABLE_ROTATION_MODES[0].value === ROTATION_MODES[0].value && ROTATION_MODES.length === 4);
  assert("both engines have an organizer explanation label", ROTATION_MODE_DESCRIPTIONS.adaptiveRanking.includes("Points") && ROTATION_MODE_DESCRIPTIONS.adaptiveSkill.includes("skill division"));
  assert("the live session label resolves for Adaptive Ranking (not the raw value)", rotationModeLabelFor("adaptiveRanking") !== "adaptiveRanking" && /Adaptive Ranking/.test(rotationModeLabelFor("adaptiveRanking")));
}

console.log("\n3. Recent-play protection");
{
  const arr = [mk("r1", { wait: 12 }), mk("r2", { wait: 11 }), mk("r3", { wait: 10 }), mk("r4", { wait: 9 }), mk("r5", { wait: 8 }), mk("fresh", { wait: 1, games: 0 })];
  const m = gen(arr)[0];
  assert("a player who just finished (<5 min) is not selected while 4+ rested players exist", !idsOf(m).includes("fresh") && has(m, REASONS.REST_PROTECTED));
}

console.log("\n4. Avoids an exact immediate rematch when alternatives exist");
{
  const prev = { A: ["p1", "p2"], B: ["p3", "p4"] };
  const hist = (id, partner, opps) => ({ recentPartnerIds: [partner], partnerCounts: { [partner]: 1 }, lastOpponentIds: opps, recentOpponentIds: opps, opponentCounts: Object.fromEntries(opps.map((o) => [o, 1])) });
  const arr = [
    mk("p1", { wait: 12, extra: hist("p1", "p2", prev.B) }), mk("p2", { wait: 12, extra: hist("p2", "p1", prev.B) }),
    mk("p3", { wait: 12, extra: hist("p3", "p4", prev.A) }), mk("p4", { wait: 12, extra: hist("p4", "p3", prev.A) }),
    ...["p5", "p6", "p7", "p8"].map((id) => mk(id, { wait: 11 })),
  ];
  const m = gen(arr, { maxMatchups: 1 })[0];
  const sameTeams = (a, b) => JSON.stringify([a.map((x) => [...x].sort()).sort()]) === JSON.stringify([b.map((x) => [...x].sort()).sort()]);
  assert("the new match is not the identical two teams", !sameTeams([m.teamA, m.teamB], [prev.A, prev.B]));
  assert("no two previous teammates are teamed again (hard recent-partner ban)", ![m.teamA, m.teamB].some((t) => (t.includes("p1") && t.includes("p2")) || (t.includes("p3") && t.includes("p4"))));
}

console.log("\n5. Avoids a recent same-four quartet when alternatives exist");
{
  const prevKey = matchupKeyFor(["p1", "p2"], ["p3", "p4"]);
  const arr = [mk("p1", { wait: 12 }), mk("p2", { wait: 11.5 }), mk("p3", { wait: 11 }), mk("p4", { wait: 10.5 }), ...["p5", "p6", "p7", "p8"].map((id, i) => mk(id, { wait: 10 - i * 0.2 }))];
  const withMem = gen(arr, { maxMatchups: 1, recentMatchups: [prevKey] })[0];
  const same = new Set(idsOf(withMem)).size === 4 && ["p1", "p2", "p3", "p4"].every((id) => idsOf(withMem).includes(id));
  assert("with the last quartet in memory, an alternative legal quartet is chosen", !same && has(withMem, REASONS.REPEAT_QUARTET_AVOIDED));
  const without = gen(arr, { maxMatchups: 1, recentMatchups: [] })[0];
  assert("without that memory the natural (longest-waiting) four is picked — proving the memory is what changed it", ["p1", "p2", "p3", "p4"].every((id) => idsOf(without).includes(id)));
  const thin = arr.slice(0, 4);
  const forced = gen(thin, { maxMatchups: 1, recentMatchups: [prevKey] });
  assert("with no alternative the repeat is allowed (court not left idle)", forced.length === 1);
}

console.log("\n6. Wait-time guard beats a small ranking difference");
{
  const arr = [mk("A", { wait: 34, pts: 1000 }), mk("W1", { wait: 33, pts: 1100 }), mk("W2", { wait: 32, pts: 900 }), mk("W3", { wait: 31, pts: 1000 }), mk("T1", { wait: 20, pts: 1010 }), mk("T2", { wait: 19, pts: 1020 }), mk("T3", { wait: 18, pts: 1090 })];
  const on = gen(arr, { maxMatchups: 1 })[0];
  assert("guard ON: the 31–33 min waiters play ahead of the tighter-Points 18–20 min group (gap >= " + WAIT_GUARD_GAP_MINUTES + " min)", ["W1", "W2", "W3"].every((id) => idsOf(on).includes(id)) && has(on, REASONS.WAIT_GUARD_APPLIED));
  const off = gen(arr, { maxMatchups: 1, config: { waitGuardGapMinutes: 0 } })[0];
  assert("guard OFF: the previous Points-first choice (a spread <= 100 group, without the 200-wide W1+W2) comes back", (off.ranking.pointsRange[1] - off.ranking.pointsRange[0]) <= 100 && !idsOf(off).includes("W2"));
  const small = [mk("A", { wait: 20, pts: 1000 }), mk("W1", { wait: 19, pts: 1100 }), mk("W2", { wait: 18, pts: 900 }), mk("W3", { wait: 17, pts: 1000 }), mk("T1", { wait: 16, pts: 1010 }), mk("T2", { wait: 15, pts: 1020 }), mk("T3", { wait: 14, pts: 1090 })];
  const sm = gen(small, { maxMatchups: 1 })[0];
  assert("a wait gap below the guard threshold does NOT override the Points preference (tight group kept)", (sm.ranking.pointsRange[1] - sm.ranking.pointsRange[0]) <= 100 && !idsOf(sm).includes("W2") && !has(sm, REASONS.WAIT_GUARD_APPLIED));
}

console.log("\n7. A large ranking difference is still respected when the longer waiter is not a valid candidate");
{
  const arr = [mk("A", { wait: 30, pts: 1000 }), mk("X", { wait: 29, pts: 2600 }), mk("T1", { wait: 20, pts: 1010 }), mk("T2", { wait: 19, pts: 1020 }), mk("T3", { wait: 18, pts: 1030 }), mk("T4", { wait: 17, pts: 990 })];
  const m = gen(arr, { maxMatchups: 1 })[0];
  assert("a 1600-Points-away long waiter is NOT dragged into the anchor's match", !idsOf(m).includes("X") && (m.ranking.pointsRange[1] - m.ranking.pointsRange[0]) <= 100);
}

console.log("\n8. No court is unnecessarily left idle");
{
  const twelve = Array.from({ length: 12 }, (_, i) => mk("q" + i, { wait: 20 - i, pts: 800 + i * 90 }));
  const out = gen(twelve);
  assert("12 rested players with widely spread Points fill 3 courts", out.length === 3 && new Set(out.flatMap(idsOf)).size === 12);
  const four = [mk("h1", { wait: 15, pts: 500 }), mk("h2", { wait: 14, pts: 1500 }), mk("h3", { wait: 13, pts: 2500 }), mk("h4", { wait: 12, pts: 3500 })];
  assert("4 players whose Points are wildly different still get a court", gen(four).length === 1);
  const fresh4 = [mk("f1", { wait: 1 }), mk("f2", { wait: 2 }), mk("f3", { wait: 3 }), mk("f4", { wait: 4 })];
  assert("even four just-finished players get a court when nobody else is available (rest protection relaxes)", gen(fresh4).length === 1);
}

console.log("\n9. The session engine setting persists");
{
  const state = { ...defaultState, rotationMode: "adaptiveRanking" };
  const roundTrip = JSON.parse(JSON.stringify(state));
  assert("rotationMode survives a save/load JSON round trip", roundTrip.rotationMode === "adaptiveRanking");
  assert("...and resolves to the ranking engine after reload", getRotationEngine(roundTrip.rotationMode) instanceof AdaptiveRankingRotationEngine);
  const app = read("src/PickleballOpenPlay.jsx");
  assert("the app only ever WRITES rotationMode when a session is created (never reassigned mid-session)", (app.match(/rotationMode\s*[:=]\s*[^=]/g) || []).every((s) => true) && !/save\(\{[^}]*rotationMode\s*[:=]/.test(app) && !/setState\([^)]*rotationMode/.test(app));
  assert("Session Settings shows the engine read-only ('chosen at session creation, not editable')", /chosen at session creation, not editable here/.test(read("src/components/SessionSettingsDialog.jsx")));
  assert("the Scorer shows the active engine (Rotation Mode row)", /Rotation Mode/.test(read("src/components/ScorerView.jsx")) && /rotationModeLabelFor\(rotationMode\)/.test(read("src/components/ScorerView.jsx")));
  assert("Create Session passes SELECTABLE_ROTATION_MODES and stores the choice", /rotationModes=\{SELECTABLE_ROTATION_MODES\}/.test(app) && /rotationMode,/.test(read("src/components/CreateSessionScreen.jsx")));
}

console.log("\n10. Existing Adaptive Skill behaviour is unchanged");
{
  const pl = mapOf([...["b0", "b1", "b2", "b3"].map((id, i) => mk(id, { skill: "beginner", wait: 30 - i })), ...["i0", "i1", "i2", "i3"].map((id, i) => mk(id, { skill: "intermediate", wait: 30 - i }))]);
  const asr = new AdaptiveSkillRotationEngine().generateMatchups({ waitingIds: Object.keys(pl), players: pl, existingMatchups: [] });
  assert("Adaptive Skill still fences divisions (Beginner-only and Intermediate-only matchups)", asr.length === 2 && asr.every((m) => new Set(idsOf(m).map((id) => pl[id].skill)).size === 1));
  const src = read("src/engines/AdaptiveSkillRotationEngine.js");
  assert("Adaptive Skill source neither references the ranking engine nor the new guard", !/AdaptiveRankingRotationEngine|rankingPoints|WAIT_GUARD|recentSameFour/.test(src));
  assert("Adaptive Skill's own rest guard constants are untouched (5 min fresh / 8 min gap)", /REST_GUARD_FRESH_MINUTES = 5/.test(src) && /REST_GUARD_GAP_MINUTES = 8/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
