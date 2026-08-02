// Smart Court Dispatch — automated, headless, logic-layer coverage.
//
// Same approach as the other verify-*.mjs scripts: calls the real pure
// functions directly (src/lib/courtDispatch.js, src/lib/announcer.js's
// buildAnnouncementText) — no synthetic reimplementation. Voice synthesis
// itself (window.speechSynthesis) and the CustomEvent bus are browser-only
// side effects that can't run in Node — those are covered by code review
// and manual verification instead, same as prior sprints' documented
// limitation for anything requiring a real browser.
//
// Usage: node scripts/verify-court-dispatch.mjs
import { emptyCourt } from "../src/lib/constants.js";
import {
  isDispatchEligible,
  selectNextDispatchableMatchup,
  dispatchAvailableCourts,
  confirmCourtLive,
  logDispatchEvent,
} from "../src/lib/courtDispatch.js";
import { buildAnnouncementText } from "../src/lib/announcer.js";
import { maxUpcomingMatchups, refreshNextMatchups, getRotationEngine } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayers(count) {
  const players = {};
  for (let i = 0; i < count; i++) {
    const id = `p${i}`;
    players[id] = { id, name: `Player${i}`, held: false, status: "ACTIVE" };
  }
  return players;
}

console.log("\n1. Dispatch Safety — isDispatchEligible");
{
  const players = makePlayers(4);
  const complete = { teamA: ["p0", "p1"], teamB: ["p2", "p3"] };
  assert("a complete, unheld matchup with all-eligible players is eligible", isDispatchEligible(complete, players));
  assert("a held matchup is never eligible", !isDispatchEligible({ ...complete, held: true }, players));
  assert("an incomplete matchup (3 players) is never eligible", !isDispatchEligible({ teamA: ["p0", "p1"], teamB: ["p2"] }, players));

  const withHeldPlayer = { ...players, p1: { ...players.p1, held: true } };
  assert("a matchup containing a held player is never eligible", !isDispatchEligible(complete, withHeldPlayer));

  const withCheckedOut = { ...players, p2: { ...players.p2, status: "CHECKED_OUT" } };
  assert("a matchup containing a checked-out player is never eligible", !isDispatchEligible(complete, withCheckedOut));

  assert("null/undefined matchup is never eligible", !isDispatchEligible(null, players));
}

