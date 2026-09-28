// Tournament Stale-Write Recovery — TournamentDashboardView.jsx's
// runTournamentSave helper. Proves the recovery algorithm end to end
// against a real (faithful, conditional-CAS) fake storage — the same shim
// verify-tournament-concurrency-guard.mjs uses — and source-guards that the
// actual component really wires every required handler through it, since
// this repo has no React test renderer to mount TournamentDashboardView
// itself (same "prove the algorithm + source-guard the wiring" pattern
// verify-tournament-serve-state.mjs's section 11 already established).
//
// Usage: node scripts/verify-tournament-stale-recovery.mjs
import fs from "node:fs";

const rows = new Map();
let clock = 0;
const nextToken = () => `t${++clock}`;

class StaleWriteError extends Error {
  constructor(key) {
    super(`stale write rejected for key: ${key}`);
    this.name = "StaleWriteError";
    this.code = "STALE_WRITE";
  }
}

let getCalls = 0;
let setCalls = 0;

globalThis.window = {
  storage: {
    get: async (key) => {
      getCalls++;
      const row = rows.get(key);
      if (!row) throw new Error(`storage.get: key not found: ${key}`);
      return { key, value: row.value, updatedAt: row.updatedAt };
    },
    set: async (key, value, _shared, { ifMatch } = {}) => {
      setCalls++;
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
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---- Standalone reimplementation of TournamentDashboardView.jsx's
// runTournamentSave — same algorithm, so this test exercises the real
// behavior; the source-guard section below confirms the component actually
// defines and uses this exact shape.
function makeHarness() {
  let tournament = null;
  let error = "";
  const setError = (m) => { error = m; };
  const runTournamentSave = async (setErr, saveFn) => {
    setErr("");
    try {
      const updated = await saveFn();
      tournament = updated;
      return updated;
    } catch (e) {
      setErr(e.message);
      if (e?.code === "STALE_WRITE" && tournament?.id) {
        try {
          const fresh = await TM.fetchTournament(tournament.id);
          if (fresh) tournament = fresh;
        } catch {
          // refetch failed — leave state as-is
        }
      }
      return null;
    }
  };
  return {
    runTournamentSave: (saveFn) => runTournamentSave(setError, saveFn),
    get tournament() { return tournament; },
    set tournament(t) { tournament = t; },
    get error() { return error; },
  };
}

const mkPlayer = (id, name) => ({ id, name, checkedIn: true, status: "ACTIVE" });
const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`p${i}`, `Player ${i}`));

console.log("\n1. Stale score save -> latest tournament loaded, rejected score not applied");
{
  const h = makeHarness();
  let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "SR1", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
  const m0 = collectMatches(t).find((e) => !e.match.isBye).match;
  t = await T.saveCourtAssignment(t, m0.id, 1);
  t = await T.saveMatchStart(t, m0.id, "Scorer");
  h.tournament = await TM.fetchTournament(t.id); // this "client"'s starting copy
  const other = await TM.fetchTournament(t.id); // another client, same starting rev
  await T.saveAdjustMatchScore(other, m0.id, "teamA", 3); // lands first — moves the rev
  getCalls = 0;
  const result = await h.runTournamentSave(() => T.saveAdjustMatchScore(h.tournament, m0.id, "teamB", 9));
  assert("the stale save returns null (rejected, not applied)", result === null);
  assert("exactly one refetch happened", getCalls === 1);
  const scored = collectMatches(h.tournament).find((e) => e.match.id === m0.id).match.score;
  assert("local state now reflects the OTHER client's write (teamA=3), not the rejected teamB=9", scored.teamA === 3 && !scored.teamB);
  assert("the stale-write operator message is preserved", /updated elsewhere.*refresh/i.test(h.error));
}

console.log("\n2. Stale serve-state save -> fresh state loaded");
{
  const h = makeHarness();
  let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "SR2", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
  const m0 = collectMatches(t).find((e) => !e.match.isBye).match;
  t = await T.saveCourtAssignment(t, m0.id, 1);
  t = await T.saveMatchStart(t, m0.id, "Scorer");
  h.tournament = await TM.fetchTournament(t.id);
  const other = await TM.fetchTournament(t.id);
  await T.saveSetServeNumber(other, m0.id, 2);
  const result = await h.runTournamentSave(() => T.saveSideOut(h.tournament, m0.id)); // stale Side Out
  assert("stale Side Out rejected", result === null);
  const serve = collectMatches(h.tournament).find((e) => e.match.id === m0.id).match.serve;
  assert("local state now shows the other client's serve number (2), Side Out never applied", serve.number === 2 && serve.team === "teamA");
}

console.log("\n3. Stale End Match -> fresh state loaded, rejected action not retried");
{
  const h = makeHarness();
  let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "SR3", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
  const m0 = collectMatches(t).find((e) => !e.match.isBye).match;
  t = await T.saveCourtAssignment(t, m0.id, 1);
  t = await T.saveMatchStart(t, m0.id, "Scorer");
  h.tournament = await TM.fetchTournament(t.id);
  const other = await TM.fetchTournament(t.id);
  const winnerId = m0.teamA.id;
  await T.saveMatchResult(other, m0.id, { scoreA: 11, scoreB: 5, winnerId });
  let saveAttempts = 0;
  const result = await h.runTournamentSave(() => {
    saveAttempts++;
    return T.saveMatchResult(h.tournament, m0.id, { scoreA: 3, scoreB: 11, winnerId: m0.teamB.id }); // stale, contradictory
  });
  assert("stale End Match rejected", result === null);
  assert("saveFn was called exactly once (no automatic retry)", saveAttempts === 1);
  const finalMatch = collectMatches(h.tournament).find((e) => e.match.id === m0.id).match;
  assert("local state now reflects the OTHER client's real finalization (A won 11-5), not the rejected flip", finalMatch.status === "completed" && finalMatch.winner === winnerId);
}

console.log("\n4. Stale court reassignment -> fresh state loaded (a genuine storage-layer conflict, not just a business-rule rejection)");
{
  // Deliberately a change that does NOT trip CourtAssignmentService's own
  // business validation from the stale snapshot's point of view (Court 3 is
  // free in both the stale AND the real state) — so this exercises the
  // storage-layer compare-and-swap itself, not an earlier engine-level
  // rejection (e.g. "this court already has a match on it," a DIFFERENT,
  // pre-existing, entirely valid error path that a stale in-memory
  // snapshot can also trigger — see the final report's note on this).
  const h = makeHarness();
  let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "SR4", players, mode: "doubles", courtsCount: 3, poolCount: 1 });
  const [e0, e1] = collectMatches(t).filter((e) => !e.match.isBye);
  t = await T.saveCourtAssignment(t, e0.match.id, 1);
  t = await T.saveMatchStart(t, e0.match.id, "Scorer");
  t = await T.saveCourtAssignment(t, e1.match.id, 2);
  h.tournament = await TM.fetchTournament(t.id);
  const other = await TM.fetchTournament(t.id);
  await T.saveAdjustMatchScore(other, e0.match.id, "teamA", 1); // bumps the rev; doesn't touch e1/Court 3 at all
  const result = await h.runTournamentSave(() => T.saveCourtReassignment(h.tournament, e1.match.id, 2, 3)); // valid by every business rule, but stale
  assert("the reassignment itself was valid but still rejected as stale", result === null);
  const fresh = collectMatches(h.tournament);
  assert("local state reflects the other client's score change (teamA=1)", fresh.find((e) => e.match.id === e0.match.id).match.score.teamA === 1);
  assert("the rejected reassignment was NOT applied — e1 is still on Court 2, not Court 3", fresh.find((e) => e.match.id === e1.match.id).match.court === 2);
}

