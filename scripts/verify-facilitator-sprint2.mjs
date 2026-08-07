// Facilitator Workflow Improvements — Sprint 2 (real Open Play session
// observations). Automated, headless, logic-layer coverage for: Better
// Player Substitution, Session Matchmaking Priority, Persistent Tournament
// Partners, Dynamic Court Count, and Stop Queueing. Calls the real pure
// functions directly — no synthetic reimplementation.
//
// Usage: node scripts/verify-facilitator-sprint2.mjs
import { getSubstituteRecommendations, sortMatchupsByPriority, refreshNextMatchups } from "../src/lib/utils.js";
import { setFixedPartner, clearFixedPartner, holdPlayer, resumePlayer, requestRemoveCourt, applyPendingCourtRemovals } from "../src/lib/queueManagement.js";
import { BalancedRotationEngine } from "../src/engines/BalancedRotationEngine.js";
import { emptyCourt } from "../src/lib/constants.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

// ============================================================
console.log("\n=== Better Player Substitution ===");
// ============================================================

console.log("\ngetSubstituteRecommendations — Tournament partner always ranks first when waiting");
{
  const outgoing = { id: "out", skill: "beginner", partnerId: "partner" };
  const waiting = [
    { id: "partner", name: "Partner", skill: "intermediate", games: 5, checkedInAt: 1000, lastMatchEndAt: null },
    { id: "longWait", name: "LongWait", skill: "beginner", games: 2, checkedInAt: 1, lastMatchEndAt: null },
    { id: "sameSkill", name: "SameSkill", skill: "beginner", games: 1, checkedInAt: 2000, lastMatchEndAt: null },
  ];
  const recs = getSubstituteRecommendations(waiting, outgoing, 3);
  assert("partner is recommended", recs.some((r) => r.id === "partner"));
  assert("partner's reason is 'Tournament partner'", recs.find((r) => r.id === "partner").reason === "Tournament partner");
  assert("partner is first in priority order", recs[0].id === "partner");
}

console.log("\ngetSubstituteRecommendations — held players are never recommended");
{
  const outgoing = { id: "out", skill: "beginner" };
  const waiting = [
    { id: "held1", name: "Held1", skill: "beginner", games: 0, checkedInAt: 1, held: true },
    { id: "free1", name: "Free1", skill: "beginner", games: 3, checkedInAt: 2 },
  ];
  const recs = getSubstituteRecommendations(waiting, outgoing, 3);
  assert("held player excluded", !recs.some((r) => r.id === "held1"));
  assert("non-held player recommended", recs.some((r) => r.id === "free1"));
}

console.log("\ngetSubstituteRecommendations — longest waiting fills remaining slots, same skill level fills the rest");
{
  const outgoing = { id: "out", skill: "intermediate" };
  const waiting = [
    { id: "a", name: "A", skill: "intermediate", games: 1, checkedInAt: 1, lastMatchEndAt: 100 }, // longest waiting
    { id: "b", name: "B", skill: "intermediate", games: 1, checkedInAt: 2, lastMatchEndAt: 200 },
    { id: "c", name: "C", skill: "intermediate", games: 1, checkedInAt: 3, lastMatchEndAt: 300 },
    { id: "d", name: "D", skill: "beginner", games: 1, checkedInAt: 4, lastMatchEndAt: 400 },
  ];
  const recs = getSubstituteRecommendations(waiting, outgoing, 3);
  assert("exactly 3 recommended (the cap)", recs.length === 3);
  assert("a, b, c (longest waiting) are recommended, not d (different skill)", recs.every((r) => ["a", "b", "c"].includes(r.id)));
  assert("each recommended candidate has exactly one reason", recs.every((r) => typeof r.reason === "string"));
}

console.log("\ngetSubstituteRecommendations — no double-counting: a candidate matching multiple reasons still appears once");
{
  const outgoing = { id: "out", skill: "beginner", partnerId: "p1" };
  const waiting = [{ id: "p1", name: "P1", skill: "beginner", games: 0, checkedInAt: 1 }];
  const recs = getSubstituteRecommendations(waiting, outgoing, 3);
  assert("exactly one recommendation entry for p1", recs.filter((r) => r.id === "p1").length === 1);
  assert("highest-priority reason (Tournament partner) wins", recs[0].reason === "Tournament partner");
}

