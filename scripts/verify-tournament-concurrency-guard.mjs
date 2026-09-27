// Red-Team Audit item 3 (BLOCKER): concurrent scorer updates could silently
// lose data — two clients fetch the same tournament, both save, and the
// second save blindly overwrites the first's change. This script proves
// the fix: lib/tournamentModel.js's saveTournament/fetchTournament now do a
// real, storage-layer compare-and-swap via storage.js's `ifMatch` (see both
// files' own comments for the full mechanism).
//
// The fake storage shim below deliberately does NOT just accept every
// write like the other verify-*.mjs scripts' shims — it faithfully models
// the real Supabase-backed src/storage.js: every row has its own
// `updated_at` token, `get` returns it, and `set` with an `ifMatch` option
// performs a genuine conditional update (rejects if the stored token has
// moved since `ifMatch` was read) — exactly the semantics storage.js
// implements via `UPDATE ... WHERE updated_at = ifMatch`. This is what
// makes the reproduction below a real test of the mechanism, not just a
// restatement of the code.
//
// Usage: node scripts/verify-tournament-concurrency-guard.mjs
const rows = new Map(); // key -> { value, updatedAt }
let clock = 0;
const nextToken = () => `t${++clock}`;

class StaleWriteError extends Error {
  constructor(key) {
    super(`stale write rejected for key: ${key}`);
    this.name = "StaleWriteError";
    this.code = "STALE_WRITE";
  }
}

globalThis.window = {
  storage: {
    get: async (key) => {
      const row = rows.get(key);
      if (!row) throw new Error(`storage.get: key not found: ${key}`);
      return { key, value: row.value, updatedAt: row.updatedAt };
    },
    set: async (key, value, _shared, { ifMatch } = {}) => {
      const row = rows.get(key);
      if (ifMatch !== undefined && ifMatch !== null) {
        if (!row || row.updatedAt !== ifMatch) throw new StaleWriteError(key);
      }
      const updatedAt = nextToken();
      rows.set(key, { value, updatedAt });
      return { key, value, updatedAt };
    },
    delete: async () => ({}),
    list: async () => ({ keys: [...rows.keys()] }),
  },
};

const T = await import("../src/lib/tournament.js");
const TM = await import("../src/lib/tournamentModel.js");
const { collectMatches } = await import("../src/engines/CourtAssignmentService.js");

let pass = 0, fail = 0;
function assert(desc, cond) { if (cond) { pass++; console.log(`  ok ${desc}`); } else { fail++; console.log(`  FAIL: ${desc}`); } }

const mkPlayer = (id, name) => ({ id, name, checkedIn: true, status: "ACTIVE" });
const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`p${i}`, `Player ${i}`));

console.log("\n1. First write (create) needs no ifMatch and always succeeds");
let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "CONC1", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
assert("tournament created", Boolean(t.id));
assert("saveTournament's return value carries a fresh _rev token", typeof t._rev === "string" && t._rev.length > 0);
assert("_rev is NOT written into the persisted JSON blob (kept out of the stored record)", !JSON.parse((await window.storage.get(`opl-tournament-${t.id}`, true)).value)._rev);

const m0raw = collectMatches(t).find((e) => !e.match.isBye).match;
t = await T.saveCourtAssignment(t, m0raw.id, 1);
t = await T.saveMatchStart(t, m0raw.id, "Scorer");
const m0 = m0raw;

console.log("\n2. THE ACTUAL BUG REPRODUCTION — two clients, same starting state, save+save");
{
  const clientA = await TM.fetchTournament(t.id);
  const clientB = await TM.fetchTournament(t.id);
  assert("both clients fetched the SAME starting revision", clientA._rev === clientB._rev);

  // Client A: score teamA -> 3 (via the real engine path, same as a real scorer click)
  const savedA = await T.saveAdjustMatchScore(clientA, m0.id, "teamA", 3);
  assert("Client A's save SUCCEEDS", savedA.pools[0].rounds[0].matches.find((m) => m.id === m0.id).score.teamA === 3);

  // Client B: STILL holding its stale pre-A copy, scores teamB -> 1
  let staleThrew = null;
  try {
    await T.saveAdjustMatchScore(clientB, m0.id, "teamB", 1);
  } catch (e) {
    staleThrew = e;
  }
  assert("Client B's STALE save is REJECTED (not silently applied)", staleThrew !== null);
  assert("...with the concurrency-conflict error code", staleThrew?.code === "STALE_WRITE");
  assert("...with a clear, actionable message (not a raw DB error)", /updated elsewhere.*refresh/i.test(staleThrew?.message || ""));

  const finalState = await TM.fetchTournament(t.id);
  const finalMatch = collectMatches(finalState).find((e) => e.match.id === m0.id).match;
  assert("PERSISTED STATE IS A's WRITE, UNCLOBBERED: teamA=3, teamB untouched (not teamB=1 from B's rejected write)", finalMatch.score.teamA === 3 && !finalMatch.score.teamB);
}

