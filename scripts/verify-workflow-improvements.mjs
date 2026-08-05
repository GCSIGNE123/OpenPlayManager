// Facilitator Workflow Improvements (32-player session sprint) —
// automated, headless, logic-layer coverage for the pieces that aren't
// already covered by their own dedicated scripts (Court Name Persistence
// -> verify-court-name-persistence.mjs, Permanent Partner Mode ->
// verify-permanent-partner-mode.mjs). Calls the real pure functions
// directly (getRegisteredNotHere from src/lib/utils.js;
// computeSessionAnalyticsReport from src/lib/sessionAnalytics.js) — no
// synthetic reimplementation.
//
// Usage: node scripts/verify-workflow-improvements.mjs
import { getRegisteredNotHere } from "../src/lib/utils.js";
import { computeSessionAnalyticsReport } from "../src/lib/sessionAnalytics.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

console.log("\nAlphabetical Check-In ordering — A to Z by display name");
{
  const players = {
    p1: { id: "p1", name: "Zach", checkedIn: false },
    p2: { id: "p2", name: "Amy", checkedIn: false },
    p3: { id: "p3", name: "Mark", checkedIn: false },
    p4: { id: "p4", name: "Jofel", checkedIn: true }, // already checked in — must not appear
  };
  const list = getRegisteredNotHere(players);
  assert("returns exactly 3 not-yet-checked-in players", list.length === 3);
  assert("sorted A -> Z", list.map((p) => p.name).join(",") === "Amy,Mark,Zach");
  assert("checked-in player (Jofel) does not appear", !list.some((p) => p.name === "Jofel"));
}

console.log("\nAlphabetical Check-In ordering — updates automatically when a new player is added");
{
  const players = {
    p1: { id: "p1", name: "Mark", checkedIn: false },
    p2: { id: "p2", name: "Zach", checkedIn: false },
  };
  let list = getRegisteredNotHere(players);
  assert("starts as Mark, Zach", list.map((p) => p.name).join(",") === "Mark,Zach");

  // simulate a new walk-in being registered mid-session
  const withNewPlayer = { ...players, p3: { id: "p3", name: "Aaron", checkedIn: false } };
  list = getRegisteredNotHere(withNewPlayer);
  assert("re-sorts automatically to Aaron, Mark, Zach — no manual re-sort needed", list.map((p) => p.name).join(",") === "Aaron,Mark,Zach");
}

console.log("\nAlphabetical Check-In ordering — a player disappears from the list the instant they check in");
{
  const players = {
    p1: { id: "p1", name: "Amy", checkedIn: false },
    p2: { id: "p2", name: "Mark", checkedIn: false },
  };
  let list = getRegisteredNotHere(players);
  assert("both present before check-in", list.length === 2);

  const afterCheckIn = { ...players, p1: { ...players.p1, checkedIn: true } };
  list = getRegisteredNotHere(afterCheckIn);
  assert("Amy disappears once checked in, exactly as before this sprint", list.length === 1 && list[0].name === "Mark");
}

console.log("\nSession History / Session Review — the report includes Final Standings");
{
  const state = {
    venue: "Test Session",
    rotationMode: "balanced",
    courts: [{ number: 1 }],
    sessionStartedAt: Date.now() - 60 * 60000,
    players: {
      p1: { id: "p1", name: "Zach", games: 3, wins: 2, losses: 1, pointsFor: 33, pointsAgainst: 20, streak: 1, checkedIn: true },
      p2: { id: "p2", name: "Amy", games: 3, wins: 1, losses: 2, pointsFor: 20, pointsAgainst: 33, streak: 0, checkedIn: true },
      p3: { id: "p3", name: "NeverPlayed", games: 0, checkedIn: true },
    },
    skillChangeLog: [],
  };
  const report = computeSessionAnalyticsReport(state);
  assert("report has a finalStandings array", Array.isArray(report.finalStandings));
  assert("only players with at least one game are included (2, not the never-played one)", report.finalStandings.length === 2);
  assert("each row has the required Player/GP/W/L/+/-/RTG fields", report.finalStandings.every((p) => "playerName" in p && "gp" in p && "wins" in p && "losses" in p && "diff" in p && "rating" in p));
  const zach = report.finalStandings.find((p) => p.playerName === "Zach");
  assert("Zach's stats are correct", zach.gp === 3 && zach.wins === 2 && zach.losses === 1 && zach.diff === 13);
}

console.log("\nSession History / Session Review — the report includes per-player Payment information");
{
  const state = {
    venue: "Test Session",
    rotationMode: "balanced",
    courts: [{ number: 1 }],
    sessionStartedAt: Date.now() - 60 * 60000,
    players: {
      p1: { id: "p1", name: "Zach", games: 0, checkedIn: true, paymentStatus: "paid", paymentMethod: "cash" },
      p2: { id: "p2", name: "Amy", games: 0, checkedIn: true, paymentStatus: "paid", paymentMethod: "gcash" },
      p3: { id: "p3", name: "Mark", games: 0, checkedIn: true, paymentStatus: "unpaid", paymentMethod: null },
      p4: { id: "p4", name: "NotHere", games: 0, checkedIn: false, paymentStatus: "unpaid", paymentMethod: null },
    },
    skillChangeLog: [],
  };
  const report = computeSessionAnalyticsReport(state);
  assert("report has a paymentDetails array", Array.isArray(report.paymentDetails));
  assert("only checked-in players appear (3, not the not-yet-checked-in one)", report.paymentDetails.length === 3);
  assert("sorted alphabetically, same convention as the Check-In tab", report.paymentDetails.map((p) => p.playerName).join(",") === "Amy,Mark,Zach");
  const zach = report.paymentDetails.find((p) => p.playerName === "Zach");
  assert("who paid is correct (Zach, Cash)", zach.paymentStatus === "paid" && zach.paymentMethod === "cash");
  const amy = report.paymentDetails.find((p) => p.playerName === "Amy");
  assert("payment method is correct (Amy, GCash)", amy.paymentStatus === "paid" && amy.paymentMethod === "gcash");
  const mark = report.paymentDetails.find((p) => p.playerName === "Mark");
  assert("who remains unpaid is correct (Mark)", mark.paymentStatus === "unpaid" && mark.paymentMethod === null);
  assert("aggregate payment summary still present and consistent", report.payment.paid === 2 && report.payment.unpaid === 1);
}

console.log("\nSession Review is read-only data — the report is a plain snapshot, not a live/mutable reference");
{
  const state = {
    venue: "Test Session",
    rotationMode: "balanced",
    courts: [{ number: 1 }],
    sessionStartedAt: Date.now() - 60 * 60000,
    players: { p1: { id: "p1", name: "Zach", games: 1, wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 5, checkedIn: true, paymentStatus: "paid", paymentMethod: "cash" } },
    skillChangeLog: [],
  };
  const report1 = computeSessionAnalyticsReport(state);
  state.players.p1.games = 99; // mutate the SOURCE state after the report was generated
  const report1StillOld = report1.finalStandings[0].gp === 1;
  assert("a previously-generated report snapshot is unaffected by later mutations to the live state", report1StillOld);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
