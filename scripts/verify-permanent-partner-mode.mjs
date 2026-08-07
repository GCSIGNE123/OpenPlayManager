// Partner Requests (formerly "Permanent Partner Mode") — automated,
// headless, logic-layer coverage. Calls the real pure functions directly
// (setFixedPartner/clearFixedPartner from src/lib/queueManagement.js;
// BalancedRotationEngine/AdaptiveSkillRotationEngine's real, unmodified
// generateMatchups/buildTeams) — no synthetic reimplementation.
//
// Usage: node scripts/verify-permanent-partner-mode.mjs
import { setFixedPartner, clearFixedPartner } from "../src/lib/queueManagement.js";
import { BalancedRotationEngine } from "../src/engines/BalancedRotationEngine.js";
import { AdaptiveSkillRotationEngine } from "../src/engines/AdaptiveSkillRotationEngine.js";
import { refreshNextMatchups } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeState(overrides = {}) {
  return {
    players: {
      p1: { id: "p1", name: "Juan", skill: "beginner", games: 0 },
      p2: { id: "p2", name: "Maria", skill: "intermediate", games: 0 },
      p3: { id: "p3", name: "Pedro", skill: "beginner", games: 0 },
      p4: { id: "p4", name: "Ana", skill: "intermediate", games: 0 },
    },
    ...overrides,
  };
}

console.log("\nsetFixedPartner — sets a mutual partnerId on both players");
{
  const state = makeState();
  const next = setFixedPartner(state, "p1", "p2");
  assert("p1's partnerId is p2", next.players.p1.partnerId === "p2");
  assert("p2's partnerId is p1", next.players.p2.partnerId === "p1");
  assert("unrelated players untouched", next.players.p3.partnerId === undefined && next.players.p4.partnerId === undefined);
}

console.log("\nsetFixedPartner — reassigning a partner cleanly clears the OLD link on both sides");
{
  let state = makeState();
  state = setFixedPartner(state, "p1", "p2");
  const next = setFixedPartner(state, "p1", "p3");
  assert("p1 is now partnered with p3", next.players.p1.partnerId === "p3");
  assert("p3 is now partnered with p1", next.players.p3.partnerId === "p1");
  assert("p2 (the old partner) is cleared back to no partner", next.players.p2.partnerId === null);
}

console.log("\nclearFixedPartner — clears both sides of the link");
{
  let state = makeState();
  state = setFixedPartner(state, "p1", "p2");
  const next = clearFixedPartner(state, "p1");
  assert("p1 cleared", next.players.p1.partnerId === null);
  assert("p2 (the other side) also cleared", next.players.p2.partnerId === null);
}

console.log("\nGuards");
{
  const state = makeState();
  assert("setFixedPartner no-op for the same player twice", setFixedPartner(state, "p1", "p1") === state);
  assert("setFixedPartner no-op for a nonexistent player", setFixedPartner(state, "p1", "ghost") === state);
  assert("clearFixedPartner no-op when there's no partner to clear", clearFixedPartner(state, "p1") === state);
  const paired = setFixedPartner(state, "p1", "p2");
  assert("setFixedPartner no-op when already exactly this pair", setFixedPartner(paired, "p1", "p2") === paired);
}

console.log("\nBalancedRotationEngine.buildTeams — a requested pair stays together unconditionally, no session setting needed");
{
  const engine = new BalancedRotationEngine();
  // Deliberately hostile scoring: p1/p2 partnered many times recently (a
  // normal, unforced match would actively AVOID re-pairing them) — if the
  // fixed pair still ends up together despite that, it's genuinely the
  // partner request doing it, not a coincidence of scoring.
  const players = {
    p1: { id: "p1", name: "Juan", skill: "beginner", partnerId: "p2", partnerCounts: { p2: 5 }, recentPartnerIds: ["p2"] },
    p2: { id: "p2", name: "Maria", skill: "intermediate", partnerId: "p1", partnerCounts: { p1: 5 }, recentPartnerIds: ["p1"] },
    p3: { id: "p3", name: "Pedro", skill: "beginner" },
    p4: { id: "p4", name: "Ana", skill: "intermediate" },
  };
  const teams = engine.buildTeams(["p1", "p2", "p3", "p4"], players, true);
  const fixedTeam = teams.find((t) => t.includes("p1"));
  assert("p1 and p2 are still teamed together despite terrible partner-recency scoring", fixedTeam.includes("p1") && fixedTeam.includes("p2"));
  assert("p3 and p4 formed the other team", teams.some((t) => t.includes("p3") && t.includes("p4")));
}

console.log("\nClearing a partner request removes the forced pairing — normal recency avoidance resumes");
{
  const engine = new BalancedRotationEngine();
  let state = {
    players: {
      p1: { id: "p1", name: "Juan", skill: "beginner", partnerCounts: { p2: 5 }, recentPartnerIds: ["p2"] },
      p2: { id: "p2", name: "Maria", skill: "intermediate", partnerCounts: { p1: 5 }, recentPartnerIds: ["p1"] },
      p3: { id: "p3", name: "Pedro", skill: "beginner" },
      p4: { id: "p4", name: "Ana", skill: "intermediate" },
    },
  };
  state = setFixedPartner(state, "p1", "p2");
  state = clearFixedPartner(state, "p1");
  const teams = engine.buildTeams(["p1", "p2", "p3", "p4"], state.players, true);
  const p1Team = teams.find((t) => t.includes("p1"));
  assert("p1 is NOT teamed with p2 after the request was cleared — normal recency avoidance applies instead", !p1Team.includes("p2"));
}

