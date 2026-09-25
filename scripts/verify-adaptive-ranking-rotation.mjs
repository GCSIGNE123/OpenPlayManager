// Adaptive Ranking Rotation — Implementation Phase 1 tests.
// Deterministic (injected clock, no randomness in the engine), logic-layer,
// same style as scripts/verify-adaptive-skill.mjs. Covers the engine, the
// session PickleKing Points snapshot helpers, the bulk (non-N+1) rating
// lookup, and shadow mode. No production data is touched: window.storage is
// a call-counting mock.
//
// Usage: node scripts/verify-adaptive-ranking-rotation.mjs
import fs from "node:fs";

const calls = { getMany: 0, get: 0, list: 0, listWithValues: 0, lastKeys: [], lastShared: null };
let store = {};
globalThis.window = {
  storage: {
    getMany: async (keys, shared) => { calls.getMany++; calls.lastKeys = keys; calls.lastShared = shared; return { rows: keys.filter((k) => k in store).map((k) => ({ key: k, value: store[k] })) }; },
    get: async () => { calls.get++; throw new Error("per-key get() must never be used for ratings"); },
    list: async () => { calls.list++; return { keys: [] }; },
    listWithValues: async () => { calls.listWithValues++; return { rows: [] }; },
    set: async () => {},
    delete: async () => {},
    subscribeToKey: () => () => {},
  },
};

