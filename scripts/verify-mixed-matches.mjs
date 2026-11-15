// Mixed Matches (Beginner + Intermediate vs Beginner + Intermediate) —
// automated, headless, logic-layer coverage. Calls the real
// AdaptiveSkillRotationEngine and refreshNextMatchups directly. See the
// MIXED MATCHES header in src/engines/AdaptiveSkillRotationEngine.js.
//
// Usage: node scripts/verify-mixed-matches.mjs
import fs from "node:fs";
import { AdaptiveSkillRotationEngine, MIXED_MATCH_WAIT_GAP_MINUTES } from "../src/engines/AdaptiveSkillRotationEngine.js";
import { refreshNextMatchups, maxUpcomingMatchups } from "../src/lib/utils.js";
import { defaultState } from "../src/lib/constants.js";

let pass = 0;
let fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
    console.log(`  ok ${desc}`);
  } else {
    fail++;
    console.log(`  FAIL: ${desc}`);
  }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const NOW = Date.now();
const engine = new AdaptiveSkillRotationEngine();

// spec: "B:12" = a Beginner who has waited 12 minutes; "I:0" = an Intermediate who just came off court
function build(spec, extra = {}) {
  const players = {};
  spec.forEach((s, i) => {
    const [d, wait, games = "3"] = s.split(":");
    const id = `${d}${i + 1}`;
    players[id] = {
      id, name: id, skill: d === "I" ? "intermediate" : "beginner", games: Number(games), wins: 0, losses: 0, streak: 0, lastResult: null,
      partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, recentOpponentIds: [], checkedIn: true,
      checkedInAt: NOW - 3600000, lastMatchEndAt: NOW - Number(wait) * 60000, ...(extra[id] || {}),
    };
  });
  return players;
}
const gen = (players, { on = true, room = 1, existingMatchups = [] } = {}) =>
  engine.generateMatchups({ waitingIds: Object.keys(players), players, existingMatchups, room, resultGrouping: "off", ...(on === null ? {} : { mixedDivisionMatches: on }) }, true);
const skillOf = (players, id) => players[id].skill;
const isMixed = (players, m) => new Set([...m.teamA, ...m.teamB].map((id) => skillOf(players, id))).size === 2;
const balanced = (players, m) => [m.teamA, m.teamB].every((t) => t.length === 2 && skillOf(players, t[0]) !== skillOf(players, t[1]));
const ids = (m) => [...m.teamA, ...m.teamB].sort();
const REPS = 40; // the engine shuffles on ties — every claim is checked repeatedly

console.log("\n1. The organizer's case — 2 Beginners waiting, an Intermediate court finishes");
{
  const players = build(["B:14", "B:13", "I:0", "I:0", "I:0", "I:0"]);
  let ok = true, both = true, flagged = true, leftover = true;
  for (let i = 0; i < REPS; i++) {
    const out = gen(players);
    const m = out[0];
    ok = ok && out.length === 1 && isMixed(players, m) && balanced(players, m);
    both = both && m.teamA.concat(m.teamB).includes("B1") && m.teamA.concat(m.teamB).includes("B2");
    flagged = flagged && m.mixedDivision === true && m.fairness?.mixedDivision === true && /Mixed match/.test(m.fairness.reason);
    leftover = leftover && ids(m).filter((id) => id.startsWith("I")).length === 2;
  }
  assert("one match is built, and it is Beginner + Intermediate on EACH team", ok);
  assert("both waiting Beginners are in it", both);
  assert("exactly two Intermediates join; the other two stay in the queue", leftover);
  assert("the matchup is marked mixed and says why", flagged);
  const off = gen(players, { on: false });
  assert("setting off: the four Intermediates play each other, Beginners keep waiting (previous behaviour)", off.length === 1 && !isMixed(players, off[0]) && ids(off[0]).every((id) => id.startsWith("I")));
  const unset = gen(players, { on: null });
  assert("setting missing (older session): same as off", unset.length === 1 && !isMixed(players, unset[0]));
}