console.log("\nAdaptive Skill Rotation still separates divisions (a cross-division partner request is never forced together)");
{
  const engine = new AdaptiveSkillRotationEngine();
  const players = {
    p1: { id: "p1", name: "Juan", skill: "beginner", partnerId: "p2", games: 0 }, // partnered with an INTERMEDIATE player
    p2: { id: "p2", name: "Maria", skill: "intermediate", partnerId: "p1", games: 0 },
    b1: { id: "b1", name: "Beg1", skill: "beginner", games: 0 },
    b2: { id: "b2", name: "Beg2", skill: "beginner", games: 0 },
    i1: { id: "i1", name: "Int1", skill: "intermediate", games: 0 },
    i2: { id: "i2", name: "Int2", skill: "intermediate", games: 0 },
  };
  const matchups = engine.generateMatchups({
    waitingIds: ["p1", "p2", "b1", "b2", "i1", "i2"],
    players,
    existingMatchups: [],
  });
  const allMatchupsSingleSkill = matchups.every((m) => {
    const ids = [...m.teamA, ...m.teamB];
    const skills = new Set(ids.map((id) => players[id].skill));
    return skills.size === 1;
  });
  assert("every matchup is still single-skill — Beginner/Intermediate separation is untouched", allMatchupsSingleSkill);
  const p1p2SameTeam = matchups.some((m) => (m.teamA.includes("p1") && m.teamA.includes("p2")) || (m.teamB.includes("p1") && m.teamB.includes("p2")));
  assert("p1 and p2 (a cross-division 'partner' pair) are never forced onto the same team", !p1p2SameTeam);
}

console.log("\nAdaptive Skill Rotation forces a SAME-division requested pair together");
{
  const engine = new AdaptiveSkillRotationEngine();
  const players = {
    p1: { id: "p1", name: "Juan", skill: "beginner", partnerId: "p2", partnerCounts: { p2: 5 }, recentPartnerIds: ["p2"], games: 0 },
    p2: { id: "p2", name: "Maria", skill: "beginner", partnerId: "p1", partnerCounts: { p1: 5 }, recentPartnerIds: ["p1"], games: 0 },
    b3: { id: "b3", name: "Beg3", skill: "beginner", games: 0 },
    b4: { id: "b4", name: "Beg4", skill: "beginner", games: 0 },
  };
  const matchups = engine.generateMatchups({
    waitingIds: ["p1", "p2", "b3", "b4"],
    players,
    existingMatchups: [],
  });
  const p1p2Team = matchups.find((m) => m.teamA.includes("p1") || m.teamB.includes("p1"));
  const p1Side = p1p2Team.teamA.includes("p1") ? p1p2Team.teamA : p1p2Team.teamB;
  assert("p1 and p2 (same-division requested partners) are teamed together despite bad partner-recency scoring", p1Side.includes("p2"));
}

console.log("\nFull engine call (refreshNextMatchups) — a requested pair stays intact, no extra argument needed");
{
  const players = {
    p1: { id: "p1", name: "Juan", skill: "beginner", partnerId: "p2", games: 0 },
    p2: { id: "p2", name: "Maria", skill: "intermediate", partnerId: "p1", games: 0 },
    p3: { id: "p3", name: "Pedro", skill: "beginner", games: 0 },
    p4: { id: "p4", name: "Ana", skill: "intermediate", games: 0 },
  };
  const engine = new BalancedRotationEngine();
  const matchups = refreshNextMatchups(["p1", "p2", "p3", "p4"], players, [], engine, null, Infinity);
  assert("a matchup was generated", matchups.length > 0);
  const fixedTeamTogether = matchups.some((m) => (m.teamA.includes("p1") && m.teamA.includes("p2")) || (m.teamB.includes("p1") && m.teamB.includes("p2")));
  assert("p1 and p2 ended up on the same team via the full refreshNextMatchups call path", fixedTeamTogether);
}

console.log("\nFull engine call — players with no partner request behave exactly as before");
{
  const players = {
    p1: { id: "p1", name: "Juan", skill: "beginner", games: 0 },
    p2: { id: "p2", name: "Maria", skill: "intermediate", games: 0 },
    p3: { id: "p3", name: "Pedro", skill: "beginner", games: 0 },
    p4: { id: "p4", name: "Ana", skill: "intermediate", games: 0 },
  };
  const engine = new BalancedRotationEngine();
  const matchups = refreshNextMatchups(["p1", "p2", "p3", "p4"], players, [], engine, null, Infinity);
  assert("still generates the normal single mixed-skill matchup with no crash/behavior change", matchups.length === 1);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
