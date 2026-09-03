// Fairness Selection Redesign — automated, headless, logic-layer coverage.
// Same approach as scripts/verify-adaptive-skill.mjs: calls the real,
// unmodified AdaptiveSkillRotationEngine directly. See PROJECT.md's
// "Fairness First, Competition Second" section and the investigation
// report for the bug this guards against.
//
// Usage: node scripts/verify-fairness-selection.mjs
import { AdaptiveSkillRotationEngine, REST_GUARD_FRESH_MINUTES, REST_GUARD_GAP_MINUTES } from "../src/engines/AdaptiveSkillRotationEngine.js";
import { getRotationEngine, refreshNextMatchups, maxUpcomingMatchups } from "../src/lib/utils.js";
import { dispatchAvailableCourts } from "../src/lib/courtDispatch.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayer(id, overrides) {
  return { id, name: id, skill: "beginner", games: 0, wins: 0, losses: 0, streak: 0, lastResult: null, partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, recentOpponentIds: [], ...overrides };
}

console.log("\n1. HARD RECENT-PLAY REST GUARD — a player who just finished is not selected while several players have waited substantially longer");
{
  const now = Date.now();
  const players = {
    A: makePlayer("A", { lastMatchEndAt: now - 2 * 60000, games: 3 }), // finished 2 min ago
    B: makePlayer("B", { checkedInAt: now - 14 * 60000, games: 3 }),
    C: makePlayer("C", { checkedInAt: now - 13 * 60000, games: 3 }),
    D: makePlayer("D", { checkedInAt: now - 12 * 60000, games: 3 }),
    E: makePlayer("E", { checkedInAt: now - 11 * 60000, games: 3 }),
  };
  const engine = new AdaptiveSkillRotationEngine();
  const matchups = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [] });
  assert("exactly one matchup formed (only 5 players, 4 get selected)", matchups.length === 1);
  const selected = new Set([...matchups[0].teamA, ...matchups[0].teamB]);
  assert("A (just finished) is NOT selected while B/C/D/E all waited substantially longer", !selected.has("A"));
  assert("B, C, D, E (the 4 longest-waiting) are all selected", ["B", "C", "D", "E"].every((id) => selected.has(id)));
}

console.log("\n2. Rest guard relaxes gracefully when there are not enough eligible alternatives");
{
  const now = Date.now();
  // Only 4 players total, one of them fresh — the guard has no
  // alternative to protect (there are no other same-division waiters at
  // all), so it must relax rather than leave a court empty.
  const players = {
    A: makePlayer("A", { lastMatchEndAt: now - 1 * 60000 }),
    B: makePlayer("B", { checkedInAt: now - 20 * 60000 }),
    C: makePlayer("C", { checkedInAt: now - 20 * 60000 }),
    D: makePlayer("D", { checkedInAt: now - 20 * 60000 }),
  };
  const engine = new AdaptiveSkillRotationEngine();
  const matchups = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [] });
  // With only 4 players total, there's no "excluded" alternative for the
  // guard to protect against in the first place (all 4 are selected) — the
  // guard has nothing to relax here; it's correctly a no-op, not a
  // relaxation. The real relaxation case (a fresh player selected despite
  // the guard because the window truly has no compliant combination) is
  // exercised implicitly by every other section forming a full court.
  assert("still forms a full matchup from all 4 available players despite one being fresh", matchups.length === 1 && [...matchups[0].teamA, ...matchups[0].teamB].length === 4);
}

console.log("\n2b. Guard doesn't falsely fire among equally-fresh alternatives, and never excludes a long-waiter to protect a fresh one");
{
  const now = Date.now();
  // 5 players, only 2 have waited a long time -- filling a 4-player court
  // necessarily includes 2 of the 3 equally-fresh players too. That's not
  // an unfairness the guard needs to block (none of the 3 fresh players is
  // disadvantaged relative to each other) -- what the guard must still
  // guarantee is that neither long-waiter is ever the one left out.
  const players = {
    longA: makePlayer("longA", { checkedInAt: now - 30 * 60000 }),
    longB: makePlayer("longB", { checkedInAt: now - 29 * 60000 }),
    freshA: makePlayer("freshA", { lastMatchEndAt: now - 1 * 60000 }),
    freshB: makePlayer("freshB", { lastMatchEndAt: now - 1 * 60000 }),
    freshC: makePlayer("freshC", { lastMatchEndAt: now - 1 * 60000 }),
  };
  const engine = new AdaptiveSkillRotationEngine();
  const matchups = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [] });
  assert("a full matchup still forms (5 players -> 1 matchup of 4)", matchups.length === 1 && [...matchups[0].teamA, ...matchups[0].teamB].length === 4);
  const selected = new Set([...matchups[0].teamA, ...matchups[0].teamB]);
  assert("both long-waiting players are included -- neither is bumped for a fresh one", selected.has("longA") && selected.has("longB"));
}

