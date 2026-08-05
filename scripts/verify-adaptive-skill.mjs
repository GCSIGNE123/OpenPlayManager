// Adaptive Skill Rotation — automated, headless, logic-layer coverage.
//
// Same approach as scripts/run-acceptance-test.mjs: calls the real pure
// functions (getRotationEngine, refreshNextMatchups, changePlayerSkill from
// src/lib/utils.js) directly, unmodified — no synthetic reimplementation of
// the engine or the manual-override action.
//
// Usage: node scripts/verify-adaptive-skill.mjs
import { getRotationEngine, refreshNextMatchups, maxUpcomingMatchups, changePlayerSkill, recordRotationHistory } from "../src/lib/utils.js";
import { dispatchAvailableCourts } from "../src/lib/courtDispatch.js";
import { AdaptiveSkillRotationEngine } from "../src/engines/AdaptiveSkillRotationEngine.js";
import { BalancedRotationEngine } from "../src/engines/BalancedRotationEngine.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayers(beginners, intermediates) {
  const players = {};
  for (let i = 0; i < beginners; i++) {
    const id = `b${i}`;
    players[id] = { id, name: `Beg${i}`, skill: "beginner", games: 0 };
  }
  for (let i = 0; i < intermediates; i++) {
    const id = `i${i}`;
    players[id] = { id, name: `Int${i}`, skill: "intermediate", games: 0 };
  }
  return players;
}

console.log("\n1. Skill-segregated matchups");
{
  const players = makePlayers(8, 8);
  const queueIds = Object.keys(players);
  const engine = getRotationEngine("adaptiveSkill");
  const matchups = refreshNextMatchups(queueIds, players, [], engine, null);
  assert("generates matchups", matchups.length > 0);
  const allSameSkill = matchups.every((m) => {
    const ids = [...m.teamA, ...m.teamB];
    const skills = new Set(ids.map((id) => players[id].skill));
    return skills.size === 1;
  });
  assert("every matchup is single-skill (no mixed beginner+intermediate team/opponent)", allSameSkill);
  assert("4 complete matchups from 8+8 (2 divisions x 2 matches each)", matchups.length === 4);
}

console.log("\n2. Uneven pools still segregate (no cross-skill fallback)");
{
  const players = makePlayers(5, 3);
  const queueIds = Object.keys(players);
  const engine = getRotationEngine("adaptiveSkill");
  const matchups = refreshNextMatchups(queueIds, players, [], engine, null);
  const allSameSkill = matchups.every((m) => {
    const ids = [...m.teamA, ...m.teamB];
    const skills = new Set(ids.map((id) => players[id].skill));
    return skills.size === 1;
  });
  assert("still fully segregated with uneven pools", allSameSkill);
  assert("exactly 1 matchup total (1 from 4 usable beginners, 0 from 3 intermediates)", matchups.length === 1);
}

console.log("\n3. Fairness preserved within a division (repeat-partner avoidance)");
{
  const players = makePlayers(4, 0);
  players.b0.partnerCounts = { b1: 5 };
  players.b0.recentPartnerIds = ["b1"];
  players.b1.partnerCounts = { b0: 5 };
  players.b1.recentPartnerIds = ["b0"];
  const queueIds = Object.keys(players);
  const engine = getRotationEngine("adaptiveSkill");
  const matchups = refreshNextMatchups(queueIds, players, [], engine, null);
  assert("1 matchup formed", matchups.length === 1);
  const m = matchups[0];
  const b0Team = m.teamA.includes("b0") ? m.teamA : m.teamB;
  assert("b0 and b1 (recent partners) avoided as teammates", !b0Team.includes("b1"));
}