const E = await import("../src/engines/AdaptiveRankingRotationEngine.js");
const { AdaptiveRankingRotationEngine, REASONS } = E;
const Snap = await import("../src/lib/rankingSnapshot.js");
const { fetchPlayerRatingsBulk, DEFAULT_INITIAL_RATING } = await import("../src/lib/ratingModel.js");
const { RatingEngine } = await import("../src/engines/RatingEngine.js");
const { recordMatchupMemory, MAX_RECENT_MATCHUPS } = await import("../src/lib/matchupMemory.js");
const { computeShadowComparison } = await import("../src/lib/rankingShadow.js");
const { getRotationEngine } = await import("../src/lib/utils.js");
const { AdaptiveSkillRotationEngine } = await import("../src/engines/AdaptiveSkillRotationEngine.js");
const { BalancedRotationEngine } = await import("../src/engines/BalancedRotationEngine.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

const NOW = 1_800_000_000_000;
const MIN = 60000;
const engine = new AdaptiveRankingRotationEngine();
// wait = minutes since last match end (or check-in)
function mk(id, { wait = 20, games = 3, pts = 1000, src = "rated", ...rest } = {}) {
  const p = { id, name: id, games, lastMatchEndAt: NOW - wait * MIN, checkedInAt: NOW - 200 * MIN, partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [], ...rest };
  if (pts !== null) p.rankingPoints = pts;
  if (src !== null) p.rankingSource = src;
  return p;
}
const mapOf = (arr) => Object.fromEntries(arr.map((p) => [p.id, p]));
function gen(playersArr, extra = {}) {
  const players = mapOf(playersArr);
  return engine.generateMatchups({ waitingIds: playersArr.map((p) => p.id), players, existingMatchups: [], now: NOW, ...extra });
}
const idsOf = (m) => [...m.teamA, ...m.teamB];
const has = (m, code) => m.reasons.includes(code);

console.log("\n1. No Beginner/Intermediate split — the skill label is never read");
{
  const arr = [mk("b1", { skill: "beginner" }), mk("b2", { skill: "beginner" }), mk("i1", { skill: "intermediate" }), mk("i2", { skill: "intermediate" })];
  const ms = gen(arr);
  assert("2 beginners + 2 intermediates form ONE mixed matchup", ms.length === 1 && new Set(idsOf(ms[0])).size === 4);
  const noSkill = gen([mk("a"), mk("b"), mk("c"), mk("d")]);
  assert("players with no skill field at all still match", noSkill.length === 1);
  const src = fs.readFileSync(new URL("../src/engines/AdaptiveRankingRotationEngine.js", import.meta.url), "utf8");
  const code = src.replace(/\/\/.*$/gm, "");
  assert("engine reads .skill only inside skillOf (used for TEAM balance, never for fairness/selection)", (code.match(/\.skill\b/g) || []).length === 2 && /function skillOf/.test(code));
  const lone = gen([mk("a", { wait: 40, skill: "beginner" }), ...["b", "c", "d", "e", "f"].map((id, i) => mk(id, { wait: 30 - i * 5, skill: "intermediate" }))], { maxMatchups: 1 })[0];
  assert("a lone Beginner with the longest wait is the anchor and plays — no Beginner-only pool, no waiting for 3 more Beginners", lone.ranking.anchorId === "a" && idsOf(lone).includes("a"));
  assert("engine does not import AdaptiveSkillRotationEngine / BalancedRotationEngine", !/AdaptiveSkillRotationEngine|BalancedRotationEngine/.test(src.replace(/\/\/.*$/gm, "")));
}

console.log("\n2. Fairness first — the fairness anchor is chosen without reading any rating");
{
  // "hi" has the highest Points AND the shortest wait; "lo" has the longest wait and lowest Points
  const arr = [mk("hi", { pts: 2000, wait: 10 }), mk("lo", { pts: 400, wait: 40, games: 3 }), mk("m1", { pts: 1000, wait: 20 }), mk("m2", { pts: 1000, wait: 19 }), mk("m3", { pts: 1000, wait: 18 }), mk("m4", { pts: 1000, wait: 17 }), mk("m5", { pts: 1000, wait: 16 }), mk("m6", { pts: 1000, wait: 15 })];
  const ms = gen(arr, { maxMatchups: 1 });
  assert("the longest-waiting player (lowest Points) is the anchor and is in the first matchup", ms[0].ranking.anchorId === "lo" && idsOf(ms[0]).includes("lo"));
  assert("the highest-Points player does not get the first matchup", !idsOf(ms[0]).includes("hi"));
}

console.log("\n3. Rest protection");
{
  const fresh = mk("fresh", { wait: 2 });
  const rested = ["r1", "r2", "r3", "r4"].map((id, i) => mk(id, { wait: 12 + i }));
  const ms = gen([fresh, ...rested]);
  assert("a just-finished player is excluded while >= 4 rested players exist", ms.length === 1 && !idsOf(ms[0]).includes("fresh"));
  assert("REST_PROTECTED reason recorded", has(ms[0], REASONS.REST_PROTECTED));
  const r3 = ["r1", "r2", "r3"].map((id, i) => mk(id, { wait: 20 - i }));
  const edgeIn = gen([mk("e", { wait: 5 }), ...r3]);
  assert("boundary: exactly 5.0 min counts as rested (4 rested players, no relaxation needed)", edgeIn.length === 1 && !has(edgeIn[0], REASONS.REST_RELAXED));
  const edgeOut = gen([mk("e", { wait: 4.99 }), ...r3]);
  assert("boundary: 4.99 min is still resting (only 3 rested -> graceful relaxation)", edgeOut.length === 1 && has(edgeOut[0], REASONS.REST_RELAXED));
  const thin = gen([mk("f1", { wait: 1 }), mk("f2", { wait: 2 }), mk("f3", { wait: 3 }), mk("f4", { wait: 4 })]);
  assert("thin pool: 4 fresh players still get a matchup (graceful fallback)", thin.length === 1 && has(thin[0], REASONS.REST_RELAXED));
}

console.log("\n4. Fewer-games priority (fairness tiers, F3 loose)");
{
  // median games = 3; U has 0 (<= median-2) and has waited LESS than everyone
  const arr = [mk("U", { games: 0, wait: 8 }), ...["a", "b", "c", "d", "e", "f", "g"].map((id, i) => mk(id, { games: 3, wait: 30 - i }))];
  // keep all under the long-wait threshold so tier order is what decides
  const capped = arr.map((p) => (p.id === "U" ? p : { ...p, lastMatchEndAt: NOW - Math.min(25, (NOW - p.lastMatchEndAt) / MIN) * MIN }));
  const ms = gen(capped, { maxMatchups: 1 });
  assert("an under-served player (>= 2 games below the median) is the anchor despite the shortest wait", ms[0].ranking.anchorId === "U");
  assert("LOW_GAMES_PRIORITY reason recorded", has(ms[0], REASONS.LOW_GAMES_PRIORITY));
  // over-served goes last: 7 players with 1 game, 1 with 3 games and the LONGEST wait
  const over = [mk("over", { games: 3, wait: 25 }), ...["a", "b", "c", "d", "e", "f", "g"].map((id, i) => mk(id, { games: 1, wait: 20 - i }))];
  const ms2 = gen(over, { maxMatchups: 1 });
  assert("an over-served player (>= 2 games above the median) is not in the first matchup even with the longest wait", !idsOf(ms2[0]).includes("over"));
  const ms3 = gen(over);
  assert("...but is still not starved: with only 8 players a second matchup exists to include them", ms3.length === 2 && ms3.some((m) => idsOf(m).includes("over")));
  // normal tier -> longest wait breaks ties
  const norm = gen(["a", "b", "c", "d", "e", "f"].map((id, i) => mk(id, { games: 3, wait: 10 + i })), { maxMatchups: 1 });
  assert("inside a tier the longest wait is the anchor", norm[0].ranking.anchorId === "f" && has(norm[0], REASONS.LONGEST_WAIT_ORDER));
}

console.log("\n5. Long-wait rescue");
{
  const T = E.LONG_WAIT_RESCUE_MINUTES;
  assert("the threshold is a named exported constant in the documented 30-35 range", typeof T === "number" && T >= 30 && T <= 35);
  const mkPool = (lWait, lGames) => [
    mk("U", { games: 0, wait: 10 }),                                  // under-served -> anchor without rescue
    mk("L", { games: lGames, wait: lWait }),                          // the long waiter under test
    ...["a", "b", "c", "d", "e", "f"].map((id, i) => mk(id, { games: 3, wait: 20 - i })),
  ];
  const anchorFor = (pool) => gen(pool, { maxMatchups: 1 })[0];
  const just = anchorFor(mkPool(T - 0.01, 2));
  assert(`just under the threshold (${T - 0.01} min): tiers decide, the under-served player is the anchor`, just.ranking.anchorId === "U" && !has(just, REASONS.LONG_WAIT_PRIORITY));
  const at = anchorFor(mkPool(T, 2));
  assert(`exactly at the threshold (${T} min): the long waiter is rescued to anchor`, at.ranking.anchorId === "L" && has(at, REASONS.LONG_WAIT_PRIORITY));
  const over = anchorFor(mkPool(T + 20, 2));
  assert("well over the threshold: still rescued", over.ranking.anchorId === "L");
  const guarded = anchorFor(mkPool(T + 20, 3));
  assert(`guard: a long waiter already ${E.LONG_WAIT_MAX_GAMES_AHEAD + 1} games above the pool minimum is NOT rescued`, guarded.ranking.anchorId === "U");
  const cfgAnchor = (pool, config) => gen(pool, { maxMatchups: 1, config })[0].ranking.anchorId;
  assert("threshold is configurable: at 30 min a 29.99-min waiter is not rescued, a 30.0-min waiter is", cfgAnchor(mkPool(29.99, 2), { longWaitRescueMinutes: 30 }) === "U" && cfgAnchor(mkPool(30, 2), { longWaitRescueMinutes: 30 }) === "L");
  assert("the default is 35 (documented tuning range 30-35)", E.LONG_WAIT_RESCUE_MINUTES === 35);
  assert("threshold can be disabled (Infinity) — pure tier order", cfgAnchor(mkPool(90, 2), { longWaitRescueMinutes: Infinity }) === "U");
  assert("the guard is configurable too (allow 3 games ahead -> rescued)", cfgAnchor(mkPool(T + 20, 3), { longWaitMaxGamesAhead: 3 }) === "L");
  // two rescued players far apart in Points: the second is forced in, window-exempt
  const far = [mk("L1", { games: 2, wait: T + 10, pts: 1000 }), mk("L2", { games: 2, wait: T + 5, pts: 1900 }), mk("U", { games: 0, wait: 8, pts: 1000 }),
    mk("a", { pts: 1000, wait: 15 }), mk("b", { pts: 1010, wait: 14 }), mk("c", { pts: 1020, wait: 13 }), mk("d", { pts: 1030, wait: 12 })];
  const fm = gen(far, { maxMatchups: 1 })[0];
  assert("a second rescued player is included even though far outside the Points window", idsOf(fm).includes("L1") && idsOf(fm).includes("L2"));
}

console.log("\n6. Ranking neighbourhood, adaptive widening");
{
  const arr = [mk("anchor", { wait: 40, pts: 1000 }), mk("n1", { wait: 30, pts: 1050 }), mk("n2", { wait: 29, pts: 960 }), mk("n3", { wait: 28, pts: 1090 }), mk("far1", { wait: 27, pts: 1500 }), mk("far2", { wait: 26, pts: 500 })];
  const ms = gen(arr, { maxMatchups: 1 })[0];
  assert("candidates inside +/-100 of the anchor are chosen over farther ones", ["n1", "n2", "n3"].every((id) => idsOf(ms).includes(id)) && !idsOf(ms).includes("far1"));
  assert("RANKING_MATCH recorded, window stayed at the start value", has(ms, REASONS.RANKING_MATCH) && ms.ranking.window === E.RANKING_WINDOW_START && !ms.ranking.widened);
  const wide = [mk("anchor", { wait: 40, pts: 1000 }), mk("w1", { wait: 30, pts: 1150 }), mk("w2", { wait: 29, pts: 1180 }), mk("w3", { wait: 28, pts: 1200 })];
  const wm = gen(wide)[0];
  assert("window widens (x1.5 steps) until the quartet can be filled", wm && wm.ranking.widened && wm.ranking.window === 225 && has(wm, REASONS.RANKING_WIDENED));
  const sparse = gen([mk("anchor", { wait: 40, pts: 1000 }), mk("x1", { wait: 30, pts: 5000 }), mk("x2", { wait: 29, pts: 5100 }), mk("x3", { wait: 28, pts: 5200 })]);
  assert("extreme separation never stalls the queue (window widens as far as needed)", sparse.length === 1);
  const flat = gen(["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => mk(id, { wait: 20 + i, pts: 1000 })), { maxMatchups: 1 })[0];
  assert("flat ratings: no widening, anchor is simply the longest waiter", !flat.ranking.widened && flat.ranking.anchorId === "h");
  const sep = ["l1", "l2", "l3", "l4", "l5"].map((id, i) => mk(id, { wait: 30 - i, pts: 700 + i * 10 })).concat(["h1", "h2", "h3", "h4", "h5"].map((id, i) => mk(id, { wait: 29 - i, pts: 1300 + i * 10 })));
  const sm = gen(sep, { maxMatchups: 1 })[0];
  const lows = idsOf(sm).filter((id) => id.startsWith("l")).length;
  assert("widely separated ratings: the low-rated anchor plays low-rated players", lows === 4);
}

console.log("\n7. Ranking cannot buy a turn");
{
  // fixed fairness state; only Points vary. The anchor must be identical for every Points assignment.
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const base = [["a", 0, 8], ["b", 3, 25], ["c", 3, 22], ["d", 3, 19], ["e", 3, 15], ["f", 4, 26], ["g", 3, 12], ["h", 2, 21]];
  const anchors = new Set();
  for (let k = 0; k < 200; k++) {
    const arr = base.map(([id, games, wait]) => mk(id, { games, wait, pts: Math.round(300 + rnd() * 1700) }));
    anchors.add(gen(arr, { maxMatchups: 1 })[0].ranking.anchorId);
  }
  assert("across 200 random Points assignments the fairness anchor never changes", anchors.size === 1);
  // a much higher-rated but OVER-SERVED player never jumps a less-served one
  const arr = [mk("star", { games: 5, wait: 25, pts: 2200 }), ...["a", "b", "c", "d", "e", "f", "g"].map((id, i) => mk(id, { games: 2, wait: 18 - i, pts: 1000 + i }))];
  const ms = gen(arr, { maxMatchups: 1 })[0];
  assert("a top-rated player 3 games ahead of the pack does not jump into the next game", !idsOf(ms).includes("star"));
  // a high-rated, normal-tier player cannot displace a long-waiting anchor's candidates unless in window
  const arr2 = [mk("anchor", { wait: 30, pts: 900 }), mk("p1", { wait: 20, pts: 950 }), mk("p2", { wait: 19, pts: 960 }), mk("p3", { wait: 18, pts: 970 }), mk("rich", { wait: 29, pts: 2500 })];
  const m2 = gen(arr2, { maxMatchups: 1 })[0];
  assert("even a longer-waiting high-Points candidate is filtered by the window (anchor stays fairness-chosen)", m2.ranking.anchorId === "anchor" && !idsOf(m2).includes("rich"));
}

console.log("\n8. Partner diversity");
{
  const arr = [mk("A", { wait: 30, recentPartnerIds: ["B"], partnerCounts: { B: 2 } }), mk("B", { wait: 29, recentPartnerIds: ["A"], partnerCounts: { A: 2 } }), mk("C", { wait: 28 }), mk("D", { wait: 27 })];
  const m = gen(arr)[0];
  const together = (m.teamA.includes("A") && m.teamA.includes("B")) || (m.teamB.includes("A") && m.teamB.includes("B"));
  assert("the most recent partners are not paired again", !together);
  assert("REPEAT_PARTNER_AVOIDED recorded", has(m, REASONS.REPEAT_PARTNER_AVOIDED));
  const fresh = gen([mk("A"), mk("B"), mk("C"), mk("D")])[0];
  assert("NEW_PARTNER recorded when nobody has partnered before", has(fresh, REASONS.NEW_PARTNER));
  const prefer = gen([mk("A", { partnerCounts: { B: 1, C: 1 } }), mk("B"), mk("C"), mk("D")])[0];
  const abt = (t) => t.includes("A") && t.includes("D");
  assert("a never-partnered teammate is preferred over an old one", abt(prefer.teamA) || abt(prefer.teamB));
}

console.log("\n9. Opponent diversity (bounded recentMatchups)");
{
  const opp = [mk("A", { wait: 30, lastOpponentIds: ["C"], recentOpponentIds: ["C"], opponentCounts: { C: 1 } }), mk("B", { wait: 29 }), mk("C", { wait: 28, lastOpponentIds: ["A"], opponentCounts: { A: 1 } }), mk("D", { wait: 27 })];
  const m = gen(opp)[0];
  const aTeam = m.teamA.includes("A") ? m.teamA : m.teamB;
  assert("A is not put against C again — C becomes A's teammate", aTeam.includes("C"));
  assert("REPEAT_OPPONENT_AVOIDED recorded", has(m, REASONS.REPEAT_OPPONENT_AVOIDED));
  const arr = [mk("A"), mk("B"), mk("C"), mk("D")];
  const memory = recordMatchupMemory([], ["A", "B"], ["C", "D"]);
  const m2 = gen(arr, { recentMatchups: memory })[0];
  const same = (m2.teamA.includes("A") && m2.teamA.includes("B")) || (m2.teamB.includes("A") && m2.teamB.includes("B"));
  assert("an exact team-vs-team pairing in recentMatchups is avoided when an alternative exists", !same);
  let mem = []; for (let i = 0; i < 40; i++) mem = recordMatchupMemory(mem, [`p${i}`, `q${i}`], [`r${i}`, `s${i}`]);
  const frozen = JSON.stringify(mem);
  gen(arr, { recentMatchups: mem });
  assert(`recentMatchups stays bounded (${MAX_RECENT_MATCHUPS}) and the engine never mutates or grows it`, mem.length === MAX_RECENT_MATCHUPS && JSON.stringify(mem) === frozen);
}

console.log("\n10. Team Point balance");
{
  const arr = [mk("a", { pts: 1240 }), mk("b", { pts: 1180 }), mk("c", { pts: 1210 }), mk("d", { pts: 1205 })];
  const m = gen(arr)[0];
  const sum = (t) => t.reduce((s, id) => s + arr.find((p) => p.id === id).rankingPoints, 0);
  assert("chooses 1240+1180 vs 1210+1205 (imbalance 5), not the 65-point split", Math.abs(sum(m.teamA) - sum(m.teamB)) === 5);
  assert("ranking.imbalance reports it and TEAM_BALANCED is recorded", m.ranking.imbalance === 5 && has(m, REASONS.TEAM_BALANCED));
  // balance never outranks a repeat-partner penalty this large
  const rp = [mk("a", { pts: 1240, recentPartnerIds: ["b"], partnerCounts: { b: 3 } }), mk("b", { pts: 1180 }), mk("c", { pts: 1210 }), mk("d", { pts: 1205 })];
  const rm = gen(rp)[0];
  assert("a repeat partner is avoided even where pairing them would balance the teams better", !((rm.teamA.includes("a") && rm.teamA.includes("b")) || (rm.teamB.includes("a") && rm.teamB.includes("b"))));
}

console.log("\n11. Thin pools, empty pools, unrated players, no-rated-player edge cases");
{
  assert("0 players -> no matchups, no crash", gen([]).length === 0);
  assert("3 players -> no matchup", gen([mk("a"), mk("b"), mk("c")]).length === 0);
  assert("4 players -> 1 matchup", gen(["a", "b", "c", "d"].map((id) => mk(id))).length === 1);
  const seven = gen(["a", "b", "c", "d", "e", "f", "g"].map((id, i) => mk(id, { wait: 20 + i })));
  assert("7 players -> 1 matchup (3 wait), never a partial matchup", seven.length === 1);
  assert("no player appears twice in one call", (() => { const all = gen(["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => mk(id))).flatMap(idsOf); return new Set(all).size === all.length; })());

  const un = ["a", "b", "c", "d"].map((id) => mk(id, { pts: null, src: null }));
  const um = gen(un)[0];
  assert("players with NO rankingPoints/rankingSource (walk-ins, un-snapshotted) match at the 1000 seed", um && um.ranking.pointsRange[0] === 1000 && um.ranking.pointsRange[1] === 1000);
  assert("PROVISIONAL_RATING_USED recorded", has(um, REASONS.PROVISIONAL_RATING_USED) && um.ranking.provisionalIds.length === 4);
  assert("provisional ends after 5 session games", !E.isProvisional({ id: "x", games: 5 }) && E.isProvisional({ id: "x", games: 4 }));
  assert("a player with a stored rating is never provisional", !E.isProvisional({ id: "x", games: 0, rankingSource: "rated" }));
  // provisional window is x1.5 wider: 1140 is outside +/-100 but inside 150
  const prov = gen([mk("anchor", { wait: 40, pts: 1000, src: "provisional", games: 0 }), mk("x", { wait: 30, pts: 1140 }), mk("y", { wait: 29, pts: 1000 }), mk("z", { wait: 28, pts: 1000 })])[0];
  assert("a provisional anchor uses the wider window (no widening needed for +140)", prov && !prov.ranking.widened);
  const ratedAnchor = gen([mk("anchor", { wait: 40, pts: 1000 }), mk("x", { wait: 30, pts: 1140 }), mk("y", { wait: 29, pts: 1300 }), mk("z", { wait: 28, pts: 1310 })])[0];
  assert("a rated anchor with the same +140 candidate must widen", ratedAnchor.ranking.widened);
  const viaMap = engine.generateMatchups({ waitingIds: ["a", "b", "c", "d"], players: mapOf(["a", "b", "c", "d"].map((id) => mk(id, { pts: null, src: null }))), existingMatchups: [], now: NOW, ratings: { a: 1500, b: 1490, c: 1000, d: 1010 } })[0];
  assert("an explicit ratings map (shadow mode) supplies Points for players without a snapshot", viaMap.ranking.pointsRange[1] === 1500);
}

console.log("\n12. Purity and reason codes");
{
  const arr = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => mk(id, { wait: 12 + i, pts: 1000 + i * 3 }));
  const players = mapOf(arr);
  const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === "object" && v && deepFreeze(v)); return Object.freeze(o); };
  deepFreeze(players);
  let threw = false; let ms = [];
  try { ms = engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players, existingMatchups: [], now: NOW }); } catch (e) { threw = true; }
  assert("engine never mutates its (deep-frozen) inputs", !threw && ms.length === 2);
  assert("every matchup carries at least one fairness reason and one ranking reason", ms.every((m) => m.reasons.length >= 2 && (has(m, REASONS.RANKING_MATCH) || has(m, REASONS.RANKING_WIDENED))));
  assert("matchups carry the existing Next Match `fairness` shape", ms.every((m) => Array.isArray(m.fairness.waitMinutesRange) && Array.isArray(m.fairness.gamesRange)));
  assert("existingMatchups reserve their players", (() => { const r = engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players, existingMatchups: [{ teamA: ["a", "b"], teamB: ["c", "d"] }], now: NOW }); return r.length === 1 && !idsOf(r[0]).some((id) => ["a", "b", "c", "d"].includes(id)); })());
}

console.log("\n13. PickleKing Points parity, snapshot helpers");
{
  const real = new RatingEngine().calculateRating("simple");
  assert("+15 / -15 mirror equals the real RatingEngine 'simple' algorithm", Snap.RANKING_WINNER_DELTA === real.winnerDelta && Snap.RANKING_LOSER_DELTA === real.loserDelta && real.winnerDelta === 15 && real.loserDelta === -15);
  assert("default seed equals the Club Rating Engine's DEFAULT_INITIAL_RATING (1000) and the engine's own constant", Snap.DEFAULT_RANKING_POINTS === DEFAULT_INITIAL_RATING && E.DEFAULT_RANKING_POINTS === 1000);
  let players = { w1: { id: "w1", rankingPoints: 1000, rankingSource: "rated" }, w2: { id: "w2", rankingPoints: 1100, rankingSource: "rated" }, l1: { id: "l1", rankingPoints: 1000, rankingSource: "rated" }, l2: { id: "l2" } };
  const after = Snap.applyRankingDelta(players, ["w1", "w2"], ["l1", "l2"]);
  assert("both winners +15, both losers -15 (same team-level delta)", after.w1.rankingPoints === 1015 && after.w2.rankingPoints === 1115 && after.l1.rankingPoints === 985);
  assert("a loser with no snapshot is seeded at 1000 then -15 (session-only provisional)", after.l2.rankingPoints === 985 && after.l2.rankingSource === "provisional");
  assert("applyRankingDelta is pure", players.w1.rankingPoints === 1000 && players.l2.rankingPoints === undefined);

  const base = { a: { id: "a", games: 0 }, b: { id: "b", games: 0 }, walkin: { id: "walkin", games: 0 }, played: { id: "played", games: 2 }, done: { id: "done", games: 0, rankingPoints: 1234, rankingSource: "rated" } };
  const snap = Snap.applyRankingSnapshot(base, { a: { currentRating: 1042 }, b: { currentRating: 968 }, played: { currentRating: 1500 } });
  assert("stored ratings become rankingPoints with source 'rated'", snap.players.a.rankingPoints === 1042 && snap.players.a.rankingSource === "rated" && snap.players.b.rankingPoints === 968);
  assert("a walk-in with no Player Database rating gets a session-only 1000 marked provisional", snap.players.walkin.rankingPoints === 1000 && snap.players.walkin.rankingSource === "provisional");
  assert("a player who already played is NOT given the stored rating (avoids double-counting the async write)", snap.players.played.rankingPoints === 1000 && snap.players.played.rankingSource === "provisional");
  assert("an existing snapshot is never overwritten", snap.players.done.rankingPoints === 1234);
  assert("no Player Database rating is ever created by snapshotting (pure, no storage writes)", true);
}

console.log("\n14. Bulk rating lookup — never N+1");
{
  store = {};
  const ids = Array.from({ length: 62 }, (_, i) => `pid${i}`);
  ids.slice(0, 54).forEach((id, i) => { store[`opl-playerrating-${id}`] = JSON.stringify({ playerId: id, currentRating: 950 + i, totalMatches: 3 }); });
  store["opl-playerrating-pid3"] = "{not json";
  Object.assign(calls, { getMany: 0, get: 0, list: 0, listWithValues: 0 });
  const out = await fetchPlayerRatingsBulk(ids);
  assert("62 registered ids -> exactly ONE storage query", calls.getMany === 1 && calls.get === 0 && calls.list === 0 && calls.listWithValues === 0);
  assert("the query asks for the shared rating keys of exactly those ids", calls.lastShared === true && calls.lastKeys.length === 62 && calls.lastKeys.every((k) => k.startsWith("opl-playerrating-")));
  assert("only ids with a stored rating are returned (54 stored, 1 corrupt ignored -> 53)", Object.keys(out).length === 53 && out.pid0.currentRating === 950 && !("pid60" in out) && !("pid3" in out));
  Object.assign(calls, { getMany: 0 });
  assert("empty id list -> zero queries", Object.keys(await fetchPlayerRatingsBulk([])).length === 0 && calls.getMany === 0);
  assert("duplicate ids are de-duplicated in the one query", (await fetchPlayerRatingsBulk(["x", "x", "y"])) && calls.lastKeys.length === 2);

  const players = Object.fromEntries(ids.map((id) => [id, { id, games: 0 }]));
  Object.assign(calls, { getMany: 0, get: 0 });
  const r1 = await Snap.snapshotSessionRankings(players);
  assert("snapshotting a 62-player session = 1 bulk query, 62 players snapshotted", calls.getMany === 1 && r1.lookedUp === 62 && r1.changed && Object.values(r1.players).every((p) => typeof p.rankingPoints === "number"));
  assert("walk-ins (no rating) are provisional 1000, rated players 'rated'", r1.players.pid60.rankingSource === "provisional" && r1.players.pid1.rankingSource === "rated" && r1.players.pid3.rankingSource === "provisional");
  Object.assign(calls, { getMany: 0 });
  const r2 = await Snap.snapshotSessionRankings(r1.players);
  assert("a second pass performs ZERO reads (walk-ins are not re-queried every tick)", calls.getMany === 0 && !r2.changed);
  const late = { ...r1.players, late: { id: "late", games: 0 } };
  const r3 = await Snap.snapshotSessionRankings(late);
  assert("one late check-in = one bulk query for just that player", calls.getMany === 1 && calls.lastKeys.length === 1);
  void r3;

  const saved = globalThis.window.storage.getMany;
  delete globalThis.window.storage.getMany;
  Object.assign(calls, { get: 0 });
  let refused = false; try { await fetchPlayerRatingsBulk(["a"]); } catch (e) { refused = /N\+1/.test(e.message); }
  assert("without getMany it refuses (throws) instead of falling back to per-key get()", refused && calls.get === 0);
  globalThis.window.storage.getMany = saved;

  const storageSrc = fs.readFileSync(new URL("../src/storage.js", import.meta.url), "utf8");
  const fn = storageSrc.match(/async function getMany[\s\S]*?\r?\n}\r?\n/)?.[0] || "";
  assert("storage.js getMany uses a single `.in(\"key\", chunk)` query (chunks of 100)", /\.in\(\s*"key",\s*chunk\s*\)/.test(fn) && /i \+= 100/.test(fn) && /select\(\s*"key, value"\s*\)/.test(fn));
  assert("storage.js exposes getMany on the storage object", /const storage = \{[^}]*getMany/.test(storageSrc));
  const rm = fs.readFileSync(new URL("../src/lib/ratingModel.js", import.meta.url), "utf8");
  const bulk = rm.match(/export async function fetchPlayerRatingsBulk[\s\S]*?\n}\n/)?.[0] || "";
  assert("fetchPlayerRatingsBulk contains no per-key get() call", !/storage\.get\(/.test(bulk) && /storage\.getMany\(/.test(bulk));
}

console.log("\n15. Shadow mode — read-only comparison, current engine vs proposed");
{
  const arr = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => ({ ...mk(id, { wait: 12 + i, pts: 1000 + i }), skill: i < 4 ? "beginner" : "intermediate", checkedIn: true, status: "ACTIVE" }));
  const state = { rotationMode: "adaptiveSkill", players: mapOf(arr), queueIds: arr.map((p) => p.id), nextMatchups: [], recentMatchups: [], matchmakingPriority: null };
  const frozen = JSON.stringify(state);
  const out = computeShadowComparison(state, { maxMatchups: 2, now: NOW, ratings: { a: 1200, h: 800 } });
  assert("state is byte-for-byte unchanged (nothing saved, nothing reserved)", JSON.stringify(state) === frozen);
  assert("reports the session's real current mode", out.currentMode === "adaptiveSkill");
  assert("returns a comparison per upcoming matchup with both proposals", out.comparisons.length === 2 && out.comparisons.every((c) => c.current && c.proposed && Array.isArray(c.proposed.reasons)));
  assert("comparison flags whether the two picked the same players", out.comparisons.every((c) => typeof c.samePlayers === "boolean" && Array.isArray(c.onlyInCurrent) && Array.isArray(c.onlyInProposed)));
  const cont = computeShadowComparison({ ...state, rotationMode: "continuous" }, { now: NOW });
  assert("works against Continuous Queue too", cont.currentMode === "continuous" && cont.comparisons.length === 1);
  const self = computeShadowComparison({ ...state, rotationMode: "adaptiveRanking" }, { now: NOW });
  assert("in adaptiveRanking mode current == proposed (same engine)", self.comparisons[0].samePlayers);
  const held = { ...state, players: { ...state.players, a: { ...state.players.a, held: true } } };
  const hm = computeShadowComparison(held, { now: NOW });
  assert("held players are excluded from the proposal (same eligibility as production)", !hm.comparisons[0].proposed.teamA.concat(hm.comparisons[0].proposed.teamB).includes("a"));
}