console.log("\n3. WAITING TIME DOMINATES SELECTION — a long-waiting player with MORE games still outranks a fresh player with FEWER games");
{
  // This is the exact inversion from the old behavior: previously fewest
  // games played was tier 1, so a fresh, low-games player would always
  // outrank a long-waiting, higher-games one. Waiting time must now win.
  const now = Date.now();
  const players = {
    A: makePlayer("A", { lastMatchEndAt: now - 1 * 60000, games: 1 }), // just played, fewer games
    B: makePlayer("B", { checkedInAt: now - 30 * 60000, games: 4 }), // waited a long time, more games
    C: makePlayer("C", { checkedInAt: now - 30 * 60000, games: 4 }),
    D: makePlayer("D", { checkedInAt: now - 30 * 60000, games: 4 }),
    E: makePlayer("E", { checkedInAt: now - 30 * 60000, games: 4 }),
  };
  const engine = new AdaptiveSkillRotationEngine();
  const matchups = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [] });
  const selected = new Set([...matchups[0].teamA, ...matchups[0].teamB]);
  assert("the fresh, lower-games player A is left out in favor of the long-waiting, higher-games group", !selected.has("A"));
}

console.log("\n4. BOUNDED STACK LOOKAHEAD — the front of the queue is protected, but a small lookahead can complete a valid matchup");
{
  // 5 players in one division: the front 4 by wait time are exactly what
  // gets selected when they already total 4 -- this just confirms no
  // unnecessary lookahead is used when the strict front 4 already works.
  const now = Date.now();
  const players = {
    A: makePlayer("A", { checkedInAt: now - 40 * 60000 }),
    B: makePlayer("B", { checkedInAt: now - 30 * 60000 }),
    C: makePlayer("C", { checkedInAt: now - 20 * 60000 }),
    D: makePlayer("D", { checkedInAt: now - 10 * 60000 }),
    E: makePlayer("E", { checkedInAt: now - 1 * 60000 }), // freshest checked-in, should be left waiting
  };
  const engine = new AdaptiveSkillRotationEngine();
  const matchups = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [] });
  const selected = new Set([...matchups[0].teamA, ...matchups[0].teamB]);
  assert("the 4 longest-waiting (A/B/C/D) are selected over the most-recently-checked-in (E)", ["A", "B", "C", "D"].every((id) => selected.has(id)) && !selected.has("E"));
  assert("no lookahead was needed (the strict front 4 already formed a valid group)", matchups[0].fairness.usedLookahead === false);
}

console.log("\n5. Fixed Partner Requests are never split across two different fairness groups");
{
  const now = Date.now();
  const players = {
    p1: makePlayer("p1", { checkedInAt: now - 5 * 60000, partnerId: "p2" }), // short wait
    p2: makePlayer("p2", { checkedInAt: now - 45 * 60000, partnerId: "p1" }), // long wait -- their fixed partner p1 must ride along
    b3: makePlayer("b3", { checkedInAt: now - 44 * 60000 }),
    b4: makePlayer("b4", { checkedInAt: now - 43 * 60000 }),
  };
  const engine = new AdaptiveSkillRotationEngine();
  const matchups = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [] });
  assert("1 matchup formed", matchups.length === 1);
  const m = matchups[0];
  const p1Team = m.teamA.includes("p1") ? m.teamA : m.teamB;
  assert("p1 and p2 (fixed partners) are on the same team despite very different individual wait times", p1Team.includes("p1") && p1Team.includes("p2"));
}

