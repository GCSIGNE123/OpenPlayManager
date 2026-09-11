// Open Play — Longest-Waiting-Time Matchmaking Priority.
//
// Automated, headless, logic-layer coverage — same approach as
// scripts/verify-fairness-selection.mjs: calls the real, unmodified
// BalancedRotationEngine + refreshNextMatchups + dispatchAvailableCourts
// directly. Guards the fix for the Wednesday ~28-player / 2-court session
// where players who had JUST finished were selected ahead of players who
// had been waiting far longer (Continuous mode -> BalancedRotationEngine,
// which previously had ZERO waiting-time awareness in team formation and
// only a no-op post-hoc matchup re-sort).
//
// Nothing here is hard-coded to 28 players or 2 courts — helpers take
// counts as parameters; the 28/2 case is one stress fixture among several.
//
// Usage: node scripts/verify-open-play-wait-priority.mjs

import {
  BalancedRotationEngine,
  REST_GUARD_FRESH_MINUTES,
  REST_GUARD_GAP_MINUTES,
  INTERMEDIATE_QUEUE_DISTANCE_MAX,
} from "../src/engines/BalancedRotationEngine.js";
import { refreshNextMatchups, sinceWaiting } from "../src/lib/utils.js";
import { dispatchAvailableCourts } from "../src/lib/courtDispatch.js";
import { emptyCourt } from "../src/lib/constants.js";

// Deterministic Math.random — BalancedRotationEngine's Stage 2 (buildTeams /
// buildMatchupsFromTeams) still shuffles internally to hedge greedy
// tie-breaks. Stage 1 SELECTION is deterministic given staggered wait
// times (no ties), so seeding here only makes Stage 2's team composition
// reproducible for the assertions that inspect it.
let _seed = 987654321;
Math.random = () => {
  _seed = (_seed * 1664525 + 1013904223) % 4294967296;
  return _seed / 4294967296;
};

let pass = 0;
let fail = 0;
const failures = [];
function assert(desc, cond) {
  if (cond) {
    pass += 1;
    console.log(`  ok ${desc}`);
  } else {
    fail += 1;
    failures.push(desc);
    console.log(`  FAIL: ${desc}`);
  }
}
function section(t) {
  console.log(`\n${t}`);
}

const NOW = Date.now();
const MIN = 60_000;

// A waiting player. `waitedMin` = minutes since they last became eligible.
// `playedRecently` true => that time is post-game rest (lastMatchEndAt);
// false => they have never played and it is time since check-in.
function player(id, waitedMin, { skill = "beginner", games = 0, playedRecently = false, partnerId = null } = {}) {
  const stamp = NOW - waitedMin * MIN;
  return {
    id,
    name: id,
    skill,
    games,
    wins: 0,
    losses: 0,
    streak: 0,
    lastResult: null,
    checkedIn: true,
    status: "ACTIVE",
    held: false,
    partnerId,
    partnerCounts: {},
    recentPartnerIds: [],
    opponentCounts: {},
    recentOpponentIds: [],
    lastOpponentIds: [],
    checkedInAt: playedRecently ? NOW - (waitedMin + 30) * MIN : stamp,
    lastMatchEndAt: playedRecently ? stamp : null,
  };
}

// Build a session-shaped pool. `spec` is [{ id, waitedMin, skill, games, playedRecently, partnerId }].
// queueIds is check-in order for never-played players, with recently-played
// appended to the back — exactly how PickleballOpenPlay.jsx maintains it.
function buildPool(spec) {
  const players = {};
  spec.forEach((s) => (players[s.id] = player(s.id, s.waitedMin, s)));
  const neverPlayed = spec.filter((s) => !s.playedRecently).map((s) => s.id);
  const playedRecently = spec.filter((s) => s.playedRecently).map((s) => s.id);
  const queueIds = [...neverPlayed, ...playedRecently];
  return { players, queueIds };
}

// Run the real matchmaking + dispatch path for `courtCount` courts.
function dispatchFor(pool, courtCount, priority = null) {
  const courts = Array.from({ length: courtCount }, (_, i) => ({ ...emptyCourt(i + 1), status: "open" }));
  // pre-session-start special case: maxUpcoming = one matchup per open court
  const nextMatchups = refreshNextMatchups(pool.queueIds, pool.players, [], new BalancedRotationEngine(), null, courtCount, priority);
  const res = dispatchAvailableCourts({
    courts,
    nextMatchups,
    queueIds: pool.queueIds,
    players: pool.players,
    autoFillCourts: true,
  });
  const dispatchedIds = new Set(res.dispatched.flatMap((d) => [...d.teamA, ...d.teamB]));
  return { nextMatchups, dispatched: res.dispatched, dispatchedIds };
}

