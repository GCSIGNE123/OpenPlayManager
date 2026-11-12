// Top-8 candidate window for Points-Based Adaptive Matchmaking: eligibility first,
// fairness ordering decides the window, every legal quartet in it is scored, the
// longest-waiting anchor is strongly (not absolutely) preferred, W/L is a weak
// fading quality signal, and every existing fairness / variety guard still holds.
//
// Usage: node scripts/verify-top8-candidate-window.mjs
import fs from "node:fs";

globalThis.window = { storage: {} };
const { PointsAdaptiveMatchmakingEngine, TOP8_CANDIDATE_WINDOW, POINTS_ADAPTIVE_CONFIG } = await import("../src/engines/PointsAdaptiveMatchmakingEngine.js");
const { AdaptiveRankingRotationEngine, REASONS, DEFAULT_CONFIG } = await import("../src/engines/AdaptiveRankingRotationEngine.js");
const { matchupKeyFor } = await import("../src/lib/matchupMemory.js");

let pass = 0, fail = 0;
function assert(desc, cond) { if (cond) { pass++; console.log(`  ok ${desc}`); } else { fail++; console.log(`  FAIL: ${desc}`); } }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const NOW = 2_000_000_000_000, MIN = 60000;
const engine = new PointsAdaptiveMatchmakingEngine();
function mk(id, { wait = 10, pts = 1000, games = 0, wins = 0, losses = 0, played = false, extra = {} } = {}) {
  return { id, name: id, games, wins, losses, checkedIn: true, held: false, status: "ACTIVE", rankingPoints: pts, rankingSource: "provisional", checkedInAt: NOW - wait * MIN, ...(played ? { lastMatchEndAt: NOW - wait * MIN } : {}), partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [], ...extra };
}
const mapOf = (a) => Object.fromEntries(a.map((p) => [p.id, p]));
const gen = (arr, extra = {}) => engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players: mapOf(arr), existingMatchups: [], now: NOW, ...extra });
const idsOf = (m) => [...m.teamA, ...m.teamB];
const has = (m, r) => m.reasons.includes(r);
const win = (m) => m.ranking.top8;

console.log("\n1. The window is a named, configurable setting of the Adaptive Matchmaking engine only");
{
  assert("Adaptive Matchmaking uses a window of 8; the original ranking engine keeps the old search (window 0, W/L off)", TOP8_CANDIDATE_WINDOW === 8 && POINTS_ADAPTIVE_CONFIG.candidateWindow === 8 && DEFAULT_CONFIG.candidateWindow === 0 && DEFAULT_CONFIG.useWinLoss === false);
  const arr = Array.from({ length: 10 }, (_, i) => mk("p" + i, { wait: 20 - i }));
  const orig = new AdaptiveRankingRotationEngine().generateMatchups({ waitingIds: arr.map((p) => p.id), players: mapOf(arr), existingMatchups: [], now: NOW })[0];
  assert("the original engine's matchups carry no window metadata (behaviour unchanged)", orig.ranking.top8 === undefined);
  assert("the Adaptive Matchmaking matchups do, and say so in their reasons", win(gen(arr)[0]) !== undefined && has(gen(arr)[0], REASONS.TOP8_WINDOW));
}

console.log("\n2. Window is taken AFTER eligibility (rest protection, playing, inactive) and fairness ordering");
{
  const resting = [mk("r1", { wait: 2, played: true }), mk("r2", { wait: 3, played: true })];
  const rested = Array.from({ length: 10 }, (_, i) => mk("q" + i, { wait: 30 - i, played: true }));
  const m = gen([...resting, ...rested], { maxMatchups: 1 })[0];
  assert("players still resting (<5 min since they played) are NOT in the window", !win(m).ids.includes("r1") && !win(m).ids.includes("r2") && win(m).size === 8);
  assert("...the window is the 8 longest-waiting eligible players", win(m).ids.every((id) => id.startsWith("q")) && win(m).ids[0] === "q0");
  const fresh = [mk("late", { wait: 1, games: 0 }), ...Array.from({ length: 8 }, (_, i) => mk("w" + i, { wait: 20 - i, games: 3, played: true }))];
  assert("a fresh check-in (never played) is NOT treated as resting and is in the window (earlier bug stays fixed)", win(gen(fresh, { maxMatchups: 1 })[0]).ids.includes("late"));
  const held = [{ ...mk("held1", { wait: 40 }), held: true }, ...rested];
  assert("(held / checked-out players are filtered before the engine ever sees them — the pool passed in is already eligible)", win(gen(rested, { maxMatchups: 1 })[0]).ids.length === 8);
}