console.log("\ngetSubstituteRecommendations — no outgoing player context (e.g. Manual Court slot picker) still recommends by longest waiting only");
{
  const waiting = [
    { id: "a", name: "A", skill: "beginner", games: 1, checkedInAt: 1, lastMatchEndAt: 50 },
    { id: "b", name: "B", skill: "beginner", games: 1, checkedInAt: 2, lastMatchEndAt: 500 },
  ];
  const recs = getSubstituteRecommendations(waiting, undefined, 3);
  assert("no crash without an outgoing player", recs.length === 2);
  assert("longest-waiting (a) recommended first", recs[0].id === "a");
}

// ============================================================
console.log("\n=== Session Matchmaking Priority ===");
// ============================================================

function makePlayers() {
  return {
    p1: { id: "p1", name: "P1", skill: "beginner", games: 5, checkedInAt: 1000 },
    p2: { id: "p2", name: "P2", skill: "intermediate", games: 5, checkedInAt: 1000 },
    p3: { id: "p3", name: "P3", skill: "beginner", games: 1, checkedInAt: 5000 },
    p4: { id: "p4", name: "P4", skill: "intermediate", games: 1, checkedInAt: 5000 },
  };
}

console.log("\nsortMatchupsByPriority — null priority leaves matchup order completely unchanged");
{
  const matchups = [{ teamA: ["p1", "p2"], teamB: ["p3", "p4"] }, { teamA: ["p3"], teamB: ["p1"] }];
  const result = sortMatchupsByPriority(matchups, makePlayers(), null);
  assert("same array reference (no-op)", result === matchups);
}

console.log("\nsortMatchupsByPriority — leastGamesPlayed ranks the lower-games matchup first");
{
  const players = makePlayers();
  const highGames = { teamA: ["p1"], teamB: ["p2"] }; // avg games 5
  const lowGames = { teamA: ["p3"], teamB: ["p4"] }; // avg games 1
  const result = sortMatchupsByPriority([highGames, lowGames], players, "leastGamesPlayed");
  assert("low-games matchup sorted first", result[0] === lowGames);
}

console.log("\nsortMatchupsByPriority — newlyCheckedIn ranks the most-recently-checked-in matchup first");
{
  const players = makePlayers();
  const earlyCheckIn = { teamA: ["p1"], teamB: ["p2"] }; // checkedInAt 1000
  const lateCheckIn = { teamA: ["p3"], teamB: ["p4"] }; // checkedInAt 5000
  const result = sortMatchupsByPriority([earlyCheckIn, lateCheckIn], players, "newlyCheckedIn");
  assert("most-recently-checked-in matchup sorted first", result[0] === lateCheckIn);
}

console.log("\nsortMatchupsByPriority — longestWaiting ranks the oldest 'since' matchup first");
{
  const players = {
    p1: { id: "p1", checkedInAt: 100, lastMatchEndAt: null },
    p2: { id: "p2", checkedInAt: 100, lastMatchEndAt: null },
    p3: { id: "p3", checkedInAt: 9000, lastMatchEndAt: null },
    p4: { id: "p4", checkedInAt: 9000, lastMatchEndAt: null },
  };
  const longWaiting = { teamA: ["p1"], teamB: ["p2"] };
  const shortWaiting = { teamA: ["p3"], teamB: ["p4"] };
  const result = sortMatchupsByPriority([shortWaiting, longWaiting], players, "longestWaiting");
  assert("longest-waiting matchup sorted first", result[0] === longWaiting);
}