function waitOrder(pool) {
  return [...pool.queueIds].sort((a, b) => sinceWaiting(pool.players[a]) - sinceWaiting(pool.players[b]));
}

// ====================================================================
section("SANITY — constants");
assert(`REST_GUARD_FRESH_MINUTES = ${REST_GUARD_FRESH_MINUTES}`, REST_GUARD_FRESH_MINUTES === 5);
assert(`REST_GUARD_GAP_MINUTES = ${REST_GUARD_GAP_MINUTES}`, REST_GUARD_GAP_MINUTES === 8);
assert(
  `INTERMEDIATE_QUEUE_DISTANCE_MAX = ${INTERMEDIATE_QUEUE_DISTANCE_MAX} ("1 or 2 waiting-list positions apart")`,
  INTERMEDIATE_QUEUE_DISTANCE_MAX === 2,
);

// ====================================================================
section("1. Longest-waiting player beats a recently-finished player");
{
  // A finished 1 min ago; B/C/D/E never played, waiting 20/18/16/14 min.
  const pool = buildPool([
    { id: "A", waitedMin: 1, playedRecently: true, games: 3 },
    { id: "B", waitedMin: 20 },
    { id: "C", waitedMin: 18 },
    { id: "D", waitedMin: 16 },
    { id: "E", waitedMin: 14 },
  ]);
  const { dispatchedIds } = dispatchFor(pool, 1);
  assert("A (just finished) is NOT dispatched", !dispatchedIds.has("A"));
  assert("B, C, D, E (the 4 longest-waiting) ARE dispatched", ["B", "C", "D", "E"].every((id) => dispatchedIds.has(id)));
}

// ====================================================================
section("2. Player who checked in earlier beats one who joined later (neither has played)");
{
  const pool = buildPool([
    { id: "early1", waitedMin: 40 },
    { id: "early2", waitedMin: 38 },
    { id: "early3", waitedMin: 36 },
    { id: "early4", waitedMin: 34 },
    { id: "late1", waitedMin: 5 },
    { id: "late2", waitedMin: 4 },
  ]);
  const { dispatchedIds } = dispatchFor(pool, 1);
  assert("the 4 earliest check-ins are dispatched", ["early1", "early2", "early3", "early4"].every((id) => dispatchedIds.has(id)));
  assert("the 2 latecomers are NOT dispatched", !dispatchedIds.has("late1") && !dispatchedIds.has("late2"));
}

// ====================================================================
section("3. 28-player-style queue on 2 courts — no repeated selection of recently-finished players while longer-waiting eligible players exist");
{
  // 24 never-played (waiting 60..14 min), 4 just finished (~1 min ago).
  // 5 intermediate among the 24 (positions 1..5 by wait).
  const spec = [];
  for (let i = 1; i <= 24; i++) {
    spec.push({ id: `W${i}`, waitedMin: 62 - i * 2, skill: i <= 5 ? "intermediate" : "beginner", games: 2 });
  }
  for (let i = 1; i <= 4; i++) spec.push({ id: `J${i}`, waitedMin: 1, playedRecently: true, games: 3 });
  const pool = buildPool(spec);
  const order = waitOrder(pool); // longest wait first

  const { dispatched, dispatchedIds } = dispatchFor(pool, 2);
  assert("exactly 2 courts dispatched (2 courts, plenty of players)", dispatched.length === 2);
  assert("NO just-finished player (J1..J4) is on a court", !["J1", "J2", "J3", "J4"].some((id) => dispatchedIds.has(id)));
  const top8 = order.slice(0, 8);
  assert("all 8 dispatched players are among the 8 longest-waiting", [...dispatchedIds].every((id) => top8.includes(id)));

  // repeated calls (simulate several rounds finishing) never pull a fresh
  // player up while longer-waiting players are still queued
  let sawFreshJump = false;
  const players = { ...pool.players };
  let queueIds = [...pool.queueIds];
  for (let round = 0; round < 4; round += 1) {
    const nm = refreshNextMatchups(queueIds, players, [], new BalancedRotationEngine(), null, 2, null);
    const picked = new Set(nm.flatMap((m) => [...m.teamA, ...m.teamB]));
    // anyone "fresh" picked while an eligible non-picked player waited >= 8 min longer?
    for (const id of picked) {
      const freshMin = (NOW - sinceWaiting(players[id])) / MIN;
      if (freshMin >= REST_GUARD_FRESH_MINUTES) continue;
      for (const other of queueIds) {
        if (picked.has(other)) continue;
        const otherMin = (NOW - sinceWaiting(players[other])) / MIN;
        if (otherMin >= freshMin + REST_GUARD_GAP_MINUTES) sawFreshJump = true;
      }
    }
    // "play" the 8 picked: reset their wait to now, send to back of queue
    for (const id of picked) {
      players[id] = { ...players[id], lastMatchEndAt: NOW, games: players[id].games + 1 };
    }
    queueIds = [...queueIds.filter((id) => !picked.has(id)), ...queueIds.filter((id) => picked.has(id))];
  }
  assert("across 4 simulated rounds, a fresh player never jumps ahead of a materially-longer-waiting eligible player", !sawFreshJump);
}