console.log("\n2. Same-category first");
{
  const players = build(["B:1", "B:1", "I:10", "I:10", "I:10", "I:10"]);
  let ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(players); ok = ok && out.length === 1 && !isMixed(players, out[0]); }
  assert("Intermediates who waited longer than the stuck Beginners are not bumped", ok);

  const level = build(["B:6", "B:6", "I:6", "I:6", "I:6", "I:6"]);
  ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(level); ok = ok && !out.some((m) => isMixed(level, m)); }
  assert("equal waits: nobody is bumped for a mixed match", ok);

  const near = 6 - MIXED_MATCH_WAIT_GAP_MINUTES + 1; // one minute short of the gap
  const gap = build(["B:6", "B:6", `I:${near}`, `I:${near}`, `I:${near}`, `I:${near}`]);
  ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(gap); ok = ok && !out.some((m) => isMixed(gap, m)); }
  assert(`a bumped player must be at least ${MIXED_MATCH_WAIT_GAP_MINUTES} min behind BOTH stuck players`, ok);

  const four = build(["B:9", "B:9", "B:8", "B:8", "I:0", "I:0", "I:0", "I:0"]);
  ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(four, { room: 2 }); ok = ok && out.length === 2 && !out.some((m) => isMixed(four, m)); }
  assert("four of one category waiting play each other (no mixing)", ok);
}

console.log("\n3. Spare slot — nobody loses a place");
{
  const players = build(["B:5", "B:5", "I:5", "I:5"]);
  let ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(players); ok = ok && out.length === 1 && balanced(players, out[0]); }
  assert("2 Beginners + 2 Intermediates waiting, neither can form a four: they play mixed", ok);
  assert("setting off: no match at all for those four", gen(players, { on: false }).length === 0);

  const start = build(["B:0", "B:0", "B:0", "B:0", "B:0", "B:0", "I:0", "I:0", "I:0", "I:0", "I:0", "I:0"]);
  ok = true;
  let everyone = true;
  for (let i = 0; i < REPS; i++) {
    const out = gen(start, { room: 3 });
    ok = ok && out.length === 3 && out.filter((m) => isMixed(start, m)).length === 1 && out.filter((m) => isMixed(start, m)).every((m) => balanced(start, m));
    everyone = everyone && new Set(out.flatMap(ids)).size === 12;
  }
  assert("6 + 6 players, room for 3 matches: two same-category matches and one mixed", ok);
  assert("…and all 12 players are placed, each exactly once", everyone);
  ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(start, { room: 2 }); ok = ok && out.slice(0, 2).every((m) => !isMixed(start, m)); }
  assert("same players, room for only 2: the two same-category matches keep their places", ok);
}

console.log("\n4. Who is picked");
{
  const players = build(["B:15", "B:15", "I:15", "I:14", "I:0", "I:0", "I:0", "I:0"]);
  let ok = true, rest = true;
  for (let i = 0; i < REPS; i++) {
    const out = gen(players, { room: 1 });
    const m = out[0];
    ok = ok && isMixed(players, m) && ids(m).join() === ["B1", "B2", "I3", "I4"].sort().join();
    rest = rest && out.length === 2 && ids(out[1]).join() === ["I5", "I6", "I7", "I8"].join();
  }
  assert("the longest-waiting Intermediates join the stuck Beginners", ok);
  assert("the remaining four Intermediates are re-planned as a normal same-category match behind it", rest);

  const inter = build(["I:12", "I:12", "B:0", "B:0", "B:0", "B:0"]);
  ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(inter); ok = ok && out.length === 1 && balanced(inter, out[0]) && ids(out[0]).includes("I1") && ids(out[0]).includes("I2"); }
  assert("works the other way round: two stuck Intermediates join two Beginners", ok);

  const three = build(["B:12", "B:11", "B:10", "I:0", "I:0", "I:0", "I:0"]);
  ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(three); ok = ok && balanced(three, out[0]) && ids(out[0]).includes("B1") && ids(out[0]).includes("B2") && !ids(out[0]).includes("B3"); }
  assert("a category with only three players in the session: the two who waited longest play mixed", ok);

  // same three waiting, but a fourth Beginner is on court — they wait for that player
  const threeOfFour = build(["B:12", "B:11", "B:10", "I:0", "I:0", "I:0", "I:0", "B:0"]);
  const waitingOnly = Object.keys(threeOfFour).filter((id) => id !== "B8");
  ok = true;
  for (let i = 0; i < REPS; i++) {
    const out = engine.generateMatchups({ waitingIds: waitingOnly, players: threeOfFour, existingMatchups: [], room: 1, resultGrouping: "off", mixedDivisionMatches: true }, true);
    ok = ok && !out.some((m) => isMixed(threeOfFour, m));
  }
  assert("three waiting with a fourth of their category on court: they wait for a same-category four", ok);

  const lone = build(["B:15", "B:15", "I:15", "I:14", "I:13", "I:0", "I:0", "I:0", "I:0"]);
  ok = true;
  for (let i = 0; i < REPS; i++) { const out = gen(lone, { room: 3 }); const placed = new Set(out.flatMap(ids)); ok = ok && ["I3", "I4", "I5"].filter((id) => !placed.has(id)).length !== 1; }
  assert("a mixed match never leaves exactly one long-waiting player of the other category behind", ok);

  const one = build(["B:20", "I:0", "I:0", "I:0", "I:0"]);
  assert("a single stuck player cannot make a balanced mixed match — nothing mixed is built", !gen(one).some((m) => isMixed(one, m)));
}

