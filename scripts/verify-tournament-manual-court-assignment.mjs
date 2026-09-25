// Tournament Mode: NO automatic court assignment. Queued matches stay in the
// queue until the organizer explicitly assigns them (Assign to... + Assign);
// a court freed by a finished match / manual release stays AVAILABLE; "Set as
// Next Match" is a marker only. Manual assign / reassign / swap unchanged.
import fs from "node:fs";

const store = new Map();
globalThis.window = { storage: {
  get: async (k) => (store.has(k) ? { value: store.get(k) } : null),
  set: async (k, v) => { store.set(k, v); return { value: v }; },
  delete: async (k) => { store.delete(k); return {}; },
  list: async () => ({ keys: [...store.keys()] }),
} };
const T = await import("../src/lib/tournament.js");
const { CourtAssignmentService } = await import("../src/engines/CourtAssignmentService.js");
const { makeMatch, makeParticipant, startMatch } = await import("../src/lib/tournamentModel.js");

let pass = 0, fail = 0;
function assert(desc, cond) { if (cond) { pass++; console.log(`  ok ${desc}`); } else { fail++; console.log(`  FAIL: ${desc}`); } }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const service = new CourtAssignmentService();

const P = (n, i) => makeParticipant(n, [`p${i}a`, `p${i}b`]);
const teams = [P("T1", 1), P("T2", 2), P("T3", 3), P("T4", 4), P("T5", 5), P("T6", 6), P("T7", 7), P("T8", 8)];
function fixture() {
  const mk = (i, a, b) => ({ ...makeMatch({ round: 1, court: null, teamA: teams[a], teamB: teams[b] }), id: `M${i}` });
  const matches = [mk(1, 0, 1), mk(2, 2, 3), mk(3, 4, 5), mk(4, 6, 7)];
  return {
    id: "T1", format: "roundRobin", status: "inProgress",
    courts: [3, 4, 5].map((n) => ({ id: `c${n}`, number: n, name: `Court ${n}`, status: "available" })),
    pools: [{ id: "p1", label: "Pool A", entrants: teams, rounds: [{ roundNumber: 1, status: "inProgress", matches }] }],
    bracket: null, nextMatchId: null,
  };
}
const m = (t, id) => t.pools[0].rounds[0].matches.find((x) => x.id === id);
const courtOf = (t, id) => m(t, id).court;
const avail = (t) => service.getAvailableCourts(t).map((c) => c.number);

console.log("\n1. Queue with several matches + free courts: nothing auto-assigned");
let t = fixture();
assert("fixture: 4 unassigned matches", t.pools[0].rounds[0].matches.every((x) => x.court === null));
assert("all 3 courts available", avail(t).join() === "3,4,5");
assert("no court holds a match", service.refreshQueue(t).courts.every((c) => !c.currentMatch));
assert("queue lists all 4", service.refreshQueue(t).queue.length === 4);

console.log("\n2. Set as Next Match does NOT assign a court");
t = await T.saveSetNextMatch(t, "M1");
assert("nextMatchId marked", t.nextMatchId === "M1");
assert("M1 still has no court", courtOf(t, "M1") === null);
assert("all courts still available", avail(t).join() === "3,4,5");

console.log("\n3. Manual Assign: M1 -> Court 3 (UP NEXT)");
t = await T.saveCourtAssignment(t, "M1", 3);
assert("M1 on Court 3, still pending (UP NEXT)", courtOf(t, "M1") === 3 && m(t, "M1").status === "pending");
assert("Court 4 and 5 remain available", avail(t).join() === "4,5");
assert("court 3 card shows M1", service.refreshQueue(t).courts.find((c) => c.number === 3).currentMatch?.id === "M1");
assert("other queued matches untouched", ["M2", "M3", "M4"].every((id) => courtOf(t, id) === null));

console.log("\n4. Assign M3 -> Court 5; Court 4 stays available");
t = await T.saveCourtAssignment(t, "M3", 5);
assert("M3 on Court 5", courtOf(t, "M3") === 5);
assert("Court 4 available", avail(t).join() === "4");
assert("occupied court cannot take a second match", (() => { try { service.assignMatchToCourt(t, "M2", 3); return false; } catch { return true; } })());
assert("a match cannot be double-assigned", (() => { try { service.assignMatchToCourt(t, "M1", 4); return false; } catch { return true; } })());

console.log("\n5. Start Court 3, then finish it: no auto-refill");
t = await T.saveMatchStart(t, "M1");
assert("Court 3 match is LIVE", m(t, "M1").status === "inProgress" && m(t, "M1").court === 3);
t = await T.saveMatchResult(t, "M1", { scoreA: 11, scoreB: 5, winnerId: teams[0].id });
assert("M1 completed", m(t, "M1").status === "completed");
assert("Court 3 available again (not refilled)", avail(t).includes(3));
assert("M2 and M4 still unassigned", courtOf(t, "M2") === null && courtOf(t, "M4") === null);
assert("queue still holds the unassigned matches", service.refreshQueue(t).queue.map((e) => e.match.id).sort().join() === "M2,M4");
assert("court 3 has no current match", !service.refreshQueue(t).courts.find((c) => c.number === 3).currentMatch);

console.log("\n6. Manual Release does not auto-refill either");
t = await T.saveCourtRelease(t, 5);
assert("M3 back in queue, Court 5 empty", courtOf(t, "M3") === null && avail(t).includes(5));
assert("nothing else got put on Court 5", [ "M2", "M3", "M4" ].every((id) => courtOf(t, id) === null));

console.log("\n7. Organizer manually assigns next match to Court 3");
t = await T.saveCourtAssignment(t, "M2", 3);
assert("M2 on Court 3", courtOf(t, "M2") === 3);
const assigned = t.pools[0].rounds[0].matches.filter((x) => x.court != null && x.status !== "completed");
assert("no duplicate court numbers", new Set(assigned.map((x) => x.court)).size === assigned.length);

console.log("\n8. Reassign and Swap still work");
t = await T.saveCourtReassignment(t, "M2", 3, 4);
assert("reassign M2 Court 3 -> 4", courtOf(t, "M2") === 4);
t = await T.saveCourtAssignment(t, "M4", 3);
t = await T.saveSwapCourts(t, 3, 4);
assert("swap exchanged M4 and M2", courtOf(t, "M4") === 4 && courtOf(t, "M2") === 3);

console.log("\n9. Source guards");
const src = strip(read("src/lib/tournament.js"));
assert("tournament.js no longer calls autoAssign / releaseAndAutoFill", !/\.autoAssign\(|releaseAndAutoFill\(/.test(src));
assert("manual assign controls still wired", /assignMatchToCourt/.test(src) && /swapCourts/.test(src));
assert("Open Play untouched by this feature", !/tournament/i.test(strip(read("src/lib/courtDispatch.js"))));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
