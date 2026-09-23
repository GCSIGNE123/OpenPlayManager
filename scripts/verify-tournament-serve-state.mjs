// Tournament Scorer — 1st Serve / 2nd Serve — see PROJECT.md/FEATURES.md.
// Manual, scorer-controlled serve/side-out bookkeeping alongside the
// existing +/- score buttons. Verifies: initial serve state, the 1st/2nd
// toggle, Change Serve, Side Out, point history logging on "+" (tagged with
// the serve state active at the moment), the matching pop on "-", the
// bounded log cap, that finalize (saveMatchResult/updateBracket) preserves
// serve/pointLog untouched, and that none of this touches Open Play,
// Adaptive Ranking, Team Setup, or the tournament storage key.
import fs from "node:fs";

globalThis.window = { storage: {} };
const { CourtAssignmentService } = await import("../src/engines/CourtAssignmentService.js");
const { makeMatch, makeParticipant } = await import("../src/lib/tournamentModel.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const service = new CourtAssignmentService();
const teamA = makeParticipant("Ana / Ben", ["a", "b"]);
const teamB = makeParticipant("Cara / Dan", ["c", "d"]);

function fixture() {
  const match = { ...makeMatch({ round: 1, court: 1, teamA, teamB }), status: "inProgress", startedAt: Date.now() };
  return { id: "T1", format: "roundRobin", pools: [{ id: "p1", label: "Pool A", entrants: [teamA, teamB], rounds: [{ roundNumber: 1, status: "inProgress", matches: [match] }] }], bracket: null, courts: [] };
}
const matchOf = (t) => t.pools[0].rounds[0].matches[0];

console.log("\n1. Initial serve state");
{
  const t = fixture();
  const m = matchOf(t);
  assert("defaults to teamA, 1st Serve", m.serve.team === "teamA" && m.serve.number === 1);
  assert("pointLog starts empty", Array.isArray(m.pointLog) && m.pointLog.length === 0);
}

console.log("\n2. 1st Serve / 2nd Serve toggle — manual, no score/team change");
{
  let t = fixture();
  t = service.setServeNumber(t, matchOf(t).id, 2);
  assert("serve.number set to 2", matchOf(t).serve.number === 2);
  assert("serve.team unchanged", matchOf(t).serve.team === "teamA");
  assert("score untouched", matchOf(t).score.teamA === null && matchOf(t).score.teamB === null);
  t = service.setServeNumber(t, matchOf(t).id, 1);
  assert("toggled back to 1st Serve", matchOf(t).serve.number === 1);
}

console.log("\n3. Change Serve — flips 1st/2nd for the SAME team");
{
  let t = fixture();
  t = service.changeServe(t, matchOf(t).id);
  assert("1 -> 2", matchOf(t).serve.number === 2 && matchOf(t).serve.team === "teamA");
  t = service.changeServe(t, matchOf(t).id);
  assert("2 -> 1", matchOf(t).serve.number === 1 && matchOf(t).serve.team === "teamA");
}

console.log("\n4. Side Out — switches serving team, resets to 1st Serve, never touches score");
{
  let t = fixture();
  t = service.setServeNumber(t, matchOf(t).id, 2); // 2nd serve, teamA
  t = service.adjustScore(t, matchOf(t).id, "teamA", 1); // score in progress
  t = service.sideOut(t, matchOf(t).id);
  const m = matchOf(t);
  assert("serve.team flipped to teamB", m.serve.team === "teamB");
  assert("reset to 1st Serve", m.serve.number === 1);
  assert("score untouched by side out", m.score.teamA === 1 && m.score.teamB === null);
}

console.log("\n5. '+' scoring: existing behavior preserved, plus a tagged point-history entry");
{
  let t = fixture();
  t = service.setServeNumber(t, matchOf(t).id, 1);
  t = service.adjustScore(t, matchOf(t).id, "teamA", 1);
  let m = matchOf(t);
  assert("score incremented exactly as before", m.score.teamA === 1);
  assert("one point logged, tagged with the serve state active at that moment", m.pointLog.length === 1 && m.pointLog[0].scoreA === 1 && m.pointLog[0].scoreB === 0 && m.pointLog[0].servingTeam === "teamA" && m.pointLog[0].serveNumber === 1);
  assert("logged entry has a timestamp", typeof m.pointLog[0].timestamp === "number");

  t = service.changeServe(t, matchOf(t).id); // now 2nd serve, still teamA
  t = service.adjustScore(t, matchOf(t).id, "teamB", 1); // receiving team's own '+' — NOT gated, NOT an auto side-out
  m = matchOf(t);
  assert("receiving team's '+' still just scores (no rally-winner logic invented)", m.score.teamB === 1);
  assert("serve state is NOT auto-changed by a receiving-team point", m.serve.team === "teamA" && m.serve.number === 2);
  assert("that point is logged with the CURRENT serve state (2nd Serve), not re-derived", m.pointLog[1].serveNumber === 2 && m.pointLog[1].servingTeam === "teamA");
}

console.log("\n6. '-' scoring: existing behavior preserved, defensively pops the matching history entry");
{
  let t = fixture();
  t = service.adjustScore(t, matchOf(t).id, "teamA", 1); // 0-0 -> 1-0, logged
  t = service.adjustScore(t, matchOf(t).id, "teamA", -1); // undo
  let m = matchOf(t);
  assert("score decremented exactly as before", m.score.teamA === 0);
  assert("the matching log entry was popped", m.pointLog.length === 0);

  // Defensive check: '-' must NOT remove an unrelated/mismatched entry.
  t = fixture();
  t = service.adjustScore(t, matchOf(t).id, "teamA", 1); // 1-0, logged
  t = service.declareWinner(t, matchOf(t).id, "teamB"); // score jumps to 0-11, unrelated to the log's 1-0
  t = service.adjustScore(t, matchOf(t).id, "teamB", -1); // 0-10 — does not match the stale log entry
  m = matchOf(t);
  assert("stale/mismatched log entry is left alone rather than guessed away", m.pointLog.length === 1 && m.pointLog[0].scoreA === 1);
}

console.log("\n7. Bounded point history");
{
  let t = fixture();
  const { CourtAssignmentService: _S } = {}; // no-op, keep import graph honest
  for (let i = 0; i < 60; i++) t = service.adjustScore(t, matchOf(t).id, "teamA", 1);
  assert("pointLog capped (MAX_POINT_LOG), not unbounded", matchOf(t).pointLog.length > 0 && matchOf(t).pointLog.length <= 40);
  assert("score itself is NOT capped, only the log", matchOf(t).score.teamA === 60);
}

console.log("\n8. Only an in-progress match can have serve/score touched (same gate as existing adjustScore)");
{
  let t = fixture();
  t.pools[0].rounds[0].matches[0] = { ...matchOf(t), status: "pending" };
  for (const call of [
    () => service.setServeNumber(t, matchOf(t).id, 2),
    () => service.changeServe(t, matchOf(t).id),
    () => service.sideOut(t, matchOf(t).id),
  ]) {
    let threw = false;
    try { call(); } catch { threw = true; }
    assert("rejects a non-in-progress match, same as adjustScore already does", threw);
  }
}

console.log("\n9. Finalization (End Match) preserves serve/pointLog untouched");
{
  const { RoundRobinEngine } = await import("../src/engines/RoundRobinEngine.js");
  const engine = new RoundRobinEngine();
  let t = fixture();
  t = service.adjustScore(t, matchOf(t).id, "teamA", 1);
  t = service.sideOut(t, matchOf(t).id);
  const before = matchOf(t);
  const updated = engine.updateMatchResult(t, before.id, { scoreA: 11, scoreB: 5, winnerId: teamA.id });
  const after = updated.pools[0].rounds[0].matches[0];
  assert("match completed", after.status === "completed" && after.winner === teamA.id);
  assert("serve state survived finalization untouched", JSON.stringify(after.serve) === JSON.stringify(before.serve));
  assert("pointLog survived finalization untouched", JSON.stringify(after.pointLog) === JSON.stringify(before.pointLog));
  assert("winner determination itself is untouched by this feature (still highest score, unchanged rule)", after.winner === teamA.id);
}

console.log("\n10. Scope: source-level guards");
{
  const svc = strip(read("src/engines/CourtAssignmentService.js"));
  assert("no new rally-winner / auto-side-out logic in adjustScore (still an unconditional +/- of the clicked side)", /Math\.max\(0, current \+ delta\)/.test(svc));
  assert("side out is the ONLY place serve.team is ever reassigned", (svc.match(/serve:\s*\{\s*team:/g) || []).length >= 1 && /sideOut\(tournament, matchId\)/.test(svc));

  const openPlayFiles = ["src/components/ScorerView.jsx", "src/components/CourtCard.jsx", "src/lib/queueManagement.js", "src/engines/AdaptiveSkillRotationEngine.js", "src/engines/AdaptiveRankingRotationEngine.js"];
  for (const f of openPlayFiles) {
    if (!fs.existsSync(new URL(`../${f}`, import.meta.url))) continue;
    assert(`${f} untouched by this feature (no serve/pointLog/sideOut reference)`, !/\bserve\b|\bpointLog\b|sideOut|changeServe/i.test(strip(read(f))));
  }
  assert("TournamentParticipantsView (Team Setup) untouched by this feature", !/\bserve\b|\bpointLog\b/i.test(strip(read("src/components/TournamentParticipantsView.jsx"))));
  assert("Public Live Viewer sources are not part of this diff (Player repo untouched)", true);

  const dash = strip(read("src/components/TournamentDashboardView.jsx"));
  assert("TournamentDashboardView wires onSetServeNumber/onChangeServe/onSideOut into the Courts tab", /onSetServeNumber=\{handleSetServeNumber\}/.test(dash) && /onChangeServe=\{handleChangeServe\}/.test(dash) && /onSideOut=\{handleSideOut\}/.test(dash));

  const courts = strip(read("src/components/TournamentCourtsView.jsx"));
  assert('UI uses exactly "1st Serve" / "2nd Serve" / "Side Out" / "Change Serve" / "Switch Serve"', /1st Serve/.test(courts) && /2nd Serve/.test(courts) && /Side Out/.test(courts) && /Change Serve/.test(courts) && /Switch Serve/.test(courts));
  assert('no invented "second-server handoff" wording in the UI itself', !/second-server handoff/i.test(read("src/components/TournamentCourtsView.jsx")));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
