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
import { holdMatch, resumeMatch } from "../src/lib/queueManagement.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayers(count) {
  const players = {};
  for (let i = 0; i < count; i++) {
    const id = `p${i}`;
    // Alternating beginner/intermediate — sections that only ever hand-build
    // matchup objects directly (bypassing the engine) don't care about this
    // field, but the Regression Verification sections below actually call
    // refreshNextMatchups -> BalancedRotationEngine, which needs a
    // recognized skill value to build any team at all (in the real app every
    // player always has skill "beginner" or "intermediate" — see
    // PickleballOpenPlay.jsx's player creation — so this just matches
    // reality, it was simply never exercised by this file before).
    players[id] = { id, name: `Player${i}`, skill: i % 2 === 0 ? "beginner" : "intermediate", held: false, status: "ACTIVE" };
  }
  return players;
}

// Simulates exactly one PickleballOpenPlay.jsx save() cycle: cap-aware
// refreshNextMatchups (lib/utils.js), then dispatchAvailableCourts
// (lib/courtDispatch.js) — the real pipeline, not a simplified stand-in.
// Used by the regression-verification sections below to reproduce
// multi-step facilitator flows (players trickling in across several
// save()s, a match ending, hold/resume) exactly as the real app would
// process them.
function simulateSaveCycle(state, rotationMode = "continuous") {
  const engine = getRotationEngine(rotationMode);
  const cap = maxUpcomingMatchups(state.courts);
  const nextMatchups = refreshNextMatchups(state.queueIds, state.players, state.nextMatchups || [], engine, null, cap);
  const result = dispatchAvailableCourts({
    courts: state.courts,
    nextMatchups,
    queueIds: state.queueIds,
    players: state.players,
    autoFillCourts: state.autoFillCourts !== false,
    isCourtReserved: () => false,
  });
  return {
    players: state.players,
    courts: result.courts,
    nextMatchups: result.nextMatchups,
    queueIds: result.queueIds,
    dispatched: result.dispatched,
  };
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

console.log("\n12. Regression Verification scenario 1 — Two Courts, 8 players checked in at once");
{
  const players = makePlayers(8);
  const state = simulateSaveCycle({
    courts: [emptyCourt(1), emptyCourt(2)],
    players,
    queueIds: Object.keys(players),
    nextMatchups: [],
  });
  assert("both courts are automatically dispatched", state.dispatched.length === 2);
  assert("no court stays open", state.courts.every((c) => c.status === "dispatching"));
  assert("no unnecessary upcoming matches remain", state.nextMatchups.length === 0);
  assert("no players stranded in the queue", state.queueIds.length === 0);
}

console.log("\n13. Regression Verification scenario 2 — Three Courts, 12 players checked in at once");
{
  const players = makePlayers(12);
  const state = simulateSaveCycle({
    courts: [emptyCourt(1), emptyCourt(2), emptyCourt(3)],
    players,
    queueIds: Object.keys(players),
    nextMatchups: [],
  });
  assert("all three courts are automatically dispatched", state.dispatched.length === 3);
  assert("every dispatched entry carries resolved team names (feeds both the voice announcement and the Queue Activity Log entry — see PickleballOpenPlay.jsx's save())", (
    state.dispatched.every((d) => d.teamANames.length === 2 && d.teamBNames.length === 2 && d.courtNumber)
  ));
  assert("no unnecessary upcoming matches or stranded players remain", state.nextMatchups.length === 0 && state.queueIds.length === 0);
  // Note: the actual queueActivityLog write and the audible Web Speech API
  // announcement both happen in PickleballOpenPlay.jsx's save()/
  // scheduleAnnouncements — browser-only side effects not exercised here.
  // Verified live in the browser pass (see TESTING.md).
}

console.log("\n14. Regression Verification scenario 3 — Three Courts, Staggered Check-in");
console.log("  (already covered in full by section 11 above — the exact bug-fix regression test)");

console.log("\n15. Regression Verification scenario 4 — Four Courts, 16 players checked in at once");
{
  const players = makePlayers(16);
  const state = simulateSaveCycle({
    courts: [1, 2, 3, 4].map((n) => emptyCourt(n)),
    players,
    queueIds: Object.keys(players),
    nextMatchups: [],
  });
  assert("all four courts are automatically dispatched", state.dispatched.length === 4);
  assert("no open automatic court remains", state.courts.every((c) => c.status === "dispatching"));
  assert("no stranded players or leftover matchups", state.queueIds.length === 0 && state.nextMatchups.length === 0);
}

console.log("\n16. Regression Verification scenario 5 — Steady-State Behavior (one match finishes)");
{
  // 4 courts, all already occupied (steady state) — 4 extra players are
  // already waiting, forming one "spare" matchup already sitting in
  // nextMatchups (exactly the Sprint 2 steady-state guarantee: a court
  // finishing should have a match ready immediately).
  const onCourtPlayers = makePlayers(16); // p0..p15, 4 per live court
  const sparePlayers = {};
  for (let i = 16; i < 20; i++) sparePlayers[`p${i}`] = { id: `p${i}`, name: `Player${i}`, skill: i % 2 === 0 ? "beginner" : "intermediate", held: false, status: "ACTIVE" };
  const players = { ...onCourtPlayers, ...sparePlayers };

  let courts = [
    { ...emptyCourt(1), status: "live", teamA: ["p0", "p1"], teamB: ["p2", "p3"] },
    { ...emptyCourt(2), status: "live", teamA: ["p4", "p5"], teamB: ["p6", "p7"] },
    { ...emptyCourt(3), status: "live", teamA: ["p8", "p9"], teamB: ["p10", "p11"] },
    { ...emptyCourt(4), status: "live", teamA: ["p12", "p13"], teamB: ["p14", "p15"] },
  ];
  let queueIds = ["p16", "p17", "p18", "p19"]; // the 4 waiting "spare" players
  let nextMatchups = [];

  // Establish steady state first: cap for 4 occupied/0 open = Live Courts − 1 = 3,
  // but only 4 players are waiting so exactly 1 spare matchup gets built.
  let state = simulateSaveCycle({ courts, players, queueIds, nextMatchups });
  courts = state.courts; nextMatchups = state.nextMatchups; queueIds = state.queueIds;
  assert("steady state established: one spare matchup ready, no court touched (all still live)", (
    nextMatchups.length === 1 && courts.every((c) => c.status === "live") && state.dispatched.length === 0
  ));

  // Now: Court 1's match finishes — it becomes open, its 4 players requeue.
  courts = courts.map((c, i) => (i === 0 ? { ...emptyCourt(1) } : c));
  queueIds = [...queueIds, "p0", "p1", "p2", "p3"];
  const afterFinish = simulateSaveCycle({ courts, players, queueIds, nextMatchups });

  assert("only the freed court (Court 1) is automatically dispatched", (
    afterFinish.dispatched.length === 1 && afterFinish.dispatched[0].courtNumber === 1
  ));
  assert("the other 3 live courts are completely unchanged", (
    afterFinish.courts[1].status === "live" && afterFinish.courts[1].teamA.join(",") === "p4,p5" &&
    afterFinish.courts[2].status === "live" && afterFinish.courts[2].teamA.join(",") === "p8,p9" &&
    afterFinish.courts[3].status === "live" && afterFinish.courts[3].teamA.join(",") === "p12,p13"
  ));
  assert("the Upcoming Match Queue refilled automatically — not left empty", afterFinish.nextMatchups.length >= 1);
  assert("no duplicate/unnecessary dispatch — exactly one court, one dispatch entry", afterFinish.dispatched.length === 1);
}

console.log("\n17. Regression Verification scenario 6 — Held Match Behavior");
{
  const players = makePlayers(8);
  const matchupA = { id: "A", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }; // first upcoming matchup
  const matchupB = { id: "B", teamA: ["p4", "p5"], teamB: ["p6", "p7"] };
  let queueState = { nextMatchups: [matchupA, matchupB], queueActivityLog: [] };

  // Step 1: Hold the first upcoming matchup (A).
  queueState = holdMatch(queueState, "A");
  assert("A is held; array order unchanged (A still first, B still second)", (
    queueState.nextMatchups[0].id === "A" && queueState.nextMatchups[0].held === true &&
    queueState.nextMatchups[1].id === "B" && !queueState.nextMatchups[1].held
  ));

  // Step 2: A live match finishes elsewhere, freeing one court.
  const courtsAfterFirstFinish = [emptyCourt(1), { ...emptyCourt(2), status: "live", teamA: ["x0", "x1"], teamB: ["x2", "x3"] }];
  const dispatch1 = dispatchAvailableCourts({
    courts: courtsAfterFirstFinish,
    nextMatchups: queueState.nextMatchups,
    queueIds: [],
    players,
    autoFillCourts: true,
    isCourtReserved: () => false,
  });
  assert("the held matchup (A) is skipped", dispatch1.dispatched[0].matchupId === "B");
  assert("the next eligible matchup (B) is dispatched instead", dispatch1.courts[0].teamA.join(",") === "p4,p5");
  assert("the held matchup (A) retains its original priority — still present, still held, untouched", (
    dispatch1.nextMatchups.length === 1 && dispatch1.nextMatchups[0].id === "A" && dispatch1.nextMatchups[0].held === true &&
    dispatch1.nextMatchups[0].teamA.join(",") === "p0,p1" && dispatch1.nextMatchups[0].teamB.join(",") === "p2,p3"
  ));

  // Step 3: Resume the held matchup (A).
  queueState = resumeMatch({ ...queueState, nextMatchups: dispatch1.nextMatchups }, "A");
  assert("A is resumed (no longer held) and keeps its position — not sent to the back", (
    queueState.nextMatchups.length === 1 && queueState.nextMatchups[0].id === "A" && !queueState.nextMatchups[0].held
  ));

  // Step 4: Meanwhile a newer matchup C gets built (simulating more players
  // checking in later) and appended — refreshNextMatchups always appends
  // new matchups to the END, never in front of existing ones.
  const matchupC = { id: "C", teamA: ["p10", "p11"], teamB: ["p12", "p13"] };
  const nextMatchupsWithC = [...queueState.nextMatchups, matchupC];

  // Step 5: Another live match finishes, freeing a second court.
  const courtsAfterSecondFinish = [emptyCourt(3), dispatch1.courts[0], dispatch1.courts[1]];
  const morePlayers = { ...players, p10: { id: "p10", name: "Player10", held: false, status: "ACTIVE" }, p11: { id: "p11", name: "Player11", held: false, status: "ACTIVE" }, p12: { id: "p12", name: "Player12", held: false, status: "ACTIVE" }, p13: { id: "p13", name: "Player13", held: false, status: "ACTIVE" } };
  const dispatch2 = dispatchAvailableCourts({
    courts: courtsAfterSecondFinish,
    nextMatchups: nextMatchupsWithC,
    queueIds: [],
    players: morePlayers,
    autoFillCourts: true,
    isCourtReserved: () => false,
  });
  assert("the resumed matchup (A) is dispatched before the newer matchup (C)", dispatch2.dispatched[0].matchupId === "A");
  assert("pairings remain exactly as originally generated — no regeneration/re-pairing", (
    dispatch2.dispatched[0].teamA.join(",") === "p0,p1" && dispatch2.dispatched[0].teamB.join(",") === "p2,p3"
  ));
  assert("queue order preserved — C is still waiting, untouched", (
    dispatch2.nextMatchups.length === 1 && dispatch2.nextMatchups[0].id === "C"
  ));
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