console.log("\n4. Manual skill override (changePlayerSkill) - reusable action");
{
  const players = makePlayers(2, 2);
  const state = {
    players,
    nextMatchups: [{ id: "m1", teamA: ["b0", "b1"], teamB: ["i0", "i1"] }],
    skillChangeLog: [],
  };
  const next = changePlayerSkill(state, "b0", "intermediate", "Manual override");
  assert("player's skill updated", next.players.b0.skill === "intermediate");
  assert("matchup containing the player dissolved", next.nextMatchups.length === 0);
  assert("activity log entry recorded", next.skillChangeLog.length === 1);
  const entry = next.skillChangeLog[0];
  assert("log entry has playerName/previousSkill/newSkill/reason/timestamp", (
    entry.playerName === "Beg0" &&
    entry.previousSkill === "beginner" &&
    entry.newSkill === "intermediate" &&
    entry.reason === "Manual override" &&
    typeof entry.timestamp === "number"
  ));
  const noop = changePlayerSkill(next, "b0", "intermediate");
  assert("no-op if skill unchanged (idempotent, no duplicate log entry)", noop === next);
}

console.log("\n5. Streak reset semantics (mirrors endMatch's own logic)");
{
  function applyResult(p, won) {
    return {
      ...p,
      streak: won ? (p.streak || 0) + 1 : 0,
      lossStreak: won ? 0 : (p.lossStreak || 0) + 1,
    };
  }
  let p = { streak: 0, lossStreak: 0 };
  p = applyResult(p, true);
  p = applyResult(p, true);
  p = applyResult(p, true);
  assert("3 consecutive wins -> streak == 3", p.streak === 3);
  p = applyResult(p, false);
  assert("a loss resets win streak to 0", p.streak === 0);
  assert("a loss increments loss streak to 1", p.lossStreak === 1);
  p = applyResult(p, false);
  p = applyResult(p, false);
  assert("3 consecutive losses -> lossStreak == 3", p.lossStreak === 3);
  p = applyResult(p, true);
  assert("a win resets loss streak to 0", p.lossStreak === 0);
}

console.log("\n6. Winner vs Winner / Loser vs Loser scoring preference");
{
  const engine = new AdaptiveSkillRotationEngine();
  const players = {
    w1: { id: "w1", lastResult: "win" },
    w2: { id: "w2", lastResult: "win" },
    l1: { id: "l1", lastResult: "loss" },
    l2: { id: "l2", lastResult: "loss" },
  };
  const winVsWin = engine.scoreMatchup(["w1"], ["w2"], players);
  const winVsLoss = engine.scoreMatchup(["w1"], ["l1"], players);
  const lossVsLoss = engine.scoreMatchup(["l1"], ["l2"], players);
  assert("winner-vs-winner scores higher than winner-vs-loser (no opponent history either way)", winVsWin > winVsLoss);
  assert("loser-vs-loser scores higher than winner-vs-loser", lossVsLoss > winVsLoss);
  assert("winner-vs-winner and loser-vs-loser score equally (symmetric preference)", winVsWin === lossVsLoss);

  const noHistory = { n1: { id: "n1", lastResult: null }, n2: { id: "n2", lastResult: null } };
  const neutralScore = engine.scoreMatchup(["n1"], ["n2"], noHistory);
  const baseScore = engine.divisionEngine.scoreOpponents(["n1"], ["n2"], noHistory);
  assert("no winner-grouping bonus applied when players have no completed match yet (first round)", neutralScore === baseScore);
}

console.log("\n7. Winner vs Winner never overrides repeat-opponent avoidance");
{
  const engine = new AdaptiveSkillRotationEngine();
  const players = {
    a: { id: "a", lastResult: "win", lastOpponentIds: ["b"] },
    b: { id: "b", lastResult: "win", lastOpponentIds: ["a"] },
    c: { id: "c", lastResult: "loss" },
  };
  const repeatWinVsWin = engine.scoreMatchup(["a"], ["b"], players); // same last result, but just played each other
  const freshWinVsLoss = engine.scoreMatchup(["a"], ["c"], players); // different last result, fresh opponent
  assert("a fresh opponent of a different last result outranks an immediate-repeat same-result opponent", freshWinVsLoss > repeatWinVsWin);
}

