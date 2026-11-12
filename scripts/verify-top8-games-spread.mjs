// Games-played fairness INSIDE the Top-8 window (gamesSpreadMode: off | tiebreak | penalty | gapfirst).
// Verifies each mode's ranking, that longest-wait anchor and every variety/rest/balance guard survive,
// that fairness is not "fewest games first", and the fresh 0-game player case.
//
// Usage: node scripts/verify-top8-games-spread.mjs
globalThis.window = { storage: {} };
const { matchupKeyFor } = await import("../src/lib/matchupMemory.js");
const { PointsAdaptiveMatchmakingEngine } = await import("../src/engines/PointsAdaptiveMatchmakingEngine.js");
const { DEFAULT_CONFIG } = await import("../src/engines/AdaptiveRankingRotationEngine.js");

let pass = 0, fail = 0;
function assert(desc, cond) { if (cond) { pass++; console.log(`  ok ${desc}`); } else { fail++; console.log(`  FAIL: ${desc}`); } }
const NOW = 2_000_000_000_000, MIN = 60000;
const engine = new PointsAdaptiveMatchmakingEngine();
function mk(id, { wait = 10, pts = 1000, games = 0, extra = {} } = {}) {
  return { id, name: id, games, wins: 0, losses: 0, checkedIn: true, held: false, status: "ACTIVE", rankingPoints: pts, rankingSource: "provisional", checkedInAt: NOW - wait * MIN, ...(games > 0 ? { lastMatchEndAt: NOW - wait * MIN } : {}), partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [], ...extra };
}
const mapOf = (a) => Object.fromEntries(a.map((p) => [p.id, p]));
const gen = (arr, config = {}, extra = {}) => engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players: mapOf(arr), existingMatchups: [], now: NOW, maxMatchups: 1, config, ...extra })[0];
const idsOf = (m) => [...m.teamA, ...m.teamB];
// isolate the games-spread signal: neutral tier ordering, no other games/wait guards
const ISO = { underServedGap: 99, overServedGap: 99, gamesGapThreshold: 0, waitGuardGapMinutes: 0 };
const spreadOf = (m, pl) => { const g = idsOf(m).map((id) => pl[id].games); return Math.max(...g) - Math.min(...g); };

console.log("\n1. Config");
{
  assert("named, configurable, default OFF (the original Top-8 behaviour is unchanged unless enabled)", DEFAULT_CONFIG.gamesSpreadMode === "off" && DEFAULT_CONFIG.maxPreferredGamesSpread === 1);
}

console.log("\n2. Smaller games spread beats larger spread when everything else is comparable (tiebreak)");
{
  const arr = [mk("a", { wait: 40, games: 5 }), mk("p1", { wait: 39, games: 3 }), mk("p2", { wait: 38, games: 2 }), mk("p3", { wait: 37, games: 5 }), mk("p4", { wait: 36, games: 4 }), mk("p5", { wait: 35, games: 4 }), mk("p6", { wait: 34, games: 5 }), mk("p7", { wait: 33, games: 4 })];
  const pl = mapOf(arr);
  const off = gen(arr, { ...ISO, gamesSpreadMode: "off" });
  const tb = gen(arr, { ...ISO, gamesSpreadMode: "tiebreak" });
  assert("without the tiebreak the first-in-line quartet (spread >= 2) wins on fairness order", spreadOf(off, pl) >= 2);
  assert("with the tiebreak the chosen four has the smaller games spread (<= 1)", spreadOf(tb, pl) <= 1 && tb.ranking.top8.gamesSpread === spreadOf(tb, pl));
  assert("...and the longest-waiting anchor is STILL in it (the anchor is the rescued/longest-waiting first in line)", idsOf(tb).includes(tb.ranking.top8.ids[0]) && tb.ranking.top8.anchorIncluded);
}

console.log("\n3. 4-vs-2 is penalised: [4,4,3,3] beats [4,4,2,2] (penalty mode)");
{
  const arr = [mk("a", { wait: 40, games: 4 }), mk("b", { wait: 39, games: 2 }), mk("c", { wait: 38, games: 2 }), mk("d", { wait: 37, games: 4 }), mk("e", { wait: 36, games: 3 }), mk("f", { wait: 35, games: 3 }), mk("g", { wait: 34, games: 4 }), mk("h", { wait: 33, games: 3 })];
  const pl = mapOf(arr);
  const off = gen(arr, { ...ISO, gamesSpreadMode: "off" });
  const pen = gen(arr, { ...ISO, gamesSpreadMode: "penalty", maxPreferredGamesSpread: 1 });
  assert("off: the 2-game players are pulled in beside a 4-game anchor (spread 2)", spreadOf(off, pl) === 2);
  assert("penalty: the chosen four keeps the spread within the preferred maximum", spreadOf(pen, pl) <= 1);
  const lax = gen(arr, { ...ISO, gamesSpreadMode: "penalty", maxPreferredGamesSpread: 2 });
  assert("the threshold is configurable (2 = spread 2 allowed again)", spreadOf(lax, pl) === 2);
}