console.log("\n5. Normal successful save -> unchanged behavior, no refetch");
{
  const h = makeHarness();
  let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "SR5", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
  const m0 = collectMatches(t).find((e) => !e.match.isBye).match;
  t = await T.saveCourtAssignment(t, m0.id, 1);
  t = await T.saveMatchStart(t, m0.id, "Scorer");
  h.tournament = t;
  getCalls = 0;
  const result = await h.runTournamentSave(() => T.saveAdjustMatchScore(h.tournament, m0.id, "teamA", 1));
  assert("successful save returns the updated tournament", result !== null);
  assert("no refetch occurs on an ordinary successful save", getCalls === 0);
  assert("score applied normally", collectMatches(h.tournament).find((e) => e.match.id === m0.id).match.score.teamA === 1);
  assert("error cleared", h.error === "");
}

console.log("\n6. Non-STALE_WRITE error -> no refetch, no stale-recovery behavior");
{
  const h = makeHarness();
  let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "SR6", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
  const m0 = collectMatches(t).find((e) => !e.match.isBye).match;
  h.tournament = t; // match never started -> adjustScore throws a plain (non-stale) validation error
  getCalls = 0;
  const before = h.tournament;
  const result = await h.runTournamentSave(() => T.saveAdjustMatchScore(h.tournament, m0.id, "teamA", 1));
  assert("ordinary error rejects the save", result === null);
  assert("no refetch happens for a non-STALE_WRITE error", getCalls === 0);
  assert("local tournament state is left completely untouched", h.tournament === before);
  assert("the real (non-stale) error message is shown, not the stale-write message", /in progress/i.test(h.error));
}