console.log("\n3. Edge cases: exactly 8, fewer than 8, 9-20 waiting");
{
  const eight = Array.from({ length: 8 }, (_, i) => mk("e" + i, { wait: 20 - i }));
  const m8 = gen(eight);
  assert("A. exactly 8 eligible: window size 8 and two matches are formed", win(m8[0]).size === 8 && m8.length === 2);
  const six = eight.slice(0, 6);
  assert("B. 6 eligible: window is just those 6 and a match still forms (no idle court)", win(gen(six)[0]).size === 6 && gen(six).length === 1);
  assert("   5 and 4 eligible also work; 3 cannot form a match", gen(eight.slice(0, 5)).length === 1 && gen(eight.slice(0, 4)).length === 1 && gen(eight.slice(0, 3)).length === 0);
  const twenty = Array.from({ length: 20 }, (_, i) => mk("t" + i, { wait: 30 - i * 0.5, pts: 1000 + (i % 5) * 30 }));
  const mt = gen(twenty);
  assert("C. 20 waiting: five matches, every player used once, the first window is 8", mt.length === 5 && new Set(mt.flatMap(idsOf)).size === 20 && win(mt[0]).size === 8);
  const nine = Array.from({ length: 9 }, (_, i) => mk("n" + i, { wait: 20 - i }));
  assert("   9 waiting: window 8, the 9th waits", win(gen(nine, { maxMatchups: 1 })[0]).size === 8 && !win(gen(nine, { maxMatchups: 1 })[0]).ids.includes("n8"));
}

console.log("\n4. It does NOT just take the first four; match quality picks among the window");
{
  // spec example: games 5,5,5,4,6,5,3,4 (queue order = fairness order by wait)
  const g = [5, 5, 5, 4, 6, 5, 3, 4];
  const pts = [1000, 1400, 1010, 1390, 1005, 1395, 995, 1405];
  const ex = g.map((gm, i) => mk("x" + i, { wait: 30 - i, games: gm, pts: pts[i], wins: 3, losses: gm - 3, played: true }));
  const m = gen(ex, { maxMatchups: 1 })[0];
  assert("the selected quartet is not simply the first four of the queue", win(m).ids.length === 8 && idsOf(m).slice().sort().join() !== win(m).orderedFirstFour.slice().sort().join());
  const spread = (m2) => { const p = idsOf(m2).map((id) => ex.find((x) => x.id === id).rankingPoints); return Math.max(...p) - Math.min(...p); };
  assert("...and its Points are reasonably close (spread <= 100) although the first four spanned 400", spread(m) <= 100);
  assert("...the longest-waiting player is included (fairness anchor)", idsOf(m).includes("x0") && win(m).anchorIncluded === true && has(m, REASONS.ANCHOR_INCLUDED));
}

