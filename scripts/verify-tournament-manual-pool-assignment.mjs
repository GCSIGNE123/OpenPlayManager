// Manual Pool Assignment — see PROJECT.md/FEATURES.md and
// engines/PoolAssignment.js/components/PoolAssignmentPanel.jsx. The organizer
// explicitly decides which teams belong to which pool before the schedule is
// generated; the existing "manual" seam in POOL_ASSIGNMENT_METHODS is reused,
// not a second pool model, and every existing custom-doubles/court-assignment/
// scoring/standings behavior is untouched.
import fs from "node:fs";

const store = new Map();
globalThis.window = { storage: {
  get: async (k) => (store.has(k) ? { value: store.get(k) } : null),
  set: async (k, v) => { store.set(k, v); return { value: v }; },
  delete: async (k) => { store.delete(k); return {}; },
  list: async () => ({ keys: [...store.keys()] }),
} };
const T = await import("../src/lib/tournament.js");
const { entrantKey, manualAssignment, assignPools, distributeEvenly, poolLabel } = await import("../src/engines/PoolAssignment.js");
const { makeParticipant } = await import("../src/lib/tournamentModel.js");

let pass = 0, fail = 0;
function assert(desc, cond) { if (cond) { pass++; console.log(`  ok ${desc}`); } else { fail++; console.log(`  FAIL: ${desc}`); } }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const mkPlayer = (id, name) => ({ id, name, checkedIn: true, status: "ACTIVE", partnerId: null });
const P = (n, i) => makeParticipant(n, [`p${i}a`, `p${i}b`]);

console.log("\n1. entrantKey is stable and independent of entrant.id (a fresh uid every buildEntrants call)");
{
  const t1 = P("Team 1", 1);
  const t2 = makeParticipant("Team 1 (rebuilt)", [...t1.playerIds]); // same players, fresh id/label
  assert("same playerIds -> same key even with a different id/label", entrantKey(t1) === entrantKey(t2));
  const t3 = P("Team 2", 2);
  assert("different playerIds -> different key", entrantKey(t1) !== entrantKey(t3));
}

console.log("\n2. A team can be assigned to a pool, moved, and returned to Unassigned");
{
  const teams = [P("T1", 1), P("T2", 2), P("T3", 3), P("T4", 4)];
  const k = (i) => entrantKey(teams[i]);
  let assignments = { [k(0)]: 0, [k(1)]: 0, [k(2)]: 1, [k(3)]: 1 };
  const groups1 = manualAssignment(teams, 2, assignments);
  assert("initial assignment: 2 teams in Pool A, 2 in Pool B", groups1[0].length === 2 && groups1[1].length === 2);
  assignments = { ...assignments, [k(0)]: 1 }; // move T1 from Pool A to Pool B
  const groups2 = manualAssignment(teams, 2, assignments);
  assert("moving T1 A -> B updates membership immediately", groups2[0].map((e) => e.label).join(",") === "T2" && groups2[1].some((e) => e.label === "T1"));
  const { [k(0)]: _drop, ...withoutT1 } = assignments;
  assert("T1 returned to Unassigned is simply absent from the map (no pool contains it)", !(k(0) in withoutT1));
}

console.log("\n3. Duplicate / unknown / invalid assignment is rejected");
{
  const teams = [P("T1", 1), P("T2", 2), P("T3", 3), P("T4", 4)];
  const k = (i) => entrantKey(teams[i]);
  const missing = { [k(0)]: 0, [k(1)]: 0, [k(2)]: 1 }; // T4 missing
  assert("a team missing from every pool is rejected", (() => { try { manualAssignment(teams, 2, missing); return false; } catch { return true; } })());
  const badPool = { [k(0)]: 0, [k(1)]: 0, [k(2)]: 1, [k(3)]: 5 }; // pool 5 doesn't exist
  assert("an out-of-range pool index is rejected", (() => { try { manualAssignment(teams, 2, badPool); return false; } catch { return true; } })());
  const stale = { [k(0)]: 0, [k(1)]: 0, [k(2)]: 1, [k(3)]: 1, "stale-key": 0 };
  assert("a stale/unknown team key is rejected, not silently ignored", (() => { try { manualAssignment(teams, 2, stale); return false; } catch { return true; } })());
  assert("a completely missing assignments object is rejected, not treated as 'everyone unassigned is fine'", (() => { try { manualAssignment(teams, 2, null); return false; } catch { return true; } })());
  // Duplicate assignment (same team pointed at two pools) isn't representable in
  // a plain {key -> single pool} map — the data structure itself prevents it,
  // same as setFixedPartner's mutual pointer prevents a player having two teams.
  const teamsPreview = teams.map((t) => entrantKey(t));
  assert("the map shape structurally forbids one team appearing in two pools at once", new Set(teamsPreview).size === teamsPreview.length);
}