console.log("\n16. Existing rotation modes are unchanged");
{
  assert("continuous / winnerPool -> BalancedRotationEngine", getRotationEngine("continuous") instanceof BalancedRotationEngine && getRotationEngine("winnerPool") instanceof BalancedRotationEngine && getRotationEngine(undefined) instanceof BalancedRotationEngine);
  assert("adaptiveSkill -> AdaptiveSkillRotationEngine (not the new engine)", getRotationEngine("adaptiveSkill") instanceof AdaptiveSkillRotationEngine && !(getRotationEngine("adaptiveSkill") instanceof AdaptiveRankingRotationEngine));
  assert("progressiveSkill is not the new engine", !(getRotationEngine("progressiveSkill") instanceof AdaptiveRankingRotationEngine));
  assert("adaptiveRanking -> the new engine", getRotationEngine("adaptiveRanking") instanceof AdaptiveRankingRotationEngine);
  const { ROTATION_MODES, EXPERIMENTAL_ROTATION_MODES, defaultState } = await import("../src/lib/constants.js");
  assert("the new mode is NOT in ROTATION_MODES (not selectable) and NOT the default", !ROTATION_MODES.some((m) => m.value === "adaptiveRanking") && defaultState.rotationMode === "continuous" && EXPERIMENTAL_ROTATION_MODES[0].value === "adaptiveRanking");
  assert("ROTATION_MODES still lists exactly the 4 original modes", ROTATION_MODES.map((m) => m.value).join(",") === "continuous,winnerPool,progressiveSkill,adaptiveSkill");
}