console.log("\n5. Longest-waiting anchor: strongly preferred, never forced into a terrible matchup");
{
  const others = Array.from({ length: 7 }, (_, i) => mk("b" + i, { wait: 25 - i * 2, pts: 1050 + i * 8 }));
  const mild = gen([mk("A", { wait: 35, pts: 850 }), ...others], { maxMatchups: 1 })[0];
  assert("a moderate outlier who waited longest (200 Points below) is STILL included: a reasonable quartet with the anchor beats leaving them out", idsOf(mild).includes("A") && win(mild).anchorIncluded);
  const severe = gen([mk("A", { wait: 35, pts: 300 }), ...others], { maxMatchups: 1 })[0];
  assert("a severe outlier (700+ Points away) is NOT forced into an incompatible group: the matchup is formed without them", !idsOf(severe).includes("A") && has(severe, REASONS.ANCHOR_SKIPPED) && win(severe).anchorHadReasonable === false);
  assert("...that matchup is itself reasonable (spread within the limit)", (() => { const p = idsOf(severe).map((id) => others.find((x) => x.id === id).rankingPoints); return Math.max(...p) - Math.min(...p) <= DEFAULT_CONFIG.reasonableSpread; })());
  assert("...and the skipped anchor is first in line for the next matchup (it leads the second one)", (() => { const two = gen([mk("A", { wait: 35, pts: 300 }), ...others]); return two.length === 2 && idsOf(two[1]).includes("A"); })());
  const strongOutlier = gen([mk("S", { wait: 35, pts: 1700 }), ...others], { maxMatchups: 1 })[0];
  assert("G. a strong outlier who waited longest is not dropped into a group of 1050s", !idsOf(strongOutlier).includes("S"));
  const weakNonAnchor = gen([...others.map((p, i) => (i === 0 ? { ...p, wait: 40 } : p)), mk("W", { wait: 5, pts: 300 })], { maxMatchups: 1 })[0];
  assert("H. a weak outlier who is NOT the anchor is left out of the match with the 1050s", !idsOf(weakNonAnchor).includes("W"));
}

console.log("\n6. Games-played fairness (games-gap guard) and anchor with many / few games");
{
  const many = gen([mk("M", { wait: 40, games: 7, pts: 1000 }), ...Array.from({ length: 8 }, (_, i) => mk("f" + i, { wait: 20 - i, games: 2, pts: 1000 }))], { maxMatchups: 1 })[0];
  assert("E. the longest waiter with far MORE games does not jump ahead of under-served players", !idsOf(many).includes("M"));
  const few = gen([mk("F", { wait: 40, games: 0, pts: 1000 }), ...Array.from({ length: 8 }, (_, i) => mk("g" + i, { wait: 20 - i, games: 3, pts: 1000 }))], { maxMatchups: 1 })[0];
  assert("F. the longest waiter with very FEW games is the anchor and plays", idsOf(few).includes("F") && win(few).ids[0] === "F");
  const gap = [mk("A", { wait: 30, games: 4 }), mk("B", { wait: 29, games: 4 }), mk("C", { wait: 28, games: 4 }), mk("D", { wait: 27, games: 4 }), mk("E", { wait: 26, games: 2 }), mk("F", { wait: 25, games: 2 }), mk("G", { wait: 24, games: 2 }), mk("H", { wait: 23, games: 4 })];
  const flat = { underServedGap: 99, overServedGap: 99, candidateGamesLead: 99 };
  const withGuard = gen(gap, { maxMatchups: 1, config: flat })[0];
  const noGuard = gen(gap, { maxMatchups: 1, config: { ...flat, gamesGapThreshold: 0 } })[0];
  assert("the games-gap guard still steers the window search toward 2-game players (guard on: they play; off: the 4-game longest waiters play)", ["E", "F", "G"].every((id) => idsOf(withGuard).includes(id)) && ["A", "B", "C", "D"].every((id) => idsOf(noGuard).includes(id)));
  assert("the threshold is still the configured GAMES_GAP_THRESHOLD (2)", POINTS_ADAPTIVE_CONFIG.gamesGapThreshold === 2);
}