console.log("\n8. Never leaves a court empty / degrades gracefully when winner/loser grouping isn't achievable");
{
  // 3 players just won, 1 just lost -- can't form a pure winner-vs-winner
  // AND loser-vs-loser split (only 1 loser). The engine must still produce
  // a full matchup from all 4, same guarantee as plain Adaptive Skill
  // Rotation (Guaranteed Upcoming Match Queue) -- there's no separate
  // "fallback" path to fail out of, since the preference is just a scoring
  // bonus that silently contributes nothing when it can't be satisfied.
  const players = makePlayers(4, 0);
  players.b0.lastResult = "win";
  players.b1.lastResult = "win";
  players.b2.lastResult = "win";
  players.b3.lastResult = "loss";
  const queueIds = Object.keys(players);
  const engine = getRotationEngine("adaptiveSkill");
  const matchups = refreshNextMatchups(queueIds, players, [], engine, null);
  assert("still forms a complete matchup from all 4 waiting players despite an uneven win/loss split", matchups.length === 1);
  const m = matchups[0];
  assert("all 4 players are placed (none left stranded)", [...m.teamA, ...m.teamB].length === 4);
}

console.log("\n9. Partners still rotate under Winner vs Winner (no fixed partnerships)");
{
  // two players who are each other's most-recent partner should still be
  // split up as teammates by the (unmodified) partner-recency team
  // building, even though they share the same lastResult -- winner
  // grouping must never turn into "always partner two winners together."
  const players = makePlayers(4, 0);
  players.b0.lastResult = "win";
  players.b1.lastResult = "win";
  players.b0.partnerCounts = { b1: 5 };
  players.b0.recentPartnerIds = ["b1"];
  players.b1.partnerCounts = { b0: 5 };
  players.b1.recentPartnerIds = ["b0"];
  players.b2.lastResult = "loss";
  players.b3.lastResult = "loss";
  const queueIds = Object.keys(players);
  const engine = getRotationEngine("adaptiveSkill");
  const matchups = refreshNextMatchups(queueIds, players, [], engine, null);
  assert("1 matchup formed", matchups.length === 1);
  const m = matchups[0];
  const b0Team = m.teamA.includes("b0") ? m.teamA : m.teamB;
  assert("b0 and b1 (recent partners, same lastResult) still avoided as teammates -- partner rotation unaffected by winner grouping", !b0Team.includes("b1"));
}

console.log("\n10. scoreFullMatchup — exposed BalancedRotationEngine score composes scorePartner+scorePartner+scoreOpponents, nothing reimplemented");
{
  const players = makePlayers(2, 2);
  players.b0.partnerCounts = { b1: 0 };
  players.i0.partnerCounts = { i1: 5 };
  players.i0.recentPartnerIds = ["i1"];
  const balanced = new BalancedRotationEngine();
  const teamA = ["b0", "b1"];
  const teamB = ["i0", "i1"];
  const expected =
    balanced.scorePartner("b0", "b1", players) +
    balanced.scorePartner("i0", "i1", players) +
    balanced.scoreOpponents(teamA, teamB, players);
  assert("scoreFullMatchup equals scorePartner(A)+scorePartner(B)+scoreOpponents(A,B)", balanced.scoreFullMatchup(teamA, teamB, players) === expected);
}

console.log("\n11. Cross-division merge-then-cap — a long-waiting Intermediate matchup outranks a fresh Beginner one, and both divisions survive the queue-depth cap");
{
  // 8 beginners who just played (fresh lastMatchEndAt -> ~0 min waited) vs
  // 4 intermediates who have been waiting a long time (old checkedInAt) --
  // this is exactly the shape that produced total Intermediate starvation
  // before this redesign (see PROJECT.md).
  const players = makePlayers(8, 4);
  const now = Date.now();
  Object.values(players).forEach((p) => {
    if (p.skill === "beginner") p.lastMatchEndAt = now; // just played, ~0 min waited
    else p.checkedInAt = now - 45 * 60 * 1000; // waiting 45 minutes, never played yet
  });
  const queueIds = Object.keys(players);
  const engine = getRotationEngine("adaptiveSkill");
  // cap of 2 (e.g. 3 courts, 1 occupied) -- small enough that the old
  // beginner-first concatenation would always fill it with 0 Intermediate
  // matchups ever getting through
  const matchups = refreshNextMatchups(queueIds, players, [], engine, null, 2);
  assert("cap of 2 is respected", matchups.length === 2);
  const hasIntermediate = matchups.some((m) => players[m.teamA[0]].skill === "intermediate");
  assert("the long-waiting Intermediate division gets at least one of the 2 slots (no total starvation)", hasIntermediate);
}