// ====================================================================
section("4. Intermediate scarcity does not let recent players jump ahead");
{
  // 2 intermediates (one just finished), 14 beginners waiting a long time.
  const spec = [
    { id: "intFresh", waitedMin: 1, skill: "intermediate", playedRecently: true, games: 4 },
    { id: "intWaiting", waitedMin: 9, skill: "intermediate" },
  ];
  for (let i = 1; i <= 14; i++) spec.push({ id: `beg${i}`, waitedMin: 30 - i, skill: "beginner" });
  const pool = buildPool(spec);
  const { dispatchedIds } = dispatchFor(pool, 2);
  assert("the just-finished intermediate is NOT pulled onto a court by scarcity", !dispatchedIds.has("intFresh"));
  const order = waitOrder(pool);
  const top8 = order.slice(0, 8);
  assert("every dispatched player is among the 8 longest-waiting", [...dispatchedIds].every((id) => top8.includes(id)));
}

// ====================================================================
section("5 & 6. Intermediate vs Intermediate — allowed when close in the waiting list, not when far apart");
// The waiting list here is the effective-wait order. `posMap` sets each
// intermediate at an exact 1-based position by choosing its wait minutes;
// all other slots are beginners.
function intAtPositions(posA, posB, totalWaiting = 8) {
  const spec = [];
  for (let pos = 1; pos <= totalWaiting; pos += 1) {
    const isInt = pos === posA || pos === posB;
    spec.push({ id: `p${pos}`, waitedMin: 100 - pos, skill: isInt ? "intermediate" : "beginner" });
  }
  return buildPool(spec);
}
function frontQuartetHasBothInts(pool, posA, posB) {
  // The first quartet the engine forms = the first matchup it returns.
  const nm = refreshNextMatchups(pool.queueIds, pool.players, [], new BalancedRotationEngine(), null, 1, null);
  if (nm.length === 0) return false;
  const ids = new Set([...nm[0].teamA, ...nm[0].teamB]);
  return ids.has(`p${posA}`) && ids.has(`p${posB}`);
}

// Rule-level check of "1 or 2 waiting-list positions apart" — the exact
// interpretation implemented: 1-based ranks in the effective-wait order,
// two intermediates permitted in one quartet iff |rankA - rankB| <= 2.
// Every one of the user's six required position pairs is asserted here.
function intPairAllowed(posA, posB) {
  const eng = new BalancedRotationEngine();
  // window of 6 solo units at ranks 1..6; ints at posA, posB.
  const players = {};
  const window = [];
  const positionOf = new Map();
  for (let pos = 1; pos <= 6; pos += 1) {
    const id = `p${pos}`;
    players[id] = { id, skill: pos === posA || pos === posB ? "intermediate" : "beginner", partnerId: null };
    window.push({ ids: [id] });
    positionOf.set(id, pos);
  }
  // candidate quartet = the two intermediates + two fillers
  const idxs = [posA - 1, posB - 1, ...[0, 1, 2, 3, 4, 5].filter((i) => i !== posA - 1 && i !== posB - 1).slice(0, 2)];
  return eng.intermediatesWithinQueueDistance(idxs, window, players, positionOf);
}