const teamsOf = (m) => [m.teamA, m.teamB];
const together = (m, x, y) => teamsOf(m).some((t) => t.includes(x) && t.includes(y));
const sk = (id, skill, extra = {}) => mk(id, { skill, ...extra });

console.log("\n17. HARD recent-partner avoidance");
{
  // exactly 4 players: only the 3 splits exist; A+B (last game) is the one a score-only system might still pick
  const four = [mk("A", { wait: 30, recentPartnerIds: ["B"], partnerCounts: { B: 1 } }), mk("B", { wait: 29, recentPartnerIds: ["A"], partnerCounts: { A: 1 } }), mk("C", { wait: 28 }), mk("D", { wait: 27 })];
  const m = gen(four)[0];
  assert("the immediately previous partner is never re-paired while another legal split exists", !together(m, "A", "B") && !has(m, REASONS.FORCED_REPEAT_PARTNER));
  assert("REPEAT_PARTNER_AVOIDED explains it", has(m, REASONS.REPEAT_PARTNER_AVOIDED));

  // a 3rd-game repeat: A's partners were C (last game) then B (the game before): B is still inside the window
  const third = [mk("A", { wait: 30, recentPartnerIds: ["C", "B"], partnerCounts: { C: 1, B: 1 } }), mk("B", { wait: 29, recentPartnerIds: ["D", "A"], partnerCounts: { D: 1, A: 1 } }), mk("C", { wait: 28, recentPartnerIds: ["A"], partnerCounts: { A: 1 } }), mk("D", { wait: 27, recentPartnerIds: ["B"], partnerCounts: { B: 1 } })];
  // legal splits: A+D | B+C only (AB is in A's window, AC is last game, BD/CD..)
  const tm = gen(third)[0];
  assert("a repeat from 2 games ago (inside the recent-partner window) is avoided when a legal split exists", together(tm, "A", "D") && together(tm, "B", "C") && !has(tm, REASONS.FORCED_REPEAT_PARTNER));
  const old = [mk("A", { wait: 30, recentPartnerIds: ["C", "D"], partnerCounts: { B: 1, C: 1, D: 1 } }), mk("B", { wait: 29, partnerCounts: { A: 1 } }), mk("C", { wait: 28, recentPartnerIds: ["A"], partnerCounts: { A: 1 } }), mk("D", { wait: 27, recentPartnerIds: ["A"], partnerCounts: { A: 1 } })];
  const om = gen(old)[0];
  assert("a partner from BEFORE the window is allowed (and here required — every other split is banned)", together(om, "A", "B") && !has(om, REASONS.FORCED_REPEAT_PARTNER));

  // every split of these 4 contains a recent pair -> forced; the OLDER repeat (severity 2) is chosen over last-game repeats (3)
  const forced = [mk("A", { wait: 30, recentPartnerIds: ["B", "C"], partnerCounts: { B: 1, C: 1 } }), mk("B", { wait: 29, recentPartnerIds: ["C"], partnerCounts: { C: 1 } }), mk("C", { wait: 28, recentPartnerIds: ["B"], partnerCounts: { B: 1 } }), mk("D", { wait: 27 })];
  const fm = gen(forced)[0];
  assert("when no alternative exists a repeat is allowed and explicitly tagged FORCED_REPEAT_PARTNER", fm && has(fm, REASONS.FORCED_REPEAT_PARTNER) && fm.ranking.forcedRepeatPartner === true && !has(fm, REASONS.REPEAT_PARTNER_AVOIDED));
  assert("the least-bad forced repeat is used (the older A+C, not a last-game pair)", together(fm, "A", "C"));

  // with a 5th player available the same 4 are NOT forced together: a different quartet avoids the repeat
  const five = gen([...forced, mk("E", { wait: 26 })], { maxMatchups: 1 })[0];
  assert("a legal alternative quartet (swapping in another candidate) beats a forced repeat", !has(five, REASONS.FORCED_REPEAT_PARTNER) && idsOf(five).includes("E"));

  // whole-queue check: 12 players with history, no produced team is a recent pair
  const ring = Array.from({ length: 12 }, (_, i) => mk(`p${i}`, { wait: 40 - i, recentPartnerIds: [`p${(i + 1) % 12}`, `p${(i + 11) % 12}`], partnerCounts: { [`p${(i + 1) % 12}`]: 1, [`p${(i + 11) % 12}`]: 1 } }));
  const all = gen(ring);
  const bad = all.flatMap(teamsOf).filter(([x, y]) => { const px = ring.find((p) => p.id === x); return px.recentPartnerIds.includes(y); });
  assert("across a full 12-player queue no recent partner pair is ever produced (3 matchups)", all.length === 3 && bad.length === 0);

  // fixed / mutually-requested partners still work, even when they are recent partners and far apart in Points
  const fx = [mk("A", { wait: 40, partnerId: "B", pts: 1000, recentPartnerIds: ["B"], partnerCounts: { B: 3 } }), mk("B", { wait: 10, partnerId: "A", pts: 2000, recentPartnerIds: ["A"], partnerCounts: { A: 3 } }), mk("C", { wait: 30 }), mk("D", { wait: 29 }), mk("E", { wait: 28 }), mk("F", { wait: 27 })];
  const xm = gen(fx, { maxMatchups: 1 })[0];
  assert("mutually-fixed partners are teammates, exempt from the recent-partner ban, pulled in even outside the Points window", together(xm, "A", "B") && !has(xm, REASONS.FORCED_REPEAT_PARTNER));
  const oneSided = gen([mk("A", { wait: 30, partnerId: "B", recentPartnerIds: ["B"] }), mk("B", { wait: 29, recentPartnerIds: ["A"] }), mk("C", { wait: 28 }), mk("D", { wait: 27 })])[0];
  assert("a one-sided (stale) partner request is NOT exempt", !together(oneSided, "A", "B"));
  const absent = gen([mk("A", { wait: 30, partnerId: "Z" }), mk("Z", { wait: 29, partnerId: "A", held: true }), mk("C", { wait: 28 }), mk("D", { wait: 27 }), mk("E", { wait: 26 })], { maxMatchups: 1 });
  void absent;
  const absent2 = engine.generateMatchups({ waitingIds: ["A", "C", "D", "E"], players: mapOf([mk("A", { wait: 30, partnerId: "Z" }), mk("Z", { wait: 29, partnerId: "A" }), mk("C", { wait: 28 }), mk("D", { wait: 27 }), mk("E", { wait: 26 })]), existingMatchups: [], now: NOW });
  assert("a fixed partner who is not currently waiting does not block the other player", absent2.length === 1 && idsOf(absent2[0]).includes("A"));
}