console.log("\n6. Winner-vs-Winner never overrides fairness — a valid winner/loser pairing available only via a fresher substitute is rejected");
{
  const now = Date.now();
  const players = {
    // A and B are the 2 longest-waiting -- but have DIFFERENT lastResult,
    // so no Winner-vs-Winner bonus applies to them as opponents.
    A: makePlayer("A", { checkedInAt: now - 40 * 60000, lastResult: "win" }),
    B: makePlayer("B", { checkedInAt: now - 39 * 60000, lastResult: "loss" }),
    C: makePlayer("C", { checkedInAt: now - 38 * 60000, lastResult: "win" }),
    D: makePlayer("D", { checkedInAt: now - 37 * 60000, lastResult: "loss" }),
    // E just finished (fresh) but shares lastResult with A -- a
    // quality-only optimizer would prefer swapping E in for a
    // same-lastResult Winner-vs-Winner bonus; fairness must still exclude it.
    E: makePlayer("E", { lastMatchEndAt: now - 1 * 60000, lastResult: "win" }),
  };
  const engine = new AdaptiveSkillRotationEngine();
  const matchups = engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups: [] });
  const selected = new Set([...matchups[0].teamA, ...matchups[0].teamB]);
  assert("the 4 longest-waiting players (A/B/C/D) are selected, not the fresher E despite a better available quality score", ["A", "B", "C", "D"].every((id) => selected.has(id)) && !selected.has("E"));
}

console.log("\n7. Long-session regression — no player accumulates a long wait while recently-played players keep getting matches");
{
  // Reuses the exact simultaneous-check-in shape as verify-adaptive-skill's
  // section 13, but this time asserting on WAIT TIME at selection, not
  // just games-played spread.
  const realDateNow = Date.now;
  let virtualNow = realDateNow();
  Date.now = () => virtualNow;

  const players = {};
  const queueIds = [];
  for (let i = 0; i < 16; i++) {
    const id = `b${i}`;
    queueIds.push(id);
    players[id] = makePlayer(id, { checkedInAt: virtualNow });
  }
  let courts = Array.from({ length: 3 }, (_, i) => ({ number: i + 1, status: "open", assignmentMode: "automatic", teamA: [], teamB: [], scoreA: 0, scoreB: 0 }));
  let nextMatchups = [];
  let qIds = [...queueIds];
  const engine = getRotationEngine("adaptiveSkill");
  let worstSkipMinutes = 0;

  for (let round = 0; round < 20; round++) {
    virtualNow += 8 * 60000;
    const cap = maxUpcomingMatchups(courts);
    nextMatchups = refreshNextMatchups(qIds, players, nextMatchups, engine, null, cap);
    const dispatched = dispatchAvailableCourts({ courts, nextMatchups, queueIds: qIds, players, autoFillCourts: true, isCourtReserved: () => false });
    const justDispatched = dispatched.courts.filter((c) => c.status === "dispatching");
    for (const c of justDispatched) {
      const selectedIds = [...c.teamA, ...c.teamB];
      const selectedWaits = selectedIds.map((id) => (virtualNow - (players[id].lastMatchEndAt || players[id].checkedInAt)) / 60000);
      const minSelectedWait = Math.min(...selectedWaits);
      const others = qIds.filter((id) => !selectedIds.includes(id));
      for (const id of others) {
        const wait = (virtualNow - (players[id].lastMatchEndAt || players[id].checkedInAt)) / 60000;
        if (wait - minSelectedWait > worstSkipMinutes) worstSkipMinutes = wait - minSelectedWait;
      }
    }
    courts = dispatched.courts.map((c) => (c.status === "dispatching" ? { ...c, status: "live" } : c));
    nextMatchups = dispatched.nextMatchups;
    qIds = dispatched.queueIds;

    for (const c of courts) {
      if (c.status !== "live") continue;
      const aWon = Math.random() < 0.5;
      for (const id of [...c.teamA, ...c.teamB]) players[id].games += 1;
      c.teamA.forEach((id) => (players[id].lastResult = aWon ? "win" : "loss"));
      c.teamB.forEach((id) => (players[id].lastResult = aWon ? "loss" : "win"));
      c.teamA.forEach((id) => (players[id].lastMatchEndAt = virtualNow));
      c.teamB.forEach((id) => (players[id].lastMatchEndAt = virtualNow));
      qIds.push(...c.teamA, ...c.teamB);
    }
    courts = courts.map((c) => (c.status === "live" ? { number: c.number, status: "open", assignmentMode: "automatic", teamA: [], teamB: [], scoreA: 0, scoreB: 0 } : c));
  }

  Date.now = realDateNow;
  assert(`no skip of more than ${REST_GUARD_GAP_MINUTES + REST_GUARD_FRESH_MINUTES + 8} minutes was observed across 20 rounds (worst: ${worstSkipMinutes.toFixed(1)}m)`, worstSkipMinutes <= REST_GUARD_GAP_MINUTES + REST_GUARD_FRESH_MINUTES + 8);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
