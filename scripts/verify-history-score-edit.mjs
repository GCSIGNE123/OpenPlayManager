// Game History — score correction. Automated, headless, logic-layer
// coverage. Calls the real pure function directly (editMatchHistoryScore,
// src/lib/queueManagement.js) — no synthetic reimplementation.
//
// Usage: node scripts/verify-history-score-edit.mjs
import { editMatchHistoryScore } from "../src/lib/queueManagement.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayer(id, overrides = {}) {
  return { id, name: `Player ${id}`, games: 1, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, ...overrides };
}

function makeState() {
  const players = {
    a: makePlayer("a", { wins: 1, pointsFor: 11, pointsAgainst: 5 }),
    b: makePlayer("b", { wins: 1, pointsFor: 11, pointsAgainst: 5 }),
    c: makePlayer("c", { losses: 1, pointsFor: 5, pointsAgainst: 11 }),
    d: makePlayer("d", { losses: 1, pointsFor: 5, pointsAgainst: 11 }),
  };
  const matchHistory = [
    { round: 1, court: 1, teamA: ["a", "b"], teamB: ["c", "d"], winner: "A", scoreA: 11, scoreB: 5, endedAt: Date.now(), phase: null },
  ];
  return { players, matchHistory };
}

console.log("\nBasic score correction — same winner, numbers fixed");
{
  const state = makeState();
  const updated = editMatchHistoryScore(state, 1, 11, 7);
  assert("matchHistory score updated", updated.matchHistory[0].scoreA === 11 && updated.matchHistory[0].scoreB === 7);
  assert("winner unchanged", updated.matchHistory[0].winner === "A");
  assert("teamA player pointsFor adjusted by delta (0)", updated.players.a.pointsFor === 11);
  assert("teamA player pointsAgainst adjusted by delta (+2)", updated.players.a.pointsAgainst === 7);
  assert("teamB player pointsFor adjusted by delta (+2)", updated.players.c.pointsFor === 7);
  assert("teamB player pointsAgainst adjusted by delta (0)", updated.players.c.pointsAgainst === 11);
  assert("wins/losses untouched", updated.players.a.wins === 1 && updated.players.c.losses === 1);
}

console.log("\nRejects a winner-flipping edit");
{
  const state = makeState();
  let threw = false;
  try { editMatchHistoryScore(state, 1, 5, 11); } catch (e) { threw = true; assert("error message explains why", e.message.includes("can't change who won")); }
  assert("winner-flip edit is rejected", threw);
  // confirm nothing changed
  assert("original match untouched after rejected edit", state.matchHistory[0].scoreA === 11 && state.matchHistory[0].scoreB === 5);
}

console.log("\nRejects a tie edit (would remove the recorded winner)");
{
  const state = makeState();
  let threw = false;
  try { editMatchHistoryScore(state, 1, 8, 8); } catch (e) { threw = true; }
  assert("tie edit rejected when match had a real winner", threw);
}

console.log("\nRejects negative scores");
{
  const state = makeState();
  let threw = false;
  try { editMatchHistoryScore(state, 1, -1, 5); } catch (e) { threw = true; }
  assert("negative score rejected", threw);
}

console.log("\nMatch not found fails safely");
{
  const state = makeState();
  let threw = false;
  try { editMatchHistoryScore(state, 999, 11, 5); } catch (e) { threw = true; assert("clear reason given", e.message.includes("could no longer be found")); }
  assert("nonexistent round rejected", threw);
}

console.log("\nNo-op when the score is identical (avoids an unnecessary state change)");
{
  const state = makeState();
  const updated = editMatchHistoryScore(state, 1, 11, 5);
  assert("returns the exact same state reference", updated === state);
}

console.log("\nA player removed from the roster since the match doesn't break the edit");
{
  const state = makeState();
  delete state.players.d;
  const updated = editMatchHistoryScore(state, 1, 11, 9);
  assert("remaining teamB player (c) still gets the delta", updated.players.c.pointsFor === 9);
  assert("removed player (d) is simply absent, no crash", updated.players.d === undefined);
}

console.log("\nMultiple corrections compound correctly (delta applied against the CURRENT stored score each time)");
{
  let state = makeState();
  state = editMatchHistoryScore(state, 1, 11, 7);
  state = editMatchHistoryScore(state, 1, 11, 9);
  assert("final score reflects the latest edit", state.matchHistory[0].scoreA === 11 && state.matchHistory[0].scoreB === 9);
  assert("teamA pointsAgainst reflects the cumulative total (5 -> 7 -> 9, net +4)", state.players.a.pointsAgainst === 9);
  assert("teamB pointsFor reflects the same cumulative total", state.players.c.pointsFor === 9);
}

console.log("\nRegression — a Tie (winner: null) match can have its score corrected as long as it stays a tie");
{
  const state = makeState();
  state.matchHistory[0] = { ...state.matchHistory[0], winner: null, scoreA: 8, scoreB: 8 };
  const updated = editMatchHistoryScore(state, 1, 9, 9);
  assert("tie-to-tie correction allowed", updated.matchHistory[0].scoreA === 9 && updated.matchHistory[0].scoreB === 9);
  assert("winner stays null", updated.matchHistory[0].winner === null);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