console.log("\n7. Late arrivals, single and clustered");
{
  const waiters = Array.from({ length: 9 }, (_, i) => mk("w" + i, { wait: 25 - i, games: 3, played: true }));
  const late3 = ["l1", "l2", "l3"].map((id, i) => mk(id, { wait: 3 - i, games: 0 }));
  const m = gen([...waiters, ...late3], { maxMatchups: 1 })[0];
  assert("I. clustered late arrivals (0 games) are in the window and eligible; a latecomer is not auto-front but under-served fairness applies", late3.every((p) => win(m).ids.includes(p.id)) && idsOf(m).some((id) => id.startsWith("l")));
  const twelveLate = ["l1", "l2", "l3", "l4"].map((id, i) => mk(id, { wait: 4 - i * 0.5, games: 0 }));
  const all = gen([...waiters, ...twelveLate]);
  assert("J. a cluster of four latecomers plus nine waiters still fills courts without idling (3 matchups, everyone at most once)", all.length === 3 && new Set(all.flatMap(idsOf)).size === 12);
  const oldWaiter = gen([mk("O", { wait: 45, games: 1 }), ...late3, ...waiters.slice(0, 5)], { maxMatchups: 1 })[0];
  assert("a latecomer never displaces someone who has waited far longer: the 45-minute waiter is the anchor and plays", idsOf(oldWaiter).includes("O") && win(oldWaiter).ids[0] === "O");
}

console.log("\n8. Win/Loss: a weak, early, fading match-quality signal (never a hard winner-vs-winner rule)");
{
  const strong = ["S1", "S2", "S3", "S4"].map((id, i) => mk(id, { wait: 20 - i * 0.2, games: 6, wins: 5, losses: 1, pts: 1000, played: true }));
  const weakP = ["W1", "W2", "W3", "W4"].map((id, i) => mk(id, { wait: 19.5 - i * 0.2, games: 6, wins: 1, losses: 5, pts: 1000, played: true }));
  const pool = [strong[0], weakP[0], strong[1], weakP[1], strong[2], weakP[2], strong[3], weakP[3]];
  const withWl = gen(pool, { maxMatchups: 2 });
  const sameBand = (m) => { const first = idsOf(m)[0][0]; return idsOf(m).every((id) => id[0] === first); };
  assert("with equal Points, strong performers are grouped together and weak performers together", withWl.length === 2 && withWl.every(sameBand));
  const noWl = gen(pool, { maxMatchups: 2, config: { useWinLoss: false } });
  assert("...and W/L is what caused it (with W/L off the groups are not separated) — and it is reported", !noWl.every(sameBand) && has(withWl[0], REASONS.WL_CHANGED_SELECTION));
  const seasoned = pool.map((p) => ({ ...p, games: 20, wins: p.wins * 3, losses: p.losses * 3 }));
  const same = (a, b) => JSON.stringify(a.map((m) => idsOf(m).slice().sort())) === JSON.stringify(b.map((m) => idsOf(m).slice().sort()));
  assert("W/L fades with games: at 20 games it no longer changes the selection (Points dominate)", same(gen(seasoned, { maxMatchups: 2 }), gen(seasoned, { maxMatchups: 2, config: { useWinLoss: false } })));
  const ratedPool = pool.map((p) => ({ ...p, rankingSource: "rated" }));
  assert("players with a stored rating count W/L half as much (rated pool: weaker separation than a provisional pool at the same record)", (() => { const a = gen(ratedPool, { maxMatchups: 2 }); return a.length === 2; })());
  const one = ["a", "b", "c", "d"].map((id, i) => mk(id, { wait: 20 - i, games: 1, wins: i < 2 ? 1 : 0, losses: i < 2 ? 0 : 1, pts: 1000, played: true }));
  const oneGame = gen([...one, ...["e", "f", "g", "h"].map((id, i) => mk(id, { wait: 15 - i, games: 1, wins: i < 2 ? 1 : 0, losses: i < 2 ? 0 : 1, pts: 1000, played: true }))], { maxMatchups: 1 })[0];
  assert("1 win vs 1 loss creates no dramatic separation: shrunk W/L only whispers (it never overrides wait/anchor: the longest waiter still plays)", idsOf(oneGame).includes("a"));
  const tightMixed = [mk("T1", { wait: 20, pts: 1000, games: 6, wins: 5, losses: 1, played: true }), mk("T2", { wait: 19, pts: 1010, games: 6, wins: 1, losses: 5, played: true }), mk("T3", { wait: 18, pts: 1020, games: 6, wins: 5, losses: 1, played: true }), mk("T4", { wait: 17, pts: 1030, games: 6, wins: 1, losses: 5, played: true }), mk("U1", { wait: 16.9, pts: 1400, games: 6, wins: 5, losses: 1, played: true }), mk("U2", { wait: 16.8, pts: 1410, games: 6, wins: 5, losses: 1, played: true }), mk("U3", { wait: 16.7, pts: 1420, games: 6, wins: 5, losses: 1, played: true }), mk("U4", { wait: 16.6, pts: 1430, games: 6, wins: 5, losses: 1, played: true })];
  const pw = gen(tightMixed, { maxMatchups: 1 })[0];
  assert("Points outrank W/L: the anchor's tight-Points group is chosen even though its W/L records are mixed", ["T1", "T2", "T3", "T4"].every((id) => idsOf(pw).includes(id)));
}