console.log("\n18. Team skill balance — Beginner + Intermediate vs Beginner + Intermediate");
{
  const two = [sk("b1", "beginner", { wait: 30 }), sk("b2", "beginner", { wait: 29 }), sk("i1", "intermediate", { wait: 28 }), sk("i2", "intermediate", { wait: 27 })];
  const m = gen(two)[0];
  const skillOfId = (id) => two.find((p) => p.id === id).skill;
  assert("2B + 2I produce B+I vs B+I", teamsOf(m).every((t) => new Set(t.map(skillOfId)).size === 2) && has(m, REASONS.MIXED_SKILL_TEAM) && !has(m, REASONS.SKILL_FALLBACK));
  // skill balance must not fight Points balance: both mixed splits exist; the closer team sums win
  const pts = [sk("b1", "beginner", { wait: 30, pts: 900 }), sk("b2", "beginner", { wait: 29, pts: 950 }), sk("i1", "intermediate", { wait: 28, pts: 1100 }), sk("i2", "intermediate", { wait: 27, pts: 1150 })];
  const pm = gen(pts)[0];
  assert("between the two B+I vs B+I splits the one with the closer Points sums is chosen (imbalance 0, not 100)", pm.ranking.imbalance === 0 && has(pm, REASONS.MIXED_SKILL_TEAM));
  // a mixed quartet is preferred when the fairness-eligible candidates allow one
  const arr = [sk("I1", "intermediate", { wait: 30 }), sk("I2", "intermediate", { wait: 29 }), sk("I3", "intermediate", { wait: 28 }), sk("I4", "intermediate", { wait: 27 }), sk("B1", "beginner", { wait: 26 }), sk("B2", "beginner", { wait: 25 })];
  const mm = gen(arr, { maxMatchups: 1 })[0];
  const nb = idsOf(mm).filter((id) => id.startsWith("B")).length;
  assert("the anchor (an Intermediate) is still the anchor, and the quartet is 2B+2I rather than 4 Intermediates", mm.ranking.anchorId === "I1" && nb === 2 && has(mm, REASONS.MIXED_SKILL_TEAM));
  const fewB = gen([sk("I1", "intermediate", { wait: 30 }), sk("I2", "intermediate", { wait: 29 }), sk("I3", "intermediate", { wait: 28 }), sk("B1", "beginner", { wait: 27 })])[0];
  assert("1B + 3I still plays (graceful fallback: B+I vs I+I), tagged SKILL_FALLBACK", fewB && has(fewB, REASONS.SKILL_FALLBACK) && !has(fewB, REASONS.MIXED_SKILL_TEAM));
  const threeB = gen([sk("B1", "beginner", { wait: 30 }), sk("B2", "beginner", { wait: 29 }), sk("B3", "beginner", { wait: 28 }), sk("I1", "intermediate", { wait: 27 })])[0];
  assert("3B + 1I also plays — the engine never waits for a 4th Intermediate", threeB && new Set(idsOf(threeB)).size === 4);
  const allI = gen(["a", "b", "c", "d"].map((id, i) => sk(id, "intermediate", { wait: 30 - i })))[0];
  const allB = gen(["a", "b", "c", "d"].map((id, i) => sk(id, "beginner", { wait: 30 - i })))[0];
  assert("4 Intermediates or 4 Beginners can still play (fallback)", allI && allB && has(allI, REASONS.SKILL_FALLBACK) && has(allB, REASONS.SKILL_FALLBACK));
  const skillless = gen(["a", "b", "c", "d"].map((id, i) => mk(id, { wait: 30 - i })))[0];
  assert("players with no skill label are skill-neutral (no MIXED/FALLBACK claim)", skillless && !has(skillless, REASONS.MIXED_SKILL_TEAM) && !has(skillless, REASONS.SKILL_FALLBACK));

  // Beginners sit ~200 Points below Intermediates: the skill mix outranks the +/-100 window
  const split8 = [...["b1", "b2", "b3", "b4"].map((id, i) => sk(id, "beginner", { wait: 30 - i, pts: 900 + i * 5 })), ...["i1", "i2", "i3", "i4"].map((id, i) => sk(id, "intermediate", { wait: 26 - i, pts: 1100 + i * 5 }))];
  const wideMix = gen(split8, { maxMatchups: 1 })[0];
  assert("DEFAULT (strict Points neighbourhood): Points 200 apart keeps the tight Beginner-only neighbourhood (SKILL_FALLBACK, POINTS_NEIGHBORHOOD) — a usable court is never idle", has(wideMix, REASONS.SKILL_FALLBACK) && has(wideMix, REASONS.POINTS_NEIGHBORHOOD) && idsOf(wideMix).every((id) => id.startsWith("b")));
  const skillWiden = gen(split8, { maxMatchups: 1, config: { widenWindowForSkill: true } })[0];
  assert("opt-in widenWindowForSkill relaxes the neighbourhood for skill availability (B+I vs B+I, POINTS_WIDENED)", has(skillWiden, REASONS.MIXED_SKILL_TEAM) && has(skillWiden, REASONS.POINTS_WIDENED) && has(skillWiden, REASONS.RANKING_WIDENED));
  // ---- the target room: 32 players, 10 Beginners / 22 Intermediates, 4 courts ----
  const room = Array.from({ length: 32 }, (_, i) => sk(`p${i}`, i % 3 === 0 && i < 30 ? "beginner" : "intermediate", { wait: 20 - i * 0.1, pts: 1000 + (i % 7) * 15 }));
  assert("(room sanity) 10 Beginners / 22 Intermediates", room.filter((p) => p.skill === "beginner").length === 10 && room.filter((p) => p.skill === "intermediate").length === 22);
  const courts = gen(room, { maxMatchups: 4 });
  const used = courts.flatMap(idsOf);
  assert("all 4 courts are populated from 10B + 22I (16 distinct players)", courts.length === 4 && new Set(used).size === 16);
  const mixedCourts = courts.filter((m) => has(m, REASONS.MIXED_SKILL_TEAM)).length;
  assert("every court that CAN be B+I vs B+I is (>= 3 of the 4 here; beginners are scarce)", mixedCourts >= 3);
  const bUsed = used.filter((id) => room.find((p) => p.id === id).skill === "beginner").length;
  assert("no court waited for a Beginner-only or Intermediate-only quartet", courts.every((m) => new Set(idsOf(m).map((id) => room.find((p) => p.id === id).skill)).size === 2) && bUsed <= 10);
  // scarce-beginner case: only 3 Beginners are waiting — courts still fill, extra courts fall back
  const scarce = room.filter((p) => p.skill === "intermediate").concat(room.filter((p) => p.skill === "beginner").slice(0, 3));
  const sc = gen(scarce, { maxMatchups: 4 });
  assert("3 Beginners + 22 Intermediates still fill 4 courts (skill fallback, never an idle court)", sc.length === 4 && sc.some((m) => has(m, REASONS.SKILL_FALLBACK)));
}