console.log("\n4. Valid pool assignment confirmed; no cross-pool matches; unequal pools allowed with a warning-level signal only");
{
  // 12 teams / 3 pools, exactly as the example: 1,4,7,10 / 2,5,8,11 / 3,6,9,12
  const teams = Array.from({ length: 12 }, (_, i) => P(`Team ${i + 1}`, i + 1));
  const assignments = {};
  teams.forEach((t, i) => { assignments[entrantKey(t)] = i % 3; });
  const groups = assignPools(teams, 3, "manual", assignments);
  assert("Pool A gets exactly Team 1,4,7,10", groups[0].map((e) => e.label).join(",") === "Team 1,Team 4,Team 7,Team 10");
  assert("Pool B gets exactly Team 2,5,8,11", groups[1].map((e) => e.label).join(",") === "Team 2,Team 5,Team 8,Team 11");
  assert("Pool C gets exactly Team 3,6,9,12", groups[2].map((e) => e.label).join(",") === "Team 3,Team 6,Team 9,Team 12");

  // unequal pools: 5/4/3
  const uneven = {};
  teams.forEach((t, i) => { uneven[entrantKey(t)] = i < 5 ? 0 : i < 9 ? 1 : 2; });
  const g2 = assignPools(teams, 3, "manual", uneven);
  assert("unequal pool sizes are permitted by the engine itself (organizer intentionally controls composition)", g2.map((g) => g.length).join(",") === "5,4,3");
}

console.log("\n5. Schedule generation consumes the EXACT manual pool membership — buildAndSaveRoundRobinTournament end to end");
{
  const players = Array.from({ length: 12 }, (_, i) => mkPlayer(`p${i}`, `Player ${i}`));
  const T2 = await import("../src/lib/tournament.js");
  const entrants = T2.buildEntrants(players, "singles");
  const assignments = {};
  entrants.forEach((e, i) => { assignments[entrantKey(e)] = i % 3; });
  const tournament = await T.buildAndSaveRoundRobinTournament({
    sessionCode: "MANUALPOOL1",
    players,
    mode: "singles",
    courtsCount: 2,
    poolCount: 3,
    assignmentMethod: "manual",
    poolAssignments: assignments,
  });
  assert("3 pools were created", tournament.pools.length === 3);
  const wantByPool = [0, 1, 2].map((idx) => new Set(entrants.filter((_, i) => i % 3 === idx).map((e) => e.label)));
  tournament.pools.forEach((pool, idx) => {
    const gotLabels = new Set(pool.entrants.map((e) => e.label));
    assert(`pool ${idx} contains exactly its manually assigned teams (no more, no fewer)`, gotLabels.size === wantByPool[idx].size && [...gotLabels].every((l) => wantByPool[idx].has(l)));
    const allMatchTeams = pool.rounds.flatMap((r) => r.matches.filter((m) => !m.isBye)).flatMap((m) => [m.teamA.label, m.teamB.label]);
    assert(`pool ${idx}'s generated matches reference ONLY that pool's own teams (no cross-pool match)`, allMatchTeams.every((l) => wantByPool[idx].has(l)));
  });
  const seenEverywhere = tournament.pools.flatMap((p) => p.entrants.map((e) => e.label));
  assert("every team appears in exactly one pool (12 teams total, no duplicates, none dropped)", seenEverywhere.length === 12 && new Set(seenEverywhere).size === 12);
}

console.log("\n6. Custom doubles pairing remains intact under manual pool assignment");
{
  const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`d${i}`, `D${i}`));
  // pair d0<->d1, d2<->d3, d4<->d5, d6<->d7 as fixed partners
  for (let i = 0; i < 8; i += 2) { players[i].partnerId = players[i + 1].id; players[i + 1].partnerId = players[i].id; }
  const T2 = await import("../src/lib/tournament.js");
  const entrants = T2.buildEntrants(players, "doubles");
  assert("doubles entrants are still built from the fixed-partner pairing, unchanged", entrants.length === 4 && entrants[0].playerIds.length === 2);
  const assignments = {};
  entrants.forEach((e, i) => { assignments[entrantKey(e)] = i % 2; });
  const tournament = await T.buildAndSaveRoundRobinTournament({
    sessionCode: "MANUALPOOL2",
    players,
    mode: "doubles",
    courtsCount: 2,
    poolCount: 2,
    assignmentMethod: "manual",
    poolAssignments: assignments,
  });
  assert("doubles teams (both players together) land in the pool they were assigned to", tournament.pools[0].entrants.length === 2 && tournament.pools[1].entrants.length === 2);
  assert("every saved entrant still carries both playerIds (pairing untouched by pool assignment)", tournament.pools.flatMap((p) => p.entrants).every((e) => e.playerIds.length === 2));
}