section("  5. close positions (diff <= 2) ARE allowed to share a matchup");
assert("positions 1 and 2 (diff 1) — allowed", intPairAllowed(1, 2));
assert("positions 1 and 3 (diff 2) — allowed", intPairAllowed(1, 3));
assert("positions 2 and 4 (diff 2) — allowed", intPairAllowed(2, 4));
assert("positions 3 and 5 (diff 2) — allowed", intPairAllowed(3, 5));
assert("positions 1 and 2 — engine actually places them together in the front quartet", frontQuartetHasBothInts(intAtPositions(1, 2), 1, 2));
assert("positions 1 and 3 — engine actually places them together in the front quartet", frontQuartetHasBothInts(intAtPositions(1, 3), 1, 3));
assert("positions 2 and 4 — engine actually places them together in the front quartet", frontQuartetHasBothInts(intAtPositions(2, 4), 2, 4));

section("  6. distant positions (diff >= 3) are NOT chosen merely for skill symmetry");
assert("positions 1 and 4 (diff 3) — rejected by the queue-distance rule", !intPairAllowed(1, 4));
assert("positions 3 and 6 (diff 3) — rejected by the queue-distance rule", !intPairAllowed(3, 6));
assert("positions 1 and 4 — engine does NOT place them in the same matchup", !frontQuartetHasBothInts(intAtPositions(1, 4), 1, 4));
assert("positions 3 and 6 — engine does NOT place them in the same matchup", !frontQuartetHasBothInts(intAtPositions(3, 6), 3, 6));
{
  // ...and the front (position 1) player still plays — the far one just waits.
  const pool = intAtPositions(1, 4);
  const { dispatchedIds } = dispatchFor(pool, 1);
  assert("positions 1 and 4 — position 1 (longest waiting) IS dispatched", dispatchedIds.has("p1"));
  assert("positions 1 and 4 — position 4 (far intermediate) is NOT dispatched this round", !dispatchedIds.has("p4"));
}

// ====================================================================
section("7. A recently-finished player does not automatically return ahead of longer-waiting players");
{
  // 4 finished ~2 min ago; 6 have waited 12..17 min continuously.
  const spec = [];
  for (let i = 1; i <= 4; i++) spec.push({ id: `F${i}`, waitedMin: 2, playedRecently: true, games: 3 });
  for (let i = 1; i <= 6; i++) spec.push({ id: `L${i}`, waitedMin: 11 + i });
  const pool = buildPool(spec);
  const { dispatchedIds } = dispatchFor(pool, 1);
  assert("no F# (just finished) player is dispatched while L# players have waited 12-17 min", !["F1", "F2", "F3", "F4"].some((id) => dispatchedIds.has(id)));
  assert("the 4 longest-waiting L# players are dispatched", ["L6", "L5", "L4", "L3"].every((id) => dispatchedIds.has(id)));
}
{
  // Guard RELAXES when there is genuinely no fair alternative: exactly 4
  // players, one fresh — a court must still fill.
  const pool = buildPool([
    { id: "fresh", waitedMin: 1, playedRecently: true },
    { id: "x1", waitedMin: 20 },
    { id: "x2", waitedMin: 20 },
    { id: "x3", waitedMin: 20 },
  ]);
  const { dispatched } = dispatchFor(pool, 1);
  assert("with only 4 players total, the rest guard relaxes and the court still fills", dispatched.length === 1);
}

// ====================================================================
section("8. Existing eligibility restrictions still work");
{
  const pool = buildPool([
    { id: "held", waitedMin: 90 },
    { id: "gone", waitedMin: 80 },
    { id: "break", waitedMin: 70 },
    { id: "w1", waitedMin: 30 },
    { id: "w2", waitedMin: 28 },
    { id: "w3", waitedMin: 26 },
    { id: "w4", waitedMin: 24 },
  ]);
  pool.players.held.held = true;
  pool.players.gone.status = "CHECKED_OUT";
  pool.players.break.playStatus = "on_break";
  const { dispatchedIds } = dispatchFor(pool, 1);
  assert("a held player (waiting 90 min) is NOT dispatched", !dispatchedIds.has("held"));
  assert("a checked-out player is NOT dispatched", !dispatchedIds.has("gone"));
  assert("an on-break player is NOT dispatched", !dispatchedIds.has("break"));
  assert("the 4 longest-waiting ELIGIBLE players are dispatched", ["w1", "w2", "w3", "w4"].every((id) => dispatchedIds.has(id)));
}