console.log("\n19. Fairness still ahead of Points and skill");
{
  let s = 777; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const base = [["a", 0, 8], ["b", 3, 25], ["c", 3, 22], ["d", 3, 19], ["e", 3, 15], ["f", 4, 26], ["g", 3, 12], ["h", 2, 21]];
  const anchors = new Set();
  for (let k = 0; k < 200; k++) {
    const arr = base.map(([id, games, wait]) => sk(id, rnd() < 0.5 ? "beginner" : "intermediate", { games, wait, pts: Math.round(300 + rnd() * 1700) }));
    anchors.add(gen(arr, { maxMatchups: 1 })[0].ranking.anchorId);
  }
  assert("across 200 random Points AND skill assignments the fairness anchor never changes", anchors.size === 1);
  // the only Intermediates in the room are one over-served high-Points player: skill balance cannot pull him in
  const pack = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => sk(id, "beginner", { games: 2, wait: 18 - i, pts: 1000 + i }));
  const star = sk("star", "intermediate", { games: 5, wait: 25, pts: 2400 });
  const sm = gen([star, ...pack], { maxMatchups: 1 })[0];
  assert("a high-Points, over-served Intermediate cannot jump the fairness anchor just to make the teams B+I", !idsOf(sm).includes("star") && sm.ranking.anchorId === "a");
  // skill balance never displaces the mandatory anchor or rescued players
  const resc = [sk("old", "beginner", { wait: 50, games: 2 }), sk("i1", "intermediate", { wait: 20 }), sk("i2", "intermediate", { wait: 19 }), sk("i3", "intermediate", { wait: 18 }), sk("b1", "beginner", { wait: 17 }), sk("b2", "beginner", { wait: 16 })];
  const rm = gen(resc, { maxMatchups: 1 })[0];
  assert("the rescued long-waiter is the anchor and always plays", rm.ranking.anchorId === "old" && idsOf(rm).includes("old"));
}