console.log("\n4. The longest-wait anchor stays protected; this is NOT fewest-games-first");
{
  const arr = [mk("a", { wait: 40, games: 6 }), ...["b", "c", "d"].map((id, i) => mk(id, { wait: 39 - i, games: 6 })), ...["x", "y", "z", "w"].map((id, i) => mk(id, { wait: 20 - i, games: 1 }))];
  const tb = gen(arr, { ...ISO, gamesSpreadMode: "tiebreak" });
  assert("tiebreak: anchor a (6 games) still plays even though 1-game players wait (wait fairness is not overridden)", idsOf(tb).includes("a"));
  assert("tiebreak: a same-games four is chosen rather than mixing 6-game with 1-game", spreadOf(tb, mapOf(arr)) <= 1);
}

console.log("\n5. Fresh 0-game player");
{
  const vets = Array.from({ length: 9 }, (_, i) => mk("v" + i, { wait: 20 - i, games: 3, pts: 1000 + i * 10 }));
  const uma = mk("Uma", { wait: 1, games: 0 });
  const all = [uma, ...vets];
  for (const mode of ["off", "tiebreak", "gapfirst"]) {
    const m = gen(all, { gamesSpreadMode: mode });
    assert(`${mode}: fresh 0-game Uma is in the window and gets the first game`, m.ranking.top8.ids.includes("Uma") && idsOf(m).includes("Uma"));
  }
}

console.log("\n6. Variety / rest / balance guards remain intact with the refinement on");
{
  for (const mode of ["tiebreak", "gapfirst"]) {
    const base = Array.from({ length: 8 }, (_, i) => mk("q" + i, { wait: 30 - i, games: 2 }));
    const partnered = base.map((p) => (p.id === "q0" ? { ...p, recentPartnerIds: ["q1"], partnerCounts: { q1: 1 } } : p));
    const m = gen(partnered, { gamesSpreadMode: mode });
    const together = [m.teamA, m.teamB].some((t) => t.includes("q0") && t.includes("q1"));
    assert(`${mode}: recent partner protection holds`, !together);
    const m1 = gen(base, { gamesSpreadMode: mode });
    const key = idsOf(m1).slice().sort().join(",");
    const m2 = gen(base, { gamesSpreadMode: mode }, { recentMatchups: [matchupKeyFor(m1.teamA, m1.teamB)] });
    assert(`${mode}: the just-played four is not repeated when an alternative exists`, idsOf(m2).slice().sort().join(",") !== key);
    const bal = ["s1", "s2", "w1", "w2"].map((id, i) => mk(id, { wait: 30 - i, games: 2, pts: i < 2 ? 1100 : 900 }));
    const mb = gen(bal, { gamesSpreadMode: mode });
    const sum = (t) => t.reduce((s, id) => s + (id.startsWith("s") ? 1100 : 900), 0);
    assert(`${mode}: teams stay balanced (strong+weak vs strong+weak)`, sum(mb.teamA) === sum(mb.teamB));
    const rest = [mk("r", { wait: 1, games: 4 }), ...base];
    assert(`${mode}: a player who just finished (resting) is not in the window`, !gen(rest, { gamesSpreadMode: mode }).ranking.top8.ids.includes("r"));
  }
}

console.log("\n7. Late-arrival cluster: veterans vs newcomers");
{
  const vets = Array.from({ length: 4 }, (_, i) => mk("v" + i, { wait: 40 - i, games: 5 }));
  const fresh = Array.from({ length: 4 }, (_, i) => mk("n" + i, { wait: 8 - i, games: i % 2 }));
  const all = [...vets, ...fresh];
  const pl = mapOf(all);
  const gf = gen(all, { gamesSpreadMode: "gapfirst" });
  const off = gen(all, { gamesSpreadMode: "off" });
  const tot = (m) => idsOf(m).reduce((s, id) => s + pl[id].games, 0);
  assert("gapfirst never selects more total games than off in a veteran-vs-newcomer window", tot(gf) <= tot(off));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