// ====================================================================
section("9. Fixed Partner Mode — a mutually-fixed pair still plays together, on their longer-waiting member's priority");
{
  const spec = [
    { id: "fixedA", waitedMin: 40, partnerId: "fixedB", skill: "intermediate" },
    { id: "fixedB", waitedMin: 3, partnerId: "fixedA", skill: "intermediate" }, // fresher partner
    { id: "o1", waitedMin: 35 },
    { id: "o2", waitedMin: 33 },
    { id: "o3", waitedMin: 8 },
    { id: "o4", waitedMin: 6 },
  ];
  const pool = buildPool(spec);
  const nm = refreshNextMatchups(pool.queueIds, pool.players, [], new BalancedRotationEngine(), null, 1, null);
  const ids = new Set([...nm[0].teamA, ...nm[0].teamB]);
  assert("fixedA and fixedB are in the same matchup", ids.has("fixedA") && ids.has("fixedB"));
  assert("they are on the same TEAM (partner request honored, not split across teams)", nm[0].teamA.includes("fixedA") === nm[0].teamA.includes("fixedB"));
  assert("the pair's fresher member (fixedB, 3 min) rides in on fixedA's 40-min priority, not blocked by the rest guard", ids.has("fixedB"));
  assert("o1 and o2 (next longest waiting) fill the other two slots — not the two 6-8 min players", ids.has("o1") && ids.has("o2"));
}
{
  // Two mutually-fixed intermediates FAR apart in the queue are still
  // allowed together — the fixed-partner exemption overrides the
  // Intermediate queue-distance rule (an explicit organizer choice).
  const spec = [
    { id: "fi1", waitedMin: 100, partnerId: "fi2", skill: "intermediate" },
    { id: "b1", waitedMin: 90, skill: "beginner" },
    { id: "b2", waitedMin: 80, skill: "beginner" },
    { id: "fi2", waitedMin: 70, partnerId: "fi1", skill: "intermediate" }, // position ~4, diff 3 from fi1
    { id: "b3", waitedMin: 60, skill: "beginner" },
    { id: "b4", waitedMin: 50, skill: "beginner" },
  ];
  const pool = buildPool(spec);
  const nm = refreshNextMatchups(pool.queueIds, pool.players, [], new BalancedRotationEngine(), null, 1, null);
  const ids = new Set([...nm[0].teamA, ...nm[0].teamB]);
  assert("a mutually-fixed intermediate pair 3 positions apart is still matched together (fixed-partner exemption)", ids.has("fi1") && ids.has("fi2"));
}

// ====================================================================
section("10. Skill compatibility is preserved — mixed beginner+intermediate teams still form");
{
  const spec = [
    { id: "i1", waitedMin: 50, skill: "intermediate" },
    { id: "i2", waitedMin: 48, skill: "intermediate" },
    { id: "b1", waitedMin: 46, skill: "beginner" },
    { id: "b2", waitedMin: 44, skill: "beginner" },
  ];
  const pool = buildPool(spec);
  const nm = refreshNextMatchups(pool.queueIds, pool.players, [], new BalancedRotationEngine(), null, 1, null);
  const teamSkills = (team) => team.map((id) => pool.players[id].skill).sort().join("+");
  assert("2 int + 2 beg -> both teams are mixed (beginner+intermediate)", teamSkills(nm[0].teamA) === "beginner+intermediate" && teamSkills(nm[0].teamB) === "beginner+intermediate");
}
{
  // All-beginner pool still forms teams (same-skill fallback), never stalls.
  const spec = [];
  for (let i = 1; i <= 8; i += 1) spec.push({ id: `bb${i}`, waitedMin: 40 - i, skill: "beginner" });
  const pool = buildPool(spec);
  const nm = refreshNextMatchups(pool.queueIds, pool.players, [], new BalancedRotationEngine(), null, 2, null);
  assert("an all-beginner pool still produces 2 matchups (same-skill fallback, no stall)", nm.length === 2);
}