console.log("\n5. Fixed pairs and room");
{
  const players = build(["B:15", "B:15", "I:0", "I:0", "I:0", "I:0"], { B1: { partnerId: "B2" }, B2: { partnerId: "B1" } });
  let ok = true;
  for (let i = 0; i < REPS; i++) ok = ok && !gen(players).some((m) => isMixed(players, m));
  assert("a fixed pair is never split for a mixed match", ok);

  const pairOther = build(["B:15", "B:15", "I:0", "I:0", "I:0", "I:0"], { I3: { partnerId: "I4" }, I4: { partnerId: "I3" } });
  ok = true;
  for (let i = 0; i < REPS; i++) {
    const m = gen(pairOther)[0];
    ok = ok && balanced(pairOther, m) && !ids(m).includes("I3") && !ids(m).includes("I4");
  }
  assert("the other category's fixed pair is left together; its solo players join instead", ok);

  const noRoom = build(["B:14", "B:13", "I:0", "I:0", "I:0", "I:0"]);
  assert("no room in the queue: no mixed match is proposed", !gen(noRoom, { room: 0 }).some((m) => isMixed(noRoom, m)));
  const reserved = [{ id: "x", teamA: ["I3", "I4"], teamB: ["I5", "I6"] }];
  assert("players already in an upcoming match are never pulled into a mixed one", gen(noRoom, { existingMatchups: reserved }).length === 0);
}

console.log("\n6. Through refreshNextMatchups (what save() calls)");
{
  const players = build(["B:14", "B:13", "I:0", "I:0", "I:0", "I:0"]);
  const courts = [1, 2, 3].map((n) => ({ number: n, status: "live" })).concat([{ number: 4, status: "open" }]);
  const cap = maxUpcomingMatchups(courts);
  const on = refreshNextMatchups(Object.keys(players), players, [], engine, null, cap, null, null, { resultGrouping: "off", mixedDivisionMatches: true });
  assert("a freed court gets the mixed match", on.length === 1 && balanced(players, on[0]));
  const off = refreshNextMatchups(Object.keys(players), players, [], engine, null, cap, null, null, { resultGrouping: "off", mixedDivisionMatches: false });
  assert("off: the freed court gets the Intermediate match", off.length === 1 && !isMixed(players, off[0]));
  const again = refreshNextMatchups(Object.keys(players), players, on, engine, null, cap, null, null, { resultGrouping: "off", mixedDivisionMatches: true });
  assert("an existing mixed match is kept as is on the next refresh", again[0] === on[0]);
}

console.log("\n7. Wiring");
{
  const app = read("src/PickleballOpenPlay.jsx");
  const dlg = read("src/components/SessionSettingsDialog.jsx");
  assert("defaultState.mixedDivisionMatches is on, and new sessions are created with it", defaultState.mixedDivisionMatches === true && /mixedDivisionMatches: defaultState\.mixedDivisionMatches/.test(app));
  assert("save() forwards the setting to the engine as a strict boolean", /mixedDivisionMatches: s\.mixedDivisionMatches === true/.test(app));
  assert("refreshNextMatchups and regenerateNextMatchups pass `room` to the engine", (read("src/lib/utils.js").match(/recentMatchups, room, \.\.\.\(extraContext/g) || []).length === 2);
  assert("Session Settings has the checkbox (Skill Divisions only) and saves it", /Allow mixed matches when players are stuck waiting/.test(dlg) && /mixedDivisionMatches: mixedDivisionDraft/.test(dlg) && /mixedDivisionMatches=\{state\.mixedDivisionMatches\}/.test(read("src/components/ScorerView.jsx")));
  assert("the Next Match card describes a mixed match correctly", /one Beginner and one Intermediate on each team/.test(read("src/components/NextMatchupCard.jsx")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