console.log("\n3. A fresh client CAN save successfully after re-reading the latest revision");
{
  const clientC = await TM.fetchTournament(t.id);
  const savedC = await T.saveAdjustMatchScore(clientC, m0.id, "teamB", 5);
  const m = savedC.pools[0].rounds[0].matches.find((mm) => mm.id === m0.id);
  assert("a client that re-fetched first saves cleanly", m.score.teamA === 3 && m.score.teamB === 5);
  const reloaded = await TM.fetchTournament(t.id);
  assert("...and it's actually persisted", collectMatches(reloaded).find((e) => e.match.id === m0.id).match.score.teamB === 5);
}

console.log("\n4. The SAME protection applies to a non-score field: serve state");
{
  const clientA = await TM.fetchTournament(t.id);
  const clientB = await TM.fetchTournament(t.id);
  await T.saveSetServeNumber(clientA, m0.id, 2); // A: serve number -> 2, succeeds
  let staleThrew = null;
  try {
    await T.saveSideOut(clientB, m0.id); // B: stale, would flip serving team + reset to 1st serve
  } catch (e) {
    staleThrew = e;
  }
  assert("Client B's stale serve-state write is also rejected", staleThrew?.code === "STALE_WRITE");
  const finalState = await TM.fetchTournament(t.id);
  const fm = collectMatches(finalState).find((e) => e.match.id === m0.id).match;
  assert("A's serve-state change survived uncontested (number stayed 2, team unchanged by B's rejected Side Out)", fm.serve.number === 2 && fm.serve.team === "teamA");
}

console.log("\n5. Match STATUS is protected too (End Match race)");
{
  const latest = await TM.fetchTournament(t.id);
  const m1raw = collectMatches(latest).find((e) => !e.match.isBye && e.match.id !== m0.id).match;
  let live = await T.saveCourtAssignment(latest, m1raw.id, 2);
  const m1 = collectMatches(live).find((e) => e.match.court === 2).match;
  live = await T.saveMatchStart(live, m1.id, "Scorer");
  const clientA = await TM.fetchTournament(live.id);
  const clientB = await TM.fetchTournament(live.id);
  const winnerId = m1.teamA.id;
  const savedA = await T.saveMatchResult(clientA, m1.id, { scoreA: 11, scoreB: 5, winnerId });
  assert("A finalizes the match", collectMatches(savedA).find((e) => e.match.id === m1.id).match.status === "completed");
  let staleThrew = null;
  try {
    await T.saveMatchResult(clientB, m1.id, { scoreA: 9, scoreB: 11, winnerId: m1.teamB.id }); // B: stale, opposite result
  } catch (e) {
    staleThrew = e;
  }
  assert("Client B's stale, CONTRADICTORY result is rejected outright (can't silently flip the winner)", staleThrew?.code === "STALE_WRITE");
  const finalState = await TM.fetchTournament(live.id);
  const fm = collectMatches(finalState).find((e) => e.match.id === m1.id).match;
  assert("the persisted winner is still A's result, not B's stale flip", fm.winner === winnerId && fm.score.teamA === 11);
}

console.log("\n6. Backward compatibility: existing single-writer flows are completely unaffected");
{
  // sequential saves from ONE client, no interleaving — must still work exactly as before
  let seq = await T.buildAndSaveRoundRobinTournament({ sessionCode: "CONC2", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
  const mm = collectMatches(seq).find((e) => !e.match.isBye).match;
  seq = await T.saveCourtAssignment(seq, mm.id, 1);
  seq = await T.saveMatchStart(seq, mm.id);
  seq = await T.saveAdjustMatchScore(seq, mm.id, "teamA", 1);
  seq = await T.saveAdjustMatchScore(seq, mm.id, "teamA", 1);
  seq = await T.saveSetServeNumber(seq, mm.id, 1);
  const m = collectMatches(seq).find((e) => e.match.id === mm.id).match;
  assert("normal sequential single-client editing still works end to end, no false conflicts", m.score.teamA === 2 && m.serve.number === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
