// Cancel Live Match — automated, headless, logic-layer coverage. Calls the
// real pure function directly (cancelLiveMatch, src/lib/queueManagement.js)
// — no synthetic reimplementation.
//
// Usage: node scripts/verify-cancel-live-match.mjs
import { cancelLiveMatch } from "../src/lib/queueManagement.js";
import { emptyCourt } from "../src/lib/constants.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeState(overrides = {}) {
  const liveCourt = { ...emptyCourt(1), status: "live", teamA: ["p1", "p2"], teamB: ["p3", "p4"] };
  return {
    courts: [liveCourt, emptyCourt(2)],
    players: {
      p1: { id: "p1", name: "Juan", games: 2, wins: 1, losses: 1, streak: 1, lossStreak: 0 },
      p2: { id: "p2", name: "Maria", games: 2, wins: 1, losses: 1, streak: 1, lossStreak: 0 },
      p3: { id: "p3", name: "Pedro", games: 2, wins: 1, losses: 1, streak: 0, lossStreak: 1 },
      p4: { id: "p4", name: "Ana", games: 2, wins: 1, losses: 1, streak: 0, lossStreak: 1 },
    },
    queueIds: ["p5"],
    nextMatchups: [],
    matchHistory: [{ round: 1, court: 1 }],
    queueActivityLog: [],
    ...overrides,
  };
}

console.log("\nCancel a live match — frees the court");
{
  const state = makeState();
  const next = cancelLiveMatch(state, 1);
  const court = next.courts.find((c) => c.number === 1);
  assert("status back to open", court.status === "open");
  assert("teamA cleared", court.teamA.length === 0);
  assert("teamB cleared", court.teamB.length === 0);
  assert("scoreA reset", court.scoreA === 0);
  assert("scoreB reset", court.scoreB === 0);
  assert("assignmentMode reset to automatic", court.assignmentMode === "automatic");
  assert("manualLocked reset", court.manualLocked === false);
  assert("dispatchedAt reset", court.dispatchedAt === null);
  assert("awaitingPair reset", court.awaitingPair === false);
}

console.log("\nCancel a live match — players return to the FRONT of the queue");
{
  const state = makeState();
  const next = cancelLiveMatch(state, 1);
  assert("all 4 players are back in queueIds", ["p1", "p2", "p3", "p4"].every((id) => next.queueIds.includes(id)));
  assert("the 4 returning players are ahead of whoever was already waiting (p5)", next.queueIds.indexOf("p1") < next.queueIds.indexOf("p5"));
  assert("p5 (already waiting) is still in the queue, untouched", next.queueIds.includes("p5"));
}

console.log("\nCancel a live match — same pairing reinserted at the FRONT of Next Matchups (\"put on next queue\")");
{
  const state = makeState({ nextMatchups: [{ id: "existing", teamA: ["x1", "x2"], teamB: ["x3", "x4"] }] });
  const next = cancelLiveMatch(state, 1);
  assert("a new matchup was added", next.nextMatchups.length === 2);
  assert("the cancelled match's pairing is FIRST", JSON.stringify(next.nextMatchups[0].teamA) === JSON.stringify(["p1", "p2"]) && JSON.stringify(next.nextMatchups[0].teamB) === JSON.stringify(["p3", "p4"]));
  assert("the pre-existing next matchup is preserved, now second", next.nextMatchups[1].id === "existing");
  assert("the reinserted matchup is an ordinary one (not held/locked)", !next.nextMatchups[0].held && !next.nextMatchups[0].locked);
}

console.log("\nCancel a live match — no result is recorded (games/wins/losses/streaks/matchHistory untouched)");
{
  const state = makeState();
  const next = cancelLiveMatch(state, 1);
  ["p1", "p2", "p3", "p4"].forEach((id) => {
    assert(`${id}'s games untouched`, next.players[id].games === state.players[id].games);
    assert(`${id}'s wins untouched`, next.players[id].wins === state.players[id].wins);
    assert(`${id}'s losses untouched`, next.players[id].losses === state.players[id].losses);
    assert(`${id}'s streak untouched`, next.players[id].streak === state.players[id].streak);
    assert(`${id}'s lossStreak untouched`, next.players[id].lossStreak === state.players[id].lossStreak);
  });
  assert("matchHistory untouched (same reference)", next.matchHistory === state.matchHistory);
}

console.log("\nCancel a live match — court number and custom name (Court Renaming) are preserved");
{
  let state = makeState();
  state.courts[0] = { ...state.courts[0], name: "Center Court" };
  const next = cancelLiveMatch(state, 1);
  const court = next.courts.find((c) => c.number === 1);
  assert("number preserved", court.number === 1);
  assert("custom name preserved", court.name === "Center Court");
}

console.log("\nCancel a live match — a dispatching (not yet scored) court can also be cancelled");
{
  let state = makeState();
  state.courts[0] = { ...state.courts[0], status: "dispatching", dispatchedAt: Date.now() };
  const next = cancelLiveMatch(state, 1);
  assert("status back to open", next.courts.find((c) => c.number === 1).status === "open");
  assert("both players returned to queueIds", next.queueIds.includes("p1") && next.queueIds.includes("p3"));
}

console.log("\nCancel a live match — logs a Queue Activity Log entry");
{
  const state = makeState();
  const next = cancelLiveMatch(state, 1);
  assert("a new queueActivityLog entry was added", next.queueActivityLog.length === 1);
  const entry = next.queueActivityLog[0];
  assert("entry kind is liveMatchCancelled", entry.kind === "liveMatchCancelled");
  assert("entry names the court", entry.courtNumber === 1);
  assert("entry records both teams' names", JSON.stringify(entry.teamA) === JSON.stringify(["Juan", "Maria"]) && JSON.stringify(entry.teamB) === JSON.stringify(["Pedro", "Ana"]));
  assert("entry has a reason", typeof entry.reason === "string" && entry.reason.length > 0);
}

console.log("\nGuard: no-op for an already-open court");
{
  const state = makeState();
  assert("returns the exact same state reference", cancelLiveMatch(state, 2) === state);
}

console.log("\nGuard: no-op for a nonexistent court number");
{
  const state = makeState();
  assert("returns the exact same state reference", cancelLiveMatch(state, 99) === state);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