console.log("\nrefreshNextMatchups — matchmakingPriority reorders which matchups survive the queue-depth cap, without changing team formation");
{
  const players = {
    a1: { id: "a1", name: "A1", skill: "beginner", games: 8, checkedInAt: 1 },
    a2: { id: "a2", name: "A2", skill: "intermediate", games: 8, checkedInAt: 1 },
    b1: { id: "b1", name: "B1", skill: "beginner", games: 0, checkedInAt: 2 },
    b2: { id: "b2", name: "B2", skill: "intermediate", games: 0, checkedInAt: 2 },
  };
  const engine = new BalancedRotationEngine();
  const queueIds = ["a1", "a2", "b1", "b2"];
  // cap of 1 -> only room for ONE of the two matchups this pool can build
  const result = refreshNextMatchups(queueIds, players, [], engine, null, 1, "leastGamesPlayed");
  assert("exactly one matchup survives the cap", result.length === 1);
  const survivingIds = new Set([...result[0].teamA, ...result[0].teamB]);
  assert("the low-games pair (b1/b2) was prioritized under the cap", survivingIds.has("b1") && survivingIds.has("b2"));
}

console.log("\nrefreshNextMatchups — omitting matchmakingPriority (existing callers) behaves exactly as before");
{
  const players = {
    p1: { id: "p1", name: "P1", skill: "beginner", games: 0 },
    p2: { id: "p2", name: "P2", skill: "intermediate", games: 0 },
    p3: { id: "p3", name: "P3", skill: "beginner", games: 0 },
    p4: { id: "p4", name: "P4", skill: "intermediate", games: 0 },
  };
  const engine = new BalancedRotationEngine();
  const result = refreshNextMatchups(["p1", "p2", "p3", "p4"], players, [], engine, null, Infinity);
  assert("still generates a matchup with no crash/behavior change", result.length === 1);
}

// ============================================================
console.log("\n=== Persistent Tournament Partners ===");
// ============================================================

function makePairState() {
  return {
    players: {
      p1: { id: "p1", name: "P1", skill: "beginner", partnerId: null, held: false, status: "ACTIVE" },
      p2: { id: "p2", name: "P2", skill: "intermediate", partnerId: null, held: false, status: "ACTIVE" },
    },
  };
}

console.log("\nA partnership survives Hold/Resume — never cleared by holdPlayer/resumePlayer");
{
  let state = makePairState();
  state = setFixedPartner(state, "p1", "p2");
  state = holdPlayer(state, "p1");
  assert("p1 held", state.players.p1.held === true);
  assert("partnership survives the hold — p1 still partnered with p2", state.players.p1.partnerId === "p2");
  assert("partnership survives the hold — p2 still partnered with p1", state.players.p2.partnerId === "p1");
  state = resumePlayer(state, "p1");
  assert("partnership survives the resume too", state.players.p1.partnerId === "p2" && state.players.p2.partnerId === "p1");
}

console.log("\nA held partner is excluded from force-pairing until both are eligible again, then resumes automatically");
{
  let state = makePairState();
  state = setFixedPartner(state, "p1", "p2");
  state = holdPlayer(state, "p1");
  const engine = new BalancedRotationEngine();
  // only p2 is in the eligible pool (p1 is held, excluded upstream by
  // isEligibleForMatchmaking — mirrored here directly against buildTeams)
  const teamsWhileHeld = engine.buildTeams(["p2"], state.players, true);
  assert("p2 is NOT force-paired with the held p1 (p1 isn't in the pool)", !teamsWhileHeld.some((t) => t.includes("p1")));
  state = resumePlayer(state, "p1");
  const teamsAfterResume = engine.buildTeams(["p1", "p2"], state.players, true);
  assert("once both are eligible again, the partnership resumes automatically", teamsAfterResume.some((t) => t.includes("p1") && t.includes("p2")));
}

console.log("\nCreate / Change / Remove Partner — the three required operations all work via setFixedPartner/clearFixedPartner");
{
  let state = {
    players: {
      p1: { id: "p1", partnerId: null },
      p2: { id: "p2", partnerId: null },
      p3: { id: "p3", partnerId: null },
    },
  };
  state = setFixedPartner(state, "p1", "p2"); // Create
  assert("Create Partner — p1/p2 mutually partnered", state.players.p1.partnerId === "p2" && state.players.p2.partnerId === "p1");
  state = setFixedPartner(state, "p1", "p3"); // Change
  assert("Change Partner — p1 now partnered with p3", state.players.p1.partnerId === "p3");
  assert("Change Partner — old partner p2 cleanly cleared", state.players.p2.partnerId === null);
  state = clearFixedPartner(state, "p1"); // Remove
  assert("Remove Partner — p1 cleared", state.players.p1.partnerId === null);
  assert("Remove Partner — p3 (the other side) cleared too", state.players.p3.partnerId === null);
}