// ====================================================================
section("11. Generalizes — other player / court counts");
{
  // 3 courts, 16 players, staggered waits, 3 intermediates spread out.
  const spec = [];
  for (let i = 1; i <= 16; i += 1) spec.push({ id: `g${i}`, waitedMin: 50 - i * 2, skill: i % 6 === 0 ? "intermediate" : "beginner" });
  spec.push({ id: "gFresh", waitedMin: 1, playedRecently: true });
  const pool = buildPool(spec);
  const { dispatched, dispatchedIds } = dispatchFor(pool, 3);
  assert("3 courts -> 3 matchups dispatched", dispatched.length === 3);
  assert("the just-finished player is not among the 12 dispatched", !dispatchedIds.has("gFresh"));
  const top12 = waitOrder(pool).slice(0, 12);
  assert("all 12 dispatched are among the 12 longest-waiting eligible", [...dispatchedIds].every((id) => top12.includes(id)));
}
{
  // 1 court, 5 players — one quartet, one leftover (the shortest wait).
  const pool = buildPool([
    { id: "q1", waitedMin: 25 },
    { id: "q2", waitedMin: 23 },
    { id: "q3", waitedMin: 21 },
    { id: "q4", waitedMin: 19 },
    { id: "q5", waitedMin: 5 },
  ]);
  const { dispatchedIds } = dispatchFor(pool, 1);
  assert("the 4 longest-waiting are dispatched, the 5th waits", ["q1", "q2", "q3", "q4"].every((id) => dispatchedIds.has(id)) && !dispatchedIds.has("q5"));
}

// ====================================================================
section("12. matchmakingPriority overrides still steer Stage-1 ordering (organizer opt-in)");
{
  const pool = buildPool([
    { id: "old1", waitedMin: 40, games: 5 },
    { id: "old2", waitedMin: 38, games: 5 },
    { id: "new1", waitedMin: 3, games: 0 },
    { id: "new2", waitedMin: 2, games: 0 },
    { id: "mid1", waitedMin: 20, games: 2 },
    { id: "mid2", waitedMin: 18, games: 2 },
  ]);
  const dLong = dispatchFor(pool, 1, "longestWaiting").dispatchedIds;
  assert('"longestWaiting" — the 4 longest-waiting play', ["old1", "old2", "mid1", "mid2"].every((id) => dLong.has(id)));
  const dNew = dispatchFor(pool, 1, "newlyCheckedIn").dispatchedIds;
  assert('"newlyCheckedIn" — the newest check-ins are selected instead', dNew.has("new1") && dNew.has("new2"));
  const dGames = dispatchFor(pool, 1, "leastGamesPlayed").dispatchedIds;
  assert('"leastGamesPlayed" — the 0-games players are selected', dGames.has("new1") && dGames.has("new2"));
}

// ====================================================================
section("13. Regression — WAIT/FAIRNESS beats the Intermediate-distance rule on a forced choice");
// Confirmed bug (investigation task): when the front-4 violates the
// Intermediate queue-distance rule AND the only rule-compliant substitute
// is a just-finished player, the fallback used to keep the Intermediate
// rule and drop the rest guard — pulling the fresh player in ahead of a
// materially longer-waiting Intermediate. Fixed by reversing the fallback
// order in selectQuartetFromWindow: the rest guard is now kept and the
// Intermediate rule is relaxed instead.
//
// Exact reproduction from the investigation report:
//   int1 (Intermediate, 40 min) + beg2 (35 min) + beg3 (30 min) would need
//   int2 (Intermediate, 28 min) to complete a strict front-4 — but int1 and
//   int2 are 3 waiting-list positions apart, violating the distance rule.
//   fresh5 just finished (1 min) is the only distance-rule-compliant
//   substitute. WAIT/FAIRNESS must dominate: fresh5 (1 min) must NOT be
//   selected ahead of int2 (28 min) merely to satisfy the skill rule.
{
  const pool = buildPool([
    { id: "int1", waitedMin: 40, skill: "intermediate" },
    { id: "beg2", waitedMin: 35 },
    { id: "beg3", waitedMin: 30 },
    { id: "int2", waitedMin: 28, skill: "intermediate" },
    { id: "fresh5", waitedMin: 1, playedRecently: true },
  ]);
  const engine = new BalancedRotationEngine();
  const quartets = engine.selectFairnessQuartets(pool.queueIds, pool.players, null);
  const firstQuartetIds = new Set(quartets[0] || []);
  assert("fresh5 (1 min) is NOT selected ahead of int2 (28 min)", !firstQuartetIds.has("fresh5"));
  assert("int2 (28 min, materially longer-waiting) IS selected, even though it violates the Intermediate-distance rule", firstQuartetIds.has("int2"));
  assert("int1 (front, longest-waiting) is still selected", firstQuartetIds.has("int1"));

  // Same fixture end-to-end through the real dispatch path.
  const { dispatchedIds } = dispatchFor(pool, 1);
  assert("end-to-end: fresh5 is not dispatched ahead of int2", !dispatchedIds.has("fresh5"));
  assert("end-to-end: int2 is dispatched", dispatchedIds.has("int2"));
}

// ====================================================================
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