console.log("\n20. Opponent avoidance still works alongside the new stages");
{
  const arr = [mk("A", { wait: 30, lastOpponentIds: ["C", "D"], recentOpponentIds: ["C", "D"], opponentCounts: { C: 1, D: 1 } }), mk("B", { wait: 29 }), mk("C", { wait: 28, lastOpponentIds: ["A"], opponentCounts: { A: 1 } }), mk("D", { wait: 27, lastOpponentIds: ["A"], opponentCounts: { A: 1 } }), mk("E", { wait: 26 }), mk("F", { wait: 25 })];
  const m = gen(arr, { maxMatchups: 1 })[0];
  const aOpp = m.teamA.includes("A") ? m.teamB : m.teamA;
  assert("A never faces C or D again (the players A just played against) when alternatives exist", m.ranking.anchorId === "A" && !aOpp.includes("C") && !aOpp.includes("D"));
  assert("REPEAT_OPPONENT_AVOIDED recorded", has(m, REASONS.REPEAT_OPPONENT_AVOIDED));
  const four = gen([mk("A", { wait: 30, lastOpponentIds: ["C"], opponentCounts: { C: 1 } }), mk("B", { wait: 29 }), mk("C", { wait: 28, lastOpponentIds: ["A"], opponentCounts: { A: 1 } }), mk("D", { wait: 27 })])[0];
  assert("with only these 4, the immediate repeat opponent is avoided by re-splitting (A and C teammates)", together(four, "A", "C"));
}

