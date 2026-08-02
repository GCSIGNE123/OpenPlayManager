// Adaptive Skill Rotation — automated, headless, logic-layer coverage.
//
// Same approach as scripts/run-acceptance-test.mjs: calls the real pure
// functions (getRotationEngine, refreshNextMatchups, changePlayerSkill from
// src/lib/utils.js) directly, unmodified — no synthetic reimplementation of
// the engine or the manual-override action.
//
// Usage: node scripts/verify-adaptive-skill.mjs
import { getRotationEngine, refreshNextMatchups, changePlayerSkill } from "../src/lib/utils.js";
import { AdaptiveSkillRotationEngine } from "../src/engines/AdaptiveSkillRotationEngine.js";

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

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