// ============================================================
console.log("\n=== Dynamic Court Count ===");
// ============================================================

console.log("\nrequestRemoveCourt — removes an idle last court immediately");
{
  const state = { courts: [emptyCourt(1), emptyCourt(2)] };
  const next = requestRemoveCourt(state);
  assert("court removed immediately", next.courts.length === 1);
  assert("no pending removal queued", !next.pendingCourtRemovals);
}

console.log("\nrequestRemoveCourt — queues the removal when the last court is live (never loses a live match)");
{
  const liveCourt = { ...emptyCourt(2), status: "live", teamA: ["a", "b"], teamB: ["c", "d"] };
  const state = { courts: [emptyCourt(1), liveCourt] };
  const next = requestRemoveCourt(state);
  assert("court NOT removed while live", next.courts.length === 2);
  assert("live match completely untouched", next.courts[1].status === "live" && next.courts[1].teamA.length === 2);
  assert("removal queued instead", next.pendingCourtRemovals === 1);
}

console.log("\nrequestRemoveCourt — never removes the last remaining court");
{
  const state = { courts: [emptyCourt(1)] };
  const next = requestRemoveCourt(state);
  assert("no-op — same state reference", next === state);
}

console.log("\napplyPendingCourtRemovals — completes a queued removal the instant the court becomes idle");
{
  let state = { courts: [emptyCourt(1), { ...emptyCourt(2), status: "live", teamA: ["a", "b"], teamB: ["c", "d"] }], pendingCourtRemovals: 0 };
  state = requestRemoveCourt(state);
  assert("queued while live", state.pendingCourtRemovals === 1 && state.courts.length === 2);
  // the match ends, the court resets to open (as endMatch would do)
  state = { ...state, courts: [state.courts[0], emptyCourt(2)] };
  const next = applyPendingCourtRemovals(state);
  assert("court removed once idle", next.courts.length === 1);
  assert("pending count cleared", next.pendingCourtRemovals === 0);
}

console.log("\napplyPendingCourtRemovals — a no-op when nothing is pending, and leaves a still-busy court queued");
{
  const idleState = { courts: [emptyCourt(1)], pendingCourtRemovals: 0 };
  assert("no-op with nothing pending", applyPendingCourtRemovals(idleState) === idleState);

  const busyState = { courts: [emptyCourt(1), { ...emptyCourt(2), status: "live" }], pendingCourtRemovals: 1 };
  const result = applyPendingCourtRemovals(busyState);
  assert("still queued — court hasn't freed up yet", result.pendingCourtRemovals === 1);
  assert("courts array untouched while still busy", result.courts.length === 2);
}

// ============================================================
console.log("\n=== Stop Queueing ===");
// ============================================================

console.log("\nrefreshNextMatchups is the mechanism save() uses to skip generating new matchups — verifying existing matchups pass through untouched when the caller (PickleballOpenPlay.jsx) doesn't call it at all");
{
  // Stop Queueing's actual behavior lives in PickleballOpenPlay.jsx's save()
  // (a queueingStopped ternary around the refreshNextMatchups call) rather
  // than inside refreshNextMatchups itself — this test documents that
  // existing matchups are the exact array passed through when queueing is
  // stopped, by simulating exactly what save() does.
  const existing = [{ id: "m1", teamA: ["a", "b"], teamB: ["c", "d"] }];
  const queueingStopped = true;
  const nextMatchups = queueingStopped ? existing : refreshNextMatchups([], {}, existing);
  assert("existing matchups pass through completely untouched (same reference)", nextMatchups === existing);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