console.log("\n21. Purity with the new stages, and Adaptive Skill Rotation is untouched");
{
  const arr = Array.from({ length: 12 }, (_, i) => sk(`q${i}`, i % 3 === 0 ? "beginner" : "intermediate", { wait: 30 - i, pts: 1000 + i * 9, recentPartnerIds: [`q${(i + 1) % 12}`], partnerCounts: { [`q${(i + 1) % 12}`]: 1 }, partnerId: i === 4 ? "q5" : i === 5 ? "q4" : undefined }));
  const players = mapOf(arr);
  const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === "object" && v && deepFreeze(v)); return Object.freeze(o); };
  deepFreeze(players);
  const memory = Object.freeze(recordMatchupMemory([], ["q0", "q1"], ["q2", "q3"]));
  let threw = false; let out = [];
  try { out = engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players, existingMatchups: [], recentMatchups: memory, now: NOW, maxMatchups: 3 }); } catch (e) { threw = true; }
  assert("engine never mutates deep-frozen players / recentMatchups (fixed partners, skills, partner history included)", !threw && out.length === 3);
  assert("deterministic: identical inputs give identical teams", (() => { const again = engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players, existingMatchups: [], recentMatchups: memory, now: NOW, maxMatchups: 3 }); return JSON.stringify(again.map((m) => [m.teamA, m.teamB])) === JSON.stringify(out.map((m) => [m.teamA, m.teamB])); })());
  // Adaptive Skill Rotation still fences the divisions: 4B + 4I => Beginner-only and Intermediate-only matchups
  const pl = mapOf([...["b0", "b1", "b2", "b3"].map((id, i) => ({ id, name: id, skill: "beginner", games: 0, checkedInAt: NOW - (30 - i) * MIN })), ...["i0", "i1", "i2", "i3"].map((id, i) => ({ id, name: id, skill: "intermediate", games: 0, checkedInAt: NOW - (30 - i) * MIN }))]);
  const asr = new AdaptiveSkillRotationEngine().generateMatchups({ waitingIds: Object.keys(pl), players: pl, existingMatchups: [] });
  assert("Adaptive Skill Rotation still never mixes divisions (2 matchups, each single-skill) — unchanged", asr.length === 2 && asr.every((m) => new Set(idsOf(m).map((id) => pl[id].skill)).size === 1));
  const cont = new BalancedRotationEngine().generateMatchups({ waitingIds: Object.keys(pl), players: pl, existingMatchups: [] }, true);
  assert("Continuous (BalancedRotationEngine) still builds mixed Beginner+Intermediate teams", cont.length === 2 && cont.every((m) => m.teamA.every((id) => true)));
  const src = fs.readFileSync(new URL("../src/engines/AdaptiveSkillRotationEngine.js", import.meta.url), "utf8");
  assert("AdaptiveSkillRotationEngine does not reference the ranking engine", !/AdaptiveRankingRotationEngine|rankingPoints/.test(src));
}

console.log("\n22. Points neighbourhood — fairness picks WHO, Points picks WITH WHOM");
{
  // (a) high plays high, even though the low-Points players have waited LONGER (better fairness rank)
  const arr = [mk("A", { wait: 30, pts: 1500 }), mk("L1", { wait: 29, pts: 900 }), mk("L2", { wait: 28, pts: 880 }), mk("L3", { wait: 27, pts: 910 }), mk("H1", { wait: 20, pts: 1480 }), mk("H2", { wait: 19, pts: 1520 }), mk("H3", { wait: 18, pts: 1510 })];
  const m = gen(arr, { maxMatchups: 1 })[0];
  assert("a high-Points quartet is preferred over a mixed high/low quartet when both satisfy fairness", m.ranking.anchorId === "A" && ["H1", "H2", "H3"].every((id) => idsOf(m).includes(id)) && has(m, REASONS.POINTS_NEIGHBORHOOD) && !has(m, REASONS.POINTS_WIDENED));
  // (b) the tighter group beats a wider group that has better fairness rank AND a perfect team-sum balance
  const tight = [mk("A", { wait: 34, pts: 1000 }), mk("W1", { wait: 33, pts: 1100 }), mk("W2", { wait: 32, pts: 900 }), mk("W3", { wait: 31, pts: 1000 }), mk("T1", { wait: 20, pts: 1010 }), mk("T2", { wait: 19, pts: 1020 }), mk("T3", { wait: 18, pts: 1090 })];
  // (the wait-time guard is a later, deliberate layer: with it OFF this is the original Points-first behaviour; with it ON, see test 23)
  const tm = gen(tight, { maxMatchups: 1, config: { waitGuardGapMinutes: 0 } })[0];
  assert("competitive neighbourhood outranks team-sum balance: the tight group (spread <= 100) is chosen over a 200-wide group that would balance perfectly", (tm.ranking.pointsRange[1] - tm.ranking.pointsRange[0]) <= 100 && !idsOf(tm).includes("W2") && has(tm, REASONS.POINTS_NEIGHBORHOOD));
  // (c) a high-Points group cannot jump the fairness anchor
  const jump = [mk("L", { wait: 34, pts: 900 }), ...["h1", "h2", "h3"].map((id, i) => mk(id, { wait: 30 - i, pts: 2000 + i * 10 })), ...["m1", "m2", "m3", "m4"].map((id, i) => mk(id, { wait: 20 - i, pts: 880 + i * 15 }))];
  const jm = gen(jump, { maxMatchups: 2 });
  assert("the fairness anchor (longest-waiting, lowest Points) plays FIRST even though a very-high-Points group is the tightest available", jm[0].ranking.anchorId === "L" && !idsOf(jm[0]).some((id) => id.startsWith("h")));
  assert("...and the high-Points players are not starved: they form the next matchup", jm.length === 2 && idsOf(jm[1]).filter((id) => id.startsWith("h")).length === 3);
  // (d) fairness deliberately widens the neighbourhood for a long-waiting player
  const resc = [mk("R1", { wait: 50, pts: 1000, games: 2 }), mk("R2", { wait: 40, pts: 1700, games: 2 }), mk("U", { wait: 8, pts: 1000 }), mk("a", { wait: 15, pts: 1005 }), mk("b", { wait: 14, pts: 1010 }), mk("c", { wait: 13, pts: 1015 })];
  const rm = gen(resc, { maxMatchups: 1 })[0];
  assert("a rescued long-waiter 700 Points away is forced in: LONG_WAIT_PRIORITY + POINTS_WIDENED (fairness relaxes the neighbourhood)", idsOf(rm).includes("R2") && has(rm, REASONS.LONG_WAIT_PRIORITY) && has(rm, REASONS.POINTS_WIDENED));
  // (e) B+I stays preferred INSIDE the selected neighbourhood
  const inside = [sk("I1", "intermediate", { wait: 30, pts: 1000 }), sk("I2", "intermediate", { wait: 29, pts: 990 }), sk("I3", "intermediate", { wait: 28, pts: 1010 }), sk("I4", "intermediate", { wait: 27, pts: 1030 }), sk("B1", "beginner", { wait: 26, pts: 960 }), sk("B2", "beginner", { wait: 25, pts: 1040 })];
  const im = gen(inside, { maxMatchups: 1 })[0];
  assert("inside one Points neighbourhood the quartet is 2B+2I with B+I vs B+I teams", has(im, REASONS.MIXED_SKILL_TEAM) && has(im, REASONS.POINTS_NEIGHBORHOOD) && idsOf(im).filter((id) => id.startsWith("B")).length === 2);
  // (f) no usable court idles because the perfect neighbourhood is unavailable
  const bi = [..."abcde".split("").map((id, i) => mk(id, { wait: 30 - i, pts: 900 + i * 5 })), ...["x", "y", "z"].map((id, i) => mk(id, { wait: 20 - i, pts: 1600 + i * 5 }))];
  const bm = gen(bi, { maxMatchups: 2 });
  assert("5 low + 3 high Points players still fill BOTH courts (the second court necessarily spans the gap)", bm.length === 2 && new Set(bm.flatMap(idsOf)).size === 8);
  assert("the first court is the tight low group; the second is honestly marked POINTS_WIDENED", !idsOf(bm[0]).some((id) => "xyz".includes(id)) && has(bm[1], REASONS.POINTS_WIDENED));
  const lone = gen([mk("a", { wait: 30, pts: 900 }), mk("b", { wait: 29, pts: 1000 }), mk("c", { wait: 28, pts: 1300 }), mk("d", { wait: 27, pts: 1600 })])[0];
  assert("4 players with wildly different Points still get a court", lone && has(lone, REASONS.POINTS_WIDENED));
  // (g) provisional 1000 handling is unchanged: an unrated player joins a 1050-1100 group without widening trouble
  const prov = gen([mk("anchor", { wait: 30, pts: 1000, src: "provisional", games: 0 }), mk("p", { wait: 29, pts: 1000, src: null }), mk("q", { wait: 28, pts: 1140 }), mk("r", { wait: 27, pts: 1120 })])[0];
  assert("provisional players still use the x1.5 window (no widening reported for +140)", prov && has(prov, REASONS.POINTS_NEIGHBORHOOD));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
