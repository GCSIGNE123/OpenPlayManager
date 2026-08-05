// Court Renaming — automated, headless, logic-layer coverage. Calls the
// real pure functions directly (renameCourt, courtDisplayName from
// src/lib/utils.js; buildAnnouncementText from src/lib/announcer.js) — no
// synthetic reimplementation.
//
// Usage: node scripts/verify-court-renaming.mjs
import { renameCourt, courtDisplayName } from "../src/lib/utils.js";
import { buildAnnouncementText } from "../src/lib/announcer.js";
import { emptyCourt } from "../src/lib/constants.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeState(overrides = {}) {
  return {
    courts: [emptyCourt(1), emptyCourt(2), emptyCourt(3)],
    ...overrides,
  };
}

console.log("\ncourtDisplayName — defaults to Court {number} when unnamed");
{
  assert("court 1 with no name", courtDisplayName(emptyCourt(1)) === "Court 1");
  assert("court 7 with no name", courtDisplayName(emptyCourt(7)) === "Court 7");
}

console.log("\nrenameCourt — sets a custom name, found by number");
{
  const state = makeState();
  const next = renameCourt(state, 2, "Center Court");
  assert("court 2 now has the custom name", next.courts.find((c) => c.number === 2).name === "Center Court");
  assert("court 1 is untouched", next.courts.find((c) => c.number === 1).name === null);
  assert("court 3 is untouched", next.courts.find((c) => c.number === 3).name === null);
  assert("courtDisplayName reflects the custom name", courtDisplayName(next.courts.find((c) => c.number === 2)) === "Center Court");
}

console.log("\nrenameCourt — court number/status/teams are never touched");
{
  let state = makeState();
  state.courts[1] = { ...state.courts[1], status: "live", teamA: ["p1", "p2"], teamB: ["p3", "p4"] };
  const next = renameCourt(state, 2, "Show Court");
  const court = next.courts.find((c) => c.number === 2);
  assert("number unchanged", court.number === 2);
  assert("status unchanged", court.status === "live");
  assert("teamA unchanged", JSON.stringify(court.teamA) === JSON.stringify(["p1", "p2"]));
  assert("teamB unchanged", JSON.stringify(court.teamB) === JSON.stringify(["p3", "p4"]));
}

console.log("\nrenameCourt — a blank/whitespace name resets back to the default");
{
  let state = makeState();
  state = renameCourt(state, 1, "VIP Court");
  assert("has a custom name first", state.courts.find((c) => c.number === 1).name === "VIP Court");
  const next = renameCourt(state, 1, "   ");
  assert("blank input resets name back to null", next.courts.find((c) => c.number === 1).name === null);
  assert("courtDisplayName falls back to Court 1 again", courtDisplayName(next.courts.find((c) => c.number === 1)) === "Court 1");
}

console.log("\nrenameCourt — leading/trailing whitespace is trimmed");
{
  const state = makeState();
  const next = renameCourt(state, 1, "  Back Court  ");
  assert("name is trimmed", next.courts.find((c) => c.number === 1).name === "Back Court");
}

console.log("\nGuard: no-op for a nonexistent court number");
{
  const state = makeState();
  assert("returns the exact same state reference", renameCourt(state, 99, "Ghost Court") === state);
}

console.log("\nGuard: no-op when the name is already exactly this value (repeat save)");
{
  let state = makeState();
  state = renameCourt(state, 1, "Center Court");
  const next = renameCourt(state, 1, "Center Court");
  assert("returns the exact same state reference", next === state);
}

console.log("\nGuard: no-op when re-blanking an already-default (unnamed) court");
{
  const state = makeState();
  assert("returns the exact same state reference", renameCourt(state, 1, "") === state);
  assert("returns the exact same state reference (whitespace)", renameCourt(state, 1, "   ") === state);
}

console.log("\nbuildAnnouncementText — uses the custom court label when supplied");
{
  const text = buildAnnouncementText(3, ["John", "Mike"], ["Peter", "Carl"], "Center Court");
  assert("announcement uses the custom label, not the number", text === "Center Court. John and Mike, versus Peter and Carl. Please proceed to Center Court.");
}

console.log("\nbuildAnnouncementText — falls back to Court {number} when no label is given (backward-compatible)");
{
  const text = buildAnnouncementText(3, ["John", "Mike"], ["Peter", "Carl"]);
  assert("unchanged default announcement text", text === "Court 3. John and Mike, versus Peter and Carl. Please proceed to Court 3.");
}

console.log("\nScope Protection: renameCourt only ever touches the courts array's `name` field");
{
  let state = makeState({
    players: { p1: { id: "p1", skill: "beginner", games: 2 } },
    queueIds: ["p1"],
    nextMatchups: [{ id: "m1", teamA: ["p1"], teamB: [] }],
    matchHistory: [{ round: 1, court: 1 }],
  });
  const originalPlayers = state.players;
  const originalQueueIds = state.queueIds;
  const originalNextMatchups = state.nextMatchups;
  const originalMatchHistory = state.matchHistory;
  const next = renameCourt(state, 1, "Center Court");
  assert("players reference unchanged", next.players === originalPlayers);
  assert("queueIds reference unchanged", next.queueIds === originalQueueIds);
  assert("nextMatchups reference unchanged", next.nextMatchups === originalNextMatchups);
  assert("matchHistory reference unchanged", next.matchHistory === originalMatchHistory);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