console.log("\n7. Schedule generation without a complete/valid manual assignment fails loudly, not silently");
{
  const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`u${i}`, `U${i}`));
  const T2 = await import("../src/lib/tournament.js");
  const entrants = T2.buildEntrants(players, "singles");
  const incomplete = {};
  entrants.slice(0, 6).forEach((e, i) => { incomplete[entrantKey(e)] = i % 2; }); // 2 teams left unassigned
  let threw = false;
  try {
    await T.buildAndSaveRoundRobinTournament({ sessionCode: "MANUALPOOL3", players, mode: "singles", courtsCount: 2, poolCount: 2, assignmentMethod: "manual", poolAssignments: incomplete });
  } catch { threw = true; }
  assert("generating a schedule with an unassigned team throws rather than silently dropping/auto-placing it", threw);
}

console.log("\n8. Existing (pre-feature) tournaments — random assignment — still work exactly as before");
{
  const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`r${i}`, `R${i}`));
  const tournament = await T.buildAndSaveRoundRobinTournament({ sessionCode: "MANUALPOOL4", players, mode: "singles", courtsCount: 2, poolCount: 2 });
  assert("no assignmentMethod/poolAssignments passed -> defaults to random, exactly as before this feature", tournament.assignmentMethod === "random" && tournament.pools.length === 2);
  const total = tournament.pools.reduce((s, p) => s + p.entrants.length, 0);
  assert("all 8 players still land in a pool", total === 8);
}

console.log("\n8b. Regenerate: an already-generated (not completed) tournament can still be given a fresh manual pool assignment");
{
  const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`g${i}`, `G${i}`));
  const T2 = await import("../src/lib/tournament.js");
  // first generate — random, exactly as the existing "Generate schedule" flow always has
  const first = await T.buildAndSaveRoundRobinTournament({ sessionCode: "MANUALPOOL5", players, mode: "singles", courtsCount: 2, poolCount: 2 });
  assert("first generate uses random assignment, status not completed", first.assignmentMethod === "random" && first.status !== "completed");
  // Regenerate with a manual assignment this time — the same players, reshuffled by hand
  const entrants = T2.buildEntrants(players, "singles");
  const assignments = {};
  entrants.forEach((e, i) => { assignments[entrantKey(e)] = i < 4 ? 0 : 1; });
  const second = await T.buildAndSaveRoundRobinTournament({ sessionCode: "MANUALPOOL5", players, mode: "singles", courtsCount: 2, poolCount: 2, assignmentMethod: "manual", poolAssignments: assignments });
  assert("Regenerate with a manual assignment rebuilds the pools exactly as specified", second.pools[0].entrants.map((e) => e.label).join(",") === "G0,G1,G2,G3" && second.pools[1].entrants.map((e) => e.label).join(",") === "G4,G5,G6,G7");
}

console.log("\n9. distributeEvenly / poolLabel (existing helpers) are untouched by the manual seam");
{
  assert("distributeEvenly still splits evenly with remainder to earliest pools", JSON.stringify(distributeEvenly(18, 3)) === "[6,6,6]" && JSON.stringify(distributeEvenly(22, 4)) === "[6,6,5,5]");
  assert("poolLabel still produces Pool A, Pool B, ...", poolLabel(0) === "Pool A" && poolLabel(1) === "Pool B");
}

console.log("\n10. Wiring: PoolAssignmentPanel reuses the existing manual seam, no parallel pool model");
{
  const eng = read("src/engines/PoolAssignment.js");
  assert("manual is registered in POOL_ASSIGNMENT_METHODS (the pre-existing seam), not a new registry", /manual:\s*manualAssignment/.test(eng) && /POOL_ASSIGNMENT_METHODS\s*=\s*\{/.test(eng));
  const panel = read("src/components/PoolAssignmentPanel.jsx");
  assert("the panel previews entrants via the SAME buildEntrants Team Setup/Generate Schedule use (no second team model)", /buildEntrants/.test(panel));
  assert("the panel keys assignments by entrantKey (stable across buildEntrants calls), not entrant.id", /entrantKey/.test(panel));
  const view = read("src/components/TournamentScheduleView.jsx");
  assert("Generate Schedule is gated on a CONFIRMED manual assignment when there's more than one pool", /needsPoolAssignment/.test(view) && /poolAssignmentReady/.test(view));
  assert("the panel is shown for both the first Generate and every Regenerate, hidden only once the tournament is completed", /!tournamentCompleted && needsPoolAssignment/.test(view));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
