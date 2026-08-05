// Court Name Persistence — BUG FIX regression test. See PROJECT.md/
// FEATURES.md: custom court names were silently reverting to "Court N"
// the moment a match on that court ended, because every court-reset path
// used a plain `emptyCourt(court.number)` (which always starts `name` at
// null) instead of preserving whatever name the court already had. Calls
// the real functions directly (resetCourtForNextMatch/courtDisplayName
// from src/lib/constants.js and src/lib/utils.js; resolveWinnerPoolMatch
// from src/lib/winnerPoolRound.js; dispatchAvailableCourts/logDispatchEvent
// from src/lib/courtDispatch.js; buildAnnouncementText from
// src/lib/announcer.js) — no synthetic reimplementation.
//
// Usage: node scripts/verify-court-name-persistence.mjs
import { emptyCourt, resetCourtForNextMatch } from "../src/lib/constants.js";
import { courtDisplayName } from "../src/lib/utils.js";
import { resolveWinnerPoolMatch } from "../src/lib/winnerPoolRound.js";
import { dispatchAvailableCourts, logDispatchEvent } from "../src/lib/courtDispatch.js";
import { buildAnnouncementText } from "../src/lib/announcer.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

console.log("\nA. resetCourtForNextMatch preserves a custom name across an end-of-match reset");
{
  const finishedCourt = { ...emptyCourt(1), name: "Center Court", status: "finished", teamA: ["p1", "p2"], teamB: ["p3", "p4"], scoreA: 11, scoreB: 7 };
  const reset = resetCourtForNextMatch(finishedCourt);
  assert("name survives the reset", reset.name === "Center Court");
  assert("status back to open", reset.status === "open");
  assert("teams cleared", reset.teamA.length === 0 && reset.teamB.length === 0);
  assert("score cleared", reset.scoreA === 0 && reset.scoreB === 0);
  assert("number unchanged", reset.number === 1);
  assert("courtDisplayName still resolves the custom name after reset", courtDisplayName(reset) === "Center Court");
}

console.log("\nB. resetCourtForNextMatch leaves an unnamed court's default display unchanged");
{
  const finishedCourt = { ...emptyCourt(2), status: "finished" };
  const reset = resetCourtForNextMatch(finishedCourt);
  assert("name stays null", reset.name === null);
  assert("courtDisplayName still falls back to Court 2", courtDisplayName(reset) === "Court 2");
}

console.log("\nC. Winner Pool Rotation — a named court's name survives pooling (odd court out, no partner)");
{
  const courts = [{ ...emptyCourt(5), name: "Show Court", status: "finished", teamA: ["p1", "p2"], teamB: ["p3", "p4"], scoreA: 11, scoreB: 9 }];
  const players = { p1: {}, p2: {}, p3: {}, p4: {} };
  const { courts: next } = resolveWinnerPoolMatch(courts, players, 0);
  assert("name survives (odd-court-out path)", next[0].name === "Show Court");
  assert("court is open again", next[0].status === "open");
}

console.log("\nC2. Winner Pool Rotation — both named courts in a pair survive pooling");
{
  const courts = [
    { ...emptyCourt(1), name: "Court A", status: "finished", teamA: ["p1", "p2"], teamB: ["p3", "p4"], scoreA: 11, scoreB: 5, awaitingPair: true },
    { ...emptyCourt(2), name: "Court B", status: "finished", teamA: ["p5", "p6"], teamB: ["p7", "p8"], scoreA: 11, scoreB: 3, awaitingPair: true },
  ];
  const players = { p1: {}, p2: {}, p3: {}, p4: {}, p5: {}, p6: {}, p7: {}, p8: {} };
  const { courts: next } = resolveWinnerPoolMatch(courts, players, 0);
  assert("court 1's name survives pooling", next[0].name === "Court A");
  assert("court 2's name survives pooling", next[1].name === "Court B");
  assert("both courts open again", next[0].status === "open" && next[1].status === "open");
}

console.log("\nD. Full round trip — named court finishes a match, then gets re-dispatched, name never changes");
{
  let court = { ...emptyCourt(3), name: "VIP Court", status: "finished", teamA: ["p1", "p2"], teamB: ["p3", "p4"], scoreA: 11, scoreB: 6 };
  court = resetCourtForNextMatch(court);
  assert("still VIP Court right after the reset", court.name === "VIP Court");

  const players = { p5: { held: false }, p6: { held: false }, p7: { held: false }, p8: { held: false } };
  const nextMatchups = [{ id: "m1", teamA: ["p5", "p6"], teamB: ["p7", "p8"] }];
  const result = dispatchAvailableCourts({
    courts: [court],
    nextMatchups,
    queueIds: ["p5", "p6", "p7", "p8"],
    players,
    autoFillCourts: true,
  });
  assert("court got dispatched to", result.courts[0].status === "dispatching");
  assert("name is STILL VIP Court after being redispatched", result.courts[0].name === "VIP Court");
  assert("courtDisplayName still resolves correctly post-dispatch", courtDisplayName(result.courts[0]) === "VIP Court");
}

console.log("\nE. Voice announcements use the custom name (Smart Court Dispatch AND manual/repeat)");
{
  const text = buildAnnouncementText(3, ["John", "Mike"], ["Peter", "Carl"], "VIP Court");
  assert("announcement text uses the custom name, not the number", text.includes("VIP Court") && !text.includes("Court 3"));
}

console.log("\nF. Queue Activity Log entries carry a frozen courtLabel, resolved at logging time");
{
  const court = { ...emptyCourt(4), name: "Back Court" };
  const state = { queueActivityLog: [] };
  const next = logDispatchEvent(state, {
    kind: "courtDispatched",
    courtNumber: 4,
    courtLabel: courtDisplayName(court),
    teamANames: ["John", "Mike"],
    teamBNames: ["Peter", "Carl"],
    reason: "Court automatically dispatched",
  });
  assert("logged entry carries the custom court label", next.queueActivityLog[0].courtLabel === "Back Court");
}

console.log("\nG. Queue Activity Log falls back gracefully for entries with no courtLabel (pre-fix data)");
{
  const state = { queueActivityLog: [] };
  const next = logDispatchEvent(state, { kind: "courtDispatched", courtNumber: 4, teamANames: [], teamBNames: [], reason: "x" });
  assert("courtLabel is null when not supplied", next.queueActivityLog[0].courtLabel === null);
}

console.log("\nH. A court's name is unaffected by any OTHER court finishing/resetting");
{
  const courts = [
    { ...emptyCourt(1), name: "Center Court" },
    { ...emptyCourt(2), name: "Show Court", status: "finished", teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
  ];
  const reset = courts.map((c, i) => (i === 1 ? resetCourtForNextMatch(c) : c));
  assert("court 1 (untouched) keeps its name", reset[0].name === "Center Court");
  assert("court 2 (reset) keeps its own name too", reset[1].name === "Show Court");
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
