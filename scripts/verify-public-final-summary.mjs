// Public final summary: recorded at session end, public-only, compact, best-effort.
import fs from "node:fs";
const store = new Map();
globalThis.window = { storage: {
  set: async (k, v) => { store.set(k, v); return { key: k }; },
  get: async (k) => (store.has(k) ? { key: k, value: store.get(k) } : null),
  delete: async (k) => { store.delete(k); },
  list: async () => ({ keys: [] }),
} };
const { buildPublicFinalSummary, recordPublicFinalSummary, MAX_SUMMARY_BYTES } = await import("../src/lib/publicFinalSummary.js");
const { PUBLIC_FINAL_PREFIX } = await import("../src/lib/constants.js");
let pass = 0, fail = 0;
const assert = (d, c) => { c ? (pass++, console.log(`  ok ${d}`)) : (fail++, console.log(`  FAIL: ${d}`)); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const player = (id, name, w, l, pf, pa) => ({ id, name, checkedIn: true, wins: w, losses: l, games: w + l, pointsFor: pf, pointsAgainst: pa, photo: "data:img", playerDbId: "db-" + id, authId: "auth-" + id, payment: { paid: true }, skill: "Advanced", email: "x@y.z", partnerId: "z" });
const op = { venue: "Sat Open Play", sessionType: "openPlay", players: { a: player("a", "Ana", 3, 0, 33, 21), b: player("b", "Ben", 1, 2, 25, 30) }, matchHistory: [{}, {}, {}], courts: [] };

console.log("\n1. Open Play summary");
{
  const s = buildPublicFinalSummary(op, null, { sessionCode: "ABC123", endedAt: 99 });
  assert("kind/code/name/endedAt/playerCount", s.kind === "openPlay" && s.sessionCode === "ABC123" && s.name === "Sat Open Play" && s.endedAt === 99 && s.playerCount === 2);
  assert("standings rows are name/W/L/diff only", s.standings.length === 2 && Object.keys(s.standings[0]).sort().join() === "diff,losses,name,rank,wins");
  const ser = JSON.stringify(s);
  assert("no ids / photo / payment / skill / email / partner in serialized summary", !/photo|db-|auth-|payment|Advanced|x@y|partner|playerDbId|authId|skill/i.test(ser));
  assert("compact", ser.length < 2000);
}
console.log("\n2. End flow records it (Open Play) before live row deletion");
{
  store.clear(); store.set("opl-session-ABC123", "{}");
  const r = await recordPublicFinalSummary("ABC123", op, { endedAt: 5 });
  assert("row written at opl-public-final-ABC123, shared", r && store.has(`${PUBLIC_FINAL_PREFIX}ABC123`) && PUBLIC_FINAL_PREFIX === "opl-public-final-");
  assert("prefix is outside opl-session-* so no index/report/live scan can match it", !PUBLIC_FINAL_PREFIX.startsWith("opl-session-"));
  const app = read("src/PickleballOpenPlay.jsx"), idx = read("src/lib/sessionIndexModel.js");
  for (const [n, src, del] of [["confirmEndSession", app, "window.storage.delete(`${STORAGE_PREFIX}${sessionCode}`"], ["endSessionAndRecord", idx, "window.storage.delete(`${STORAGE_PREFIX}${entry.sessionCode}`"]]) {
    const a = src.indexOf("recordPublicFinalSummary("), d = src.indexOf(del);
    assert(`${n}: summary recorded before the live row is deleted`, a > -1 && d > a);
  }
  assert("index record shape unchanged (no summary field added)", !/summary/i.test(read("src/lib/sessionIndexModel.js").match(/export async function recordSessionEnded[\s\S]*?\r?\n}\r?\n/)[0]));
}
console.log("\n3. Tournament summary (RR + single elimination)");
{
  const T = (over) => ({ id: "T1", name: "Spring", mode: "doubles", format: "roundRobin", status: "running", pools: [], bracket: null, courts: [{ id: "c", number: 1 }], ...over });
  const team = (id, label, seed) => ({ id, label, seed, playerIds: ["p1", "p2"], photo: "x" });
  const bracket = { status: "completed", champion: team("t1", "Ana/Ben", 1), runnerUp: team("t2", "Cy/Di", 2), rounds: [{ name: "Final", matches: [{ teamA: team("t1", "Ana/Ben", 1), teamB: team("t2", "Cy/Di", 2), winner: "t1", status: "completed", score: { teamA: 11, teamB: 7 } }] }], bronzeMatch: null };
  const t = T({ format: "singleElimination", bracket });
  const s = buildPublicFinalSummary({ sessionType: "tournament", venue: "Sat" }, t, { sessionCode: "TRN123", endedAt: 7 });
  assert("name/stage/champion/runnerUp/complete", s.name === "Spring" && s.stage === "Champion Crowned" && s.champion === "Ana/Ben" && s.runnerUp === "Cy/Di" && s.complete === true);
  assert("compact bracket kept, with winner side + score", s.bracket.kind === "single" && s.bracket.rounds[0].matches[0].winner === "A" && s.bracket.rounds[0].matches[0].scoreA === 11);
  assert("no player ids / photos / court list copied", !/p1|p2|photo|playerIds|courts/i.test(JSON.stringify(s)));
  const rr = buildPublicFinalSummary({ sessionType: "tournament" }, T({ status: "completed" }), { sessionCode: "R" });
  assert("round robin without bracket: stage Pool Play Complete", rr.stage === "Pool Play Complete" && rr.bracket === null);
  assert("missing tournament record -> no summary, no throw", buildPublicFinalSummary({ sessionType: "tournament" }, null) === null);
}
console.log("\n4. Best-effort: failures never throw or block ending");
{
  window.storage.set = async () => { throw new Error("db down"); };
  let threw = false, r; try { r = await recordPublicFinalSummary("ABC123", op); } catch { threw = true; }
  assert("storage failure swallowed", !threw && r === null);
  assert("null state / code swallowed", (await recordPublicFinalSummary(null, op)) === null && (await recordPublicFinalSummary("X", null)) === null);
  assert("size ceiling defined", MAX_SUMMARY_BYTES > 1000);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