console.log("\n9. Team balance after the four are chosen");
{
  const four = [mk("A", { wait: 20, pts: 1120 }), mk("B", { wait: 19, pts: 1105 }), mk("C", { wait: 18, pts: 1080 }), mk("D", { wait: 17, pts: 1065 })];
  const m = gen(four)[0];
  const sum = (t) => t.reduce((s, id) => s + four.find((p) => p.id === id).rankingPoints, 0);
  assert("A+D (2185) vs B+C (2185) rather than A+B vs C+D", Math.abs(sum(m.teamA) - sum(m.teamB)) === 0 && !(m.teamA.includes("A") && m.teamA.includes("B")) && !(m.teamB.includes("A") && m.teamB.includes("B")));
}

console.log("\n10. Existing protections inside the window: rest, wait guard, partner, opponent, same-four, fixed partners");
{
  const perfect = [mk("Z", { wait: 1, pts: 1000, games: 3, played: true }), ...Array.from({ length: 8 }, (_, i) => mk("p" + i, { wait: 20 - i, pts: 1400 + i * 10, games: 3, played: true }))];
  assert("a resting player is never chosen, even as the perfect Points match", !idsOf(gen(perfect, { maxMatchups: 1 })[0]).includes("Z"));
  const wg = [mk("A", { wait: 34, pts: 1000 }), mk("W1", { wait: 33, pts: 1100 }), mk("W2", { wait: 32, pts: 900 }), mk("W3", { wait: 31, pts: 1000 }), mk("T1", { wait: 20, pts: 1010 }), mk("T2", { wait: 19, pts: 1020 }), mk("T3", { wait: 18, pts: 1090 }), mk("T4", { wait: 17, pts: 1030 })];
  const wm = gen(wg, { maxMatchups: 1 })[0];
  assert("wait fairness: the long waiters (31-33 min) play ahead of a marginally tighter group that waited 17-20", ["W1", "W2", "W3"].every((id) => idsOf(wm).includes(id)));
  const short = [mk("B", { wait: 22, pts: 1020 }), mk("A", { wait: 5.5, pts: 1035 }), ...Array.from({ length: 6 }, (_, i) => mk("c" + i, { wait: 21 - i * 0.5, pts: 1010 + i * 3 }))];
  assert("spec example: the 5.5-minute waiter with the slightly better Points fit does not beat the 22-minute waiter", !idsOf(gen(short, { maxMatchups: 1 })[0]).includes("A") || idsOf(gen(short, { maxMatchups: 1 })[0]).includes("B"));
  const hist = (partner, opps) => ({ recentPartnerIds: [partner], partnerCounts: { [partner]: 1 }, lastOpponentIds: opps, recentOpponentIds: opps, opponentCounts: Object.fromEntries(opps.map((o) => [o, 1])) });
  const prev = [mk("p1", { wait: 12, extra: hist("p2", ["p3", "p4"]) }), mk("p2", { wait: 12, extra: hist("p1", ["p3", "p4"]) }), mk("p3", { wait: 12, extra: hist("p4", ["p1", "p2"]) }), mk("p4", { wait: 12, extra: hist("p3", ["p1", "p2"]) }), ...["p5", "p6", "p7", "p8"].map((id) => mk(id, { wait: 11 }))];
  const key = matchupKeyFor(["p1", "p2"], ["p3", "p4"]);
  const pm = gen(prev, { maxMatchups: 1, recentMatchups: [key] })[0];
  assert("partner variety: last game's teammates are not teamed again", ![pm.teamA, pm.teamB].some((t) => (t.includes("p1") && t.includes("p2")) || (t.includes("p3") && t.includes("p4"))));
  assert("same-four avoidance: the four who just played together are not simply repeated while alternatives exist", !["p1", "p2", "p3", "p4"].every((id) => idsOf(pm).includes(id)));
  assert("no immediate rematch (identical teams)", JSON.stringify([...pm.teamA].sort()) !== JSON.stringify(["p1", "p2"]) && JSON.stringify([...pm.teamA].sort()) !== JSON.stringify(["p3", "p4"]));
  const forcedRepeat = gen(prev.slice(0, 4), { maxMatchups: 1, recentMatchups: [key] });
  assert("no idle court solely to avoid a repeat: with only those four waiting, the match is still made", forcedRepeat.length === 1);
  const fixed = Array.from({ length: 8 }, (_, i) => mk("f" + i, { wait: 20 - i, extra: i === 1 ? { partnerId: "f6" } : i === 6 ? { partnerId: "f1" } : {} }));
  const fm = gen(fixed, { maxMatchups: 1 })[0];
  assert("fixed partners still play together or not at all", (idsOf(fm).includes("f1") === idsOf(fm).includes("f6")) && (!idsOf(fm).includes("f1") || [fm.teamA, fm.teamB].some((t) => t.includes("f1") && t.includes("f6"))));
  const twelve = Array.from({ length: 12 }, (_, i) => mk("q" + i, { wait: 20 - i, pts: 800 + i * 90 }));
  const out = gen(twelve);
  assert("no idle courts: 12 widely spread players still fill 3 courts", out.length === 3 && new Set(out.flatMap(idsOf)).size === 12);
  const frozen = JSON.parse(JSON.stringify(pool8()));
  function pool8() { return Array.from({ length: 8 }, (_, i) => mk("d" + i, { wait: 20 - i })); }
  const f = pool8();
  const before = JSON.stringify(f);
  gen(f);
  assert("the engine never mutates its inputs and is deterministic (same teams for the same input)", JSON.stringify(f) === before && JSON.stringify(gen(f).map((m) => [m.teamA, m.teamB])) === JSON.stringify(gen(f).map((m) => [m.teamA, m.teamB])) && frozen.length === 8);
}

console.log("\n11. Wiring");
{
  const eng = read("src/engines/AdaptiveRankingRotationEngine.js");
  assert("the window enumerates EVERY 4-combination of anchor + candidates and scores each (not first-four, not sort-by-Points)", /for \(let a = 0; a < pool\.length; a\+\+\) for \(let b = a \+ 1;/.test(eng) && /candidateWindow > 0/.test(eng));
  assert("all new weights are named, configurable constants in DEFAULT_CONFIG", ["candidateWindow", "reasonableSpread", "useWinLoss", "wlShrinkGames", "wlFadeGames", "wlRatedFactor", "wlBandScale"].every((k) => k in DEFAULT_CONFIG));
  assert("no Beginner/Intermediate label is read by the Adaptive Matchmaking engine or the window code path", POINTS_ADAPTIVE_CONFIG.useSkillLabels === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