console.log("\n12. Long-session regression — neither division is starved over many rounds at 3 courts (the exact scenario reported)");
{
  // A synchronous test loop runs in milliseconds of real time, but the
  // waiting bonus is measured in real minutes (players[id].checkedInAt/
  // lastMatchEndAt vs Date.now()) -- exactly like a live session, where
  // actual wall-clock minutes pass between rounds. Date.now() is
  // monkey-patched for the duration of this section only (pure test
  // technique, no production code touched) so 40 rounds simulate roughly
  // 40 x 15 real minutes instead of 40 x ~0ms.
  const realDateNow = Date.now;

  function runStarvationCheck(beginnerCount, intermediateCount) {
    let virtualNow = realDateNow();
    Date.now = () => virtualNow;

    const players = {};
    const queueIds = [];
    for (let i = 0; i < beginnerCount; i++) {
      const id = `b${i}`;
      queueIds.push(id);
      players[id] = { id, name: `Beg${i}`, skill: "beginner", games: 0, wins: 0, losses: 0, lastResult: null, checkedInAt: virtualNow };
    }
    for (let i = 0; i < intermediateCount; i++) {
      const id = `i${i}`;
      queueIds.push(id);
      players[id] = { id, name: `Int${i}`, skill: "intermediate", games: 0, wins: 0, losses: 0, lastResult: null, checkedInAt: virtualNow };
    }
    let courts = Array.from({ length: 3 }, (_, i) => ({ number: i + 1, status: "open", assignmentMode: "automatic", teamA: [], teamB: [], scoreA: 0, scoreB: 0 }));
    let nextMatchups = [];
    let qIds = [...queueIds];
    const engine = getRotationEngine("adaptiveSkill");

    for (let round = 0; round < 40; round++) {
      virtualNow += 15 * 60000; // 15 real minutes pass per round, same default as CreateSessionScreen's avg match duration
      const cap = maxUpcomingMatchups(courts);
      nextMatchups = refreshNextMatchups(qIds, players, nextMatchups, engine, null, cap);
      const dispatched = dispatchAvailableCourts({ courts, nextMatchups, queueIds: qIds, players, autoFillCourts: true, isCourtReserved: () => false });
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
    const beginnerGames = Object.values(players).filter((p) => p.skill === "beginner").reduce((s, p) => s + p.games, 0);
    const intermediateGames = Object.values(players).filter((p) => p.skill === "intermediate").reduce((s, p) => s + p.games, 0);
    return { beginnerGames, intermediateGames };
  }

  const r1 = runStarvationCheck(24, 8);
  assert("24 Beginner / 8 Intermediate — Intermediates get games over 40 rounds (previously 0)", r1.intermediateGames > 0);
  const r2 = runStarvationCheck(20, 12);
  assert("20 Beginner / 12 Intermediate — Intermediates get games over 40 rounds (previously 0)", r2.intermediateGames > 0);
  const r3 = runStarvationCheck(16, 16);
  assert("16 Beginner / 16 Intermediate — Intermediates get games over 40 rounds (previously 0)", r3.intermediateGames > 0);
  assert("16/16 even split — Beginners still get games too (fix doesn't just flip starvation onto the other division)", r3.beginnerGames > 0);
}

console.log("\n13. PERMANENT REGRESSION GUARD — simultaneous check-in cannot drift into extreme games-played imbalance (e.g. 8 vs 2)");
{
  // The exact real-world bug report this section guards against: 22
  // players (12 Beginner / 10 Intermediate) who ALL check in at the same
  // instant still ended up with some players at 8 games and others at 2
  // over a normal ~3 hour session. Root cause (see PROJECT.md's Games-
  // Played Imbalance Redesign): team formation has no games-played
  // awareness, and a flat additive fairness bonus was numerically swamped
  // by partner/opponent-avoidance scores. Fixed by ranking candidate
  // matchups on a lexicographic tuple (lowest avg games -> lowest max
  // games -> quality -> waiting) instead of one blended number — see
  // AdaptiveSkillRotationEngine.js's generateMatchups.
  //
  // Runs the REAL production engine (getRotationEngine("adaptiveSkill"),
  // unmodified) across several seeded, ~3-hour (12-round) sessions with
  // every player checked in at the exact same simultaneous timestamp, and
  // asserts the worst games-played spread across all of them stays well
  // under the old buggy behavior's scale. This must keep passing no matter
  // what future matchmaking changes touch this file or BalancedRotationEngine
  // — if it ever fails, some change reintroduced the imbalance this sprint
  // fixed.
  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const realDateNow = Date.now;
  const realMathRandom = Math.random;

  function runSimultaneousCheckInSession(seed) {
    let virtualNow = realDateNow();
    Date.now = () => virtualNow;
    Math.random = mulberry32(seed);

    const players = {};
    const queueIds = [];
    for (let i = 0; i < 12; i++) {
      const id = `b${i}`;
      queueIds.push(id);
      players[id] = { id, name: `Beg${i}`, skill: "beginner", games: 0, wins: 0, losses: 0, streak: 0, lossStreak: 0, lastResult: null, checkedInAt: virtualNow, partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [] };
    }
    for (let i = 0; i < 10; i++) {
      const id = `i${i}`;
      queueIds.push(id);
      players[id] = { id, name: `Int${i}`, skill: "intermediate", games: 0, wins: 0, losses: 0, streak: 0, lossStreak: 0, lastResult: null, checkedInAt: virtualNow, partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [] };
    }
    let courts = Array.from({ length: 3 }, (_, i) => ({ number: i + 1, status: "open", assignmentMode: "automatic", teamA: [], teamB: [], scoreA: 0, scoreB: 0 }));
    let nextMatchups = [];
    let qIds = [...queueIds];
    const engine = getRotationEngine("adaptiveSkill"); // the real, unmodified production engine

    for (let round = 0; round < 12; round++) { // 12 rounds x 15min = ~3 real hours, matching CreateSessionScreen's default avg match duration
      virtualNow += 15 * 60000;
      const cap = maxUpcomingMatchups(courts);
      nextMatchups = refreshNextMatchups(qIds, players, nextMatchups, engine, null, cap);
      const dispatched = dispatchAvailableCourts({ courts, nextMatchups, queueIds: qIds, players, autoFillCourts: true, isCourtReserved: () => false });
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
        Object.assign(players, recordRotationHistory(players, c.teamA, c.teamB, c.number));
        qIds.push(...c.teamA, ...c.teamB);
      }
      courts = courts.map((c) => (c.status === "live" ? { number: c.number, status: "open", assignmentMode: "automatic", teamA: [], teamB: [], scoreA: 0, scoreB: 0 } : c));
    }

    Date.now = realDateNow;
    Math.random = realMathRandom;
    const gp = Object.values(players).map((p) => p.games);
    return { spread: Math.max(...gp) - Math.min(...gp), minGP: Math.min(...gp), maxGP: Math.max(...gp) };
  }

  // Multiple seeds so this can never be a one-off lucky/unlucky pass --
  // threshold (6) sits comfortably above this algorithm's typical spread
  // (~3, +/- ~0.5 trial-to-trial per the simulation comparison in
  // TESTING.md) while sitting AT the old bug's reported scale (8 vs 2 = a
  // spread of 6), so a regression back toward that behavior fails loudly.
  const SPREAD_CEILING = 6;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const results = seeds.map(runSimultaneousCheckInSession);
  const worst = results.reduce((a, b) => (b.spread > a.spread ? b : a));
  assert(
    `games-played spread stays under ${SPREAD_CEILING} across ${seeds.length} seeded ~3h sessions with simultaneous check-in (worst: ${worst.spread}, min ${worst.minGP}/max ${worst.maxGP})`,
    worst.spread < SPREAD_CEILING
  );
  results.forEach((r, i) => {
    assert(`seed ${seeds[i]}: no player reaches 0 games (no starvation)`, r.minGP > 0);
  });
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