console.log("\n2. selectNextDispatchableMatchup — queue priority preserved");
{
  const players = makePlayers(12);
  const matchups = [
    { id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"], held: true },
    { id: "m2", teamA: ["p4", "p5"], teamB: ["p6", "p7"] },
    { id: "m3", teamA: ["p8", "p9"], teamB: ["p10", "p11"] },
  ];
  const { matchup, rest } = selectNextDispatchableMatchup(matchups, players);
  assert("held m1 is skipped; m2 (frontmost eligible) is selected", matchup.id === "m2");
  assert("m1 and m3 remain, in their original relative order", rest.map((m) => m.id).join(",") === "m1,m3");

  const noneEligible = selectNextDispatchableMatchup([{ id: "onlyHeld", teamA: ["p0", "p1"], teamB: ["p2", "p3"], held: true }], players);
  assert("no eligible matchup -> matchup is null, rest unchanged", noneEligible.matchup === null && noneEligible.rest.length === 1);
}

console.log("\n3. dispatchAvailableCourts — automatic dispatch when a court becomes available");
{
  const players = makePlayers(8);
  const courts = [emptyCourt(1), { ...emptyCourt(2), status: "live", teamA: ["x"], teamB: ["y"] }];
  const nextMatchups = [{ id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }];
  const queueIds = ["p0", "p1", "p2", "p3", "p4", "p5"];
  const result = dispatchAvailableCourts({ courts, nextMatchups, queueIds, players, autoFillCourts: true, isCourtReserved: () => false });
  assert("the open court (Court 1) is dispatched", result.courts[0].status === "dispatching");
  assert("the already-live court (Court 2) is untouched", result.courts[1].status === "live" && result.courts[1].teamA.join() === "x");
  assert("dispatched court has the matchup's teams assigned", result.courts[0].teamA.join(",") === "p0,p1" && result.courts[0].teamB.join(",") === "p2,p3");
  assert("dispatched matchup removed from nextMatchups", result.nextMatchups.length === 0);
  assert("dispatched players removed from queueIds", !result.queueIds.includes("p0") && result.queueIds.includes("p4"));
  assert("exactly one dispatch event recorded", result.dispatched.length === 1 && result.dispatched[0].courtNumber === 1);
  assert("dispatch event includes resolved team names", result.dispatched[0].teamANames.join(",") === "Player0,Player1");
}

console.log("\n4. Dispatch Safety inside dispatchAvailableCourts — held matches, held players, checked-out players all skipped");
{
  const players = makePlayers(8);
  players.p2.held = true; // held player inside m1
  players.p5.status = "CHECKED_OUT"; // checked-out player inside m2
  const courts = [emptyCourt(1)];
  const nextMatchups = [
    { id: "m0", teamA: ["p0"], teamB: ["p1"], held: true }, // held MATCH
    { id: "m1", teamA: ["p2", "p3"], teamB: ["p4"], held: false }, // contains held player p2 (also incomplete, but test the held-player path explicitly below)
    { id: "m2", teamA: ["p4", "p5"], teamB: ["p6", "p7"] }, // contains checked-out player p5
    { id: "m3", teamA: ["p0", "p3"], teamB: ["p6", "p7"] }, // fully eligible
  ];
  const queueIds = Object.keys(players);
  const result = dispatchAvailableCourts({ courts, nextMatchups, queueIds, players, autoFillCourts: true, isCourtReserved: () => false });
  assert("the only fully-eligible matchup (m3) is the one dispatched, skipping m0/m1/m2", result.dispatched[0].matchupId === "m3");
  assert("held match (m0), held-player match (m1), and checked-out-player match (m2) all remain in nextMatchups untouched", (
    result.nextMatchups.some((m) => m.id === "m0") &&
    result.nextMatchups.some((m) => m.id === "m1") &&
    result.nextMatchups.some((m) => m.id === "m2")
  ));
}

console.log("\n5. Auto-fill Courts OFF disables automatic dispatch entirely");
{
  const players = makePlayers(4);
  const courts = [emptyCourt(1)];
  const nextMatchups = [{ id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }];
  const result = dispatchAvailableCourts({ courts, nextMatchups, queueIds: Object.keys(players), players, autoFillCourts: false, isCourtReserved: () => false });
  assert("courts/nextMatchups/queueIds are returned completely unchanged", (
    result.courts[0].status === "open" &&
    result.nextMatchups.length === 1 &&
    result.dispatched.length === 0
  ));
}

console.log("\n6. Never dispatch to a manual or reserved court; leave court open if nothing eligible");
{
  const players = makePlayers(4);
  const manualCourt = { ...emptyCourt(1), assignmentMode: "manual" };
  const reservedCourt = emptyCourt(2);
  const openCourt = emptyCourt(3);
  const nextMatchups = [{ id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }];
  const result = dispatchAvailableCourts({
    courts: [manualCourt, reservedCourt, openCourt],
    nextMatchups,
    queueIds: Object.keys(players),
    players,
    autoFillCourts: true,
    isCourtReserved: (n) => n === 2,
  });
  assert("manual court untouched", result.courts[0].status === "open" && result.courts[0].teamA.length === 0);
  assert("reserved court untouched", result.courts[1].status === "open" && result.courts[1].teamA.length === 0);
  assert("the one dispatchable court gets it", result.courts[2].status === "dispatching");

  const noneEligibleResult = dispatchAvailableCourts({
    courts: [emptyCourt(1)],
    nextMatchups: [],
    queueIds: [],
    players: {},
    autoFillCourts: true,
    isCourtReserved: () => false,
  });
  assert("no eligible matchup -> court stays open, nothing created", noneEligibleResult.courts[0].status === "open");
}

console.log("\n7. confirmCourtLive — Dispatch Confirmation (dispatching -> live)");
{
  const state = { courts: [{ ...emptyCourt(1), status: "dispatching", teamA: ["a", "b"], teamB: ["c", "d"] }, emptyCourt(2)] };
  const confirmed = confirmCourtLive(state, 1);
  assert("targeted dispatching court becomes live", confirmed.courts[0].status === "live");
  assert("team assignment is untouched by confirming", confirmed.courts[0].teamA.join(",") === "a,b");
  assert("other courts untouched", confirmed.courts[1].status === "open");

  const noop = confirmCourtLive(confirmed, 1);
  assert("confirming an already-live court is a no-op (still live, doesn't error)", noop.courts[0].status === "live");

  const noopMissing = confirmCourtLive(state, 99);
  assert("confirming a nonexistent court number is a harmless no-op", noopMissing.courts.length === 2);
}

console.log("\n8. Queue Activity Log records dispatch/announcement events with court number + player names");
{
  const state = { queueActivityLog: [] };
  const logged = logDispatchEvent(state, {
    kind: "courtDispatched",
    courtNumber: 3,
    teamANames: ["John", "Mike"],
    teamBNames: ["Peter", "Carl"],
    reason: "Court automatically dispatched",
  });
  assert("one entry recorded", logged.queueActivityLog.length === 1);
  const entry = logged.queueActivityLog[0];
  assert("entry includes kind, courtNumber, team names, reason, and a timestamp", (
    entry.kind === "courtDispatched" &&
    entry.courtNumber === 3 &&
    entry.teamA.join(",") === "John,Mike" &&
    entry.teamB.join(",") === "Peter,Carl" &&
    entry.reason === "Court automatically dispatched" &&
    typeof entry.timestamp === "number"
  ));

  const repeated = logDispatchEvent(logged, {
    kind: "announcementRepeated",
    courtNumber: 3,
    teamANames: ["John", "Mike"],
    teamBNames: ["Peter", "Carl"],
    reason: "Voice announcement repeated",
  });
  assert("multiple events accumulate, newest first", repeated.queueActivityLog[0].kind === "announcementRepeated" && repeated.queueActivityLog.length === 2);
}

console.log("\n9. buildAnnouncementText — pure announcement text (voice synthesis itself is browser-only, not testable in Node)");
{
  const text = buildAnnouncementText(3, ["John", "Mike"], ["Peter", "Carl"]);
  assert("announcement mentions the court number, both teams, and the proceed instruction", (
    text.includes("Court 3") &&
    text.includes("John and Mike") &&
    text.includes("Peter and Carl") &&
    text.includes("Please proceed to Court 3")
  ));
}

console.log("\n10. Manual dispatch reuses the exact same selection logic as automatic dispatch");
{
  // This is the same function PickleballOpenPlay.jsx's fillCourt/
  // fillAllCourts/generateRemainingCourts now call directly — verifying it
  // behaves identically whether invoked "manually" (a single call) or as
  // part of dispatchAvailableCourts's scan confirms there's only one
  // definition of "what's next," not two diverging code paths.
  const players = makePlayers(8);
  players.p1.held = true;
  const matchups = [
    { id: "bad", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }, // contains held player
    { id: "good", teamA: ["p4", "p5"], teamB: ["p6", "p7"] },
  ];
  const manual = selectNextDispatchableMatchup(matchups, players);
  const auto = dispatchAvailableCourts({
    courts: [emptyCourt(1)],
    nextMatchups: matchups,
    queueIds: Object.keys(players),
    players,
    autoFillCourts: true,
    isCourtReserved: () => false,
  });
  assert("manual selection picks 'good', skipping 'bad'", manual.matchup.id === "good");
  assert("automatic dispatch picks the identical matchup", auto.dispatched[0].matchupId === "good");
}

console.log("\n11. Bug fix regression — 3 open automatic courts all get populated, not just Court 1");
{
  // Reproduces the reported bug end to end: maxUpcomingMatchups +
  // refreshNextMatchups (lib/utils.js) feeding dispatchAvailableCourts
  // (lib/courtDispatch.js) — the exact real save() pipeline, not a
  // simplified stand-in. Previously, dispatching Court 1 alone bumped
  // occupiedCount to 1, which collapsed the queue-depth cap to 0 for every
  // later save() — so Courts 2 and 3 could never receive a matchup no
  // matter how many more players checked in. This exercises that same
  // "players trickle in one save() at a time" sequence.
  const players = {};
  for (let i = 0; i < 12; i++) {
    const id = `p${i}`;
    players[id] = { id, name: `Player${i}`, skill: "beginner", games: 0, held: false, status: "ACTIVE" };
  }
  const engine = getRotationEngine("continuous");
  let courts = [emptyCourt(1), emptyCourt(2), emptyCourt(3)];
  let nextMatchups = [];
  let queueIds = [];

  // Simulate the real save() pipeline for a batch of players checking in,
  // one save() per batch (mirroring one save() per action in the real app).
  function saveWithPlayers(checkedInIds) {
    queueIds = checkedInIds;
    const cap = maxUpcomingMatchups(courts);
    nextMatchups = refreshNextMatchups(queueIds, players, nextMatchups, engine, null, cap);
    const result = dispatchAvailableCourts({
      courts,
      nextMatchups,
      queueIds,
      players,
      autoFillCourts: true,
      isCourtReserved: () => false,
    });
    courts = result.courts;
    nextMatchups = result.nextMatchups;
    queueIds = result.queueIds;
    return result.dispatched;
  }

  // 4 players check in first — only enough for one matchup.
  const firstDispatch = saveWithPlayers(["p0", "p1", "p2", "p3"]);
  assert("first save(): exactly Court 1 dispatched (only 4 players so far)", (
    firstDispatch.length === 1 && firstDispatch[0].courtNumber === 1
  ));
  assert("Courts 2 and 3 still open after the first save()", courts[1].status === "open" && courts[2].status === "open");

  // The remaining 8 players check in on a LATER save() — Court 1 is now
  // occupied ("dispatching"), so this is exactly the previously-broken
  // scenario.
  const secondDispatch = saveWithPlayers([...queueIds, "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"]);
  assert("second save(): both remaining open courts (2 and 3) get dispatched", (
    secondDispatch.length === 2 &&
    secondDispatch.some((d) => d.courtNumber === 2) &&
    secondDispatch.some((d) => d.courtNumber === 3)
  ));
  assert("all 3 courts are now dispatching/live — none left open", courts.every((c) => c.status === "dispatching"));
  assert("all 12 players (exactly 3 courts' worth) consumed — none stranded in the queue", queueIds.length === 0 && nextMatchups.length === 0);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