console.log("\n7. Stale recovery performs exactly one fetch and zero retry saves (aggregate check)");
{
  const h = makeHarness();
  let t = await T.buildAndSaveRoundRobinTournament({ sessionCode: "SR7", players, mode: "doubles", courtsCount: 2, poolCount: 1 });
  const m0 = collectMatches(t).find((e) => !e.match.isBye).match;
  t = await T.saveCourtAssignment(t, m0.id, 1);
  t = await T.saveMatchStart(t, m0.id, "Scorer");
  h.tournament = await TM.fetchTournament(t.id);
  const other = await TM.fetchTournament(t.id);
  await T.saveAdjustMatchScore(other, m0.id, "teamA", 5);
  getCalls = 0;
  let saveAttempts = 0;
  await h.runTournamentSave(() => {
    saveAttempts++;
    return T.saveAdjustMatchScore(h.tournament, m0.id, "teamB", 1);
  });
  assert("exactly one storage.get (the recovery refetch) — no polling, no duplicate refetch", getCalls === 1);
  assert("exactly one save attempt total — the recovery never retries the rejected action", saveAttempts === 1);
}

console.log("\n8. Source guard: the actual component wires every required handler through runTournamentSave");
{
  const src = read("src/components/TournamentDashboardView.jsx");
  assert("runTournamentSave is defined once, checks e.code === \"STALE_WRITE\", and calls fetchTournament", /const runTournamentSave = async \(setError, saveFn\)/.test(src) && /e\?\.code === "STALE_WRITE"/.test(src) && /await fetchTournament\(tournament\.id\)/.test(src));
  // Extract each named handler's own body by finding its start and the
  // start of the NEXT "const handleX = " (or end of file) — simpler and
  // more robust than a bounded-length regex against a file this size.
  const handlerBody = (name) => {
    const start = src.indexOf(`const ${name} = `);
    if (start === -1) return null;
    const nextConst = src.indexOf("\n  const handle", start + 10);
    const nextExport = src.indexOf("\n  const pools = tournament", start + 10);
    let end = [nextConst, nextExport].filter((n) => n !== -1).sort((a, b) => a - b)[0];
    if (end === undefined) end = src.length;
    return src.slice(start, end);
  };
  const required = [
    ["handleAssignMatch", "saveCourtAssignment"],
    ["handleSetServeNumber", "saveSetServeNumber"],
    ["handleSideOut", "saveSideOut"],
    ["handleChangeServe", "saveChangeServe"],
    ["handleEndMatch", "switch (source)"],
    ["handleReassignMatch", "saveCourtReassignment"],
    ["handleSwapCourts", "saveSwapCourts"],
  ];
  for (const [name, marker] of required) {
    const body = handlerBody(name);
    assert(`${name} is wired through runTournamentSave`, Boolean(body) && body.includes("runTournamentSave(") && body.includes(marker));
  }
  const genBody = handlerBody("handleGenerate");
  assert("handleGenerate was deliberately left untouched (different save path, out of scope — still its own manual setMatchError/status guard, not runTournamentSave)", Boolean(genBody) && genBody.includes('setMatchError("")') && genBody.includes('tournament?.status === "completed"') && !genBody.includes("runTournamentSave("));
  assert("the 4 Manual Qualification Override handlers keep their own try/catch + rethrow (different contract, deliberately not centralized)", (src.match(/setQualificationError\(e\.message\);\n      throw e;/g) || []).length === 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
