// Pre-Check-In Skill Correction — automated, headless, logic-layer
// coverage. Calls the real pure functions directly (setPreCheckInSkill,
// changePlayerSkill from src/lib/utils.js, getRotationEngine/
// refreshNextMatchups for the Adaptive Skill Rotation check) — no
// synthetic reimplementation.
//
// Usage: node scripts/verify-pre-checkin-skill.mjs
import {
  setPreCheckInSkill,
  changePlayerSkill,
  getRotationEngine,
  refreshNextMatchups,
} from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeState(overrides = {}) {
  return {
    players: {
      p1: { id: "p1", name: "Juan Dela Cruz", skill: "beginner", checkedIn: false, checkedInAt: null, games: 0 },
      p2: { id: "p2", name: "Maria Reyes", skill: "intermediate", checkedIn: false, checkedInAt: null, games: 0 },
    },
    queueIds: [],
    nextMatchups: [],
    skillChangeLog: [],
    ...overrides,
  };
}

console.log("\nA. Beginner can be changed to Intermediate before check-in");
{
  const state = makeState();
  const next = setPreCheckInSkill(state, "p1", "intermediate");
  assert("p1 is now intermediate", next.players.p1.skill === "intermediate");
}

console.log("\nB. Intermediate can be changed to Beginner before check-in");
{
  const state = makeState();
  const next = setPreCheckInSkill(state, "p2", "beginner");
  assert("p2 is now beginner", next.players.p2.skill === "beginner");
}

console.log("\nC. The changed skill persists after check-in");
{
  let state = makeState();
  state = setPreCheckInSkill(state, "p1", "intermediate");
  // simulate checkInExisting (PickleballOpenPlay.jsx) — sets checkedIn/checkedInAt only
  const players = { ...state.players, p1: { ...state.players.p1, checkedIn: true, checkedInAt: Date.now() } };
  state = { ...state, players, queueIds: ["p1"] };
  assert("p1 is checked in", state.players.p1.checkedIn === true);
  assert("p1's skill is still intermediate after check-in", state.players.p1.skill === "intermediate");
}

console.log("\nD. Adaptive Skill Rotation uses the changed skill in the correct division");
{
  let state = makeState({
    players: {
      p1: { id: "p1", name: "Juan", skill: "beginner", checkedIn: false, checkedInAt: null, games: 0 },
      b1: { id: "b1", name: "Beg1", skill: "beginner", checkedIn: true, checkedInAt: Date.now(), games: 0 },
      i1: { id: "i1", name: "Int1", skill: "intermediate", checkedIn: true, checkedInAt: Date.now(), games: 0 },
      i2: { id: "i2", name: "Int2", skill: "intermediate", checkedIn: true, checkedInAt: Date.now(), games: 0 },
      i3: { id: "i3", name: "Int3", skill: "intermediate", checkedIn: true, checkedInAt: Date.now(), games: 0 },
    },
  });
  // correct p1 to Intermediate BEFORE check-in, then check in
  state = setPreCheckInSkill(state, "p1", "intermediate");
  const players = { ...state.players, p1: { ...state.players.p1, checkedIn: true, checkedInAt: Date.now() } };
  const queueIds = ["p1", "b1", "i1", "i2", "i3"];
  const engine = getRotationEngine("adaptiveSkill");
  const matchups = refreshNextMatchups(queueIds, players, [], engine, null);
  assert("at least one matchup was generated", matchups.length > 0);
  const p1Matchup = matchups.find((m) => [...m.teamA, ...m.teamB].includes("p1"));
  assert("p1 was placed into a matchup", !!p1Matchup);
  if (p1Matchup) {
    const ids = [...p1Matchup.teamA, ...p1Matchup.teamB];
    const allIntermediate = ids.every((id) => players[id].skill === "intermediate");
    assert("p1's matchup is entirely Intermediate (corrected skill honored, not the old Beginner)", allIntermediate);
  }
}

console.log("\nE. Pre-check-in changes do not create promotion/relegation statistics");
{
  const state = makeState();
  const next = setPreCheckInSkill(state, "p1", "intermediate");
  assert("skillChangeLog is untouched (same reference)", next.skillChangeLog === state.skillChangeLog);
  assert("skillChangeLog stays empty", next.skillChangeLog.length === 0);
}

console.log("\nF. Pre-check-in changes do not modify streaks");
{
  const state = makeState({
    players: {
      p1: { id: "p1", name: "Juan", skill: "beginner", checkedIn: false, checkedInAt: null, games: 0, streak: 2, lossStreak: 1 },
    },
  });
  const next = setPreCheckInSkill(state, "p1", "intermediate");
  assert("streak untouched", next.players.p1.streak === 2);
  assert("lossStreak untouched", next.players.p1.lossStreak === 1);
}

console.log("\nG. Existing mid-session manual skill changes continue working (changePlayerSkill untouched)");
{
  let state = makeState({
    players: {
      p1: { id: "p1", name: "Juan", skill: "beginner", checkedIn: true, checkedInAt: Date.now(), games: 3, streak: 2, lossStreak: 0 },
    },
  });
  const next = changePlayerSkill(state, "p1", "intermediate");
  assert("skill changed", next.players.p1.skill === "intermediate");
  assert("streak reset by the in-session path (unlike pre-check-in)", next.players.p1.streak === 0);
  assert("a skillChangeLog entry was recorded (unlike pre-check-in)", next.skillChangeLog.length === 1);
  assert("logged entry source is manual", next.skillChangeLog[0].source === "manual");
}

console.log("\nH. Other rotation modes are unaffected — pre-check-in skill correction is plain roster data");
{
  const state = makeState();
  const next = setPreCheckInSkill(state, "p1", "intermediate");
  // Balanced/Progressive/Winner Pool rotation don't read `skill` for matchmaking,
  // but the field must still update correctly and cleanly regardless of mode —
  // no rotation-mode-specific branching exists (or should exist) in setPreCheckInSkill.
  assert("skill field updates the same way regardless of rotation mode context", next.players.p1.skill === "intermediate");
  assert("no side-channel state (nextMatchups/queueIds/skillChangeLog) was touched",
    next.nextMatchups === state.nextMatchups && next.queueIds === state.queueIds && next.skillChangeLog === state.skillChangeLog);
}

console.log("\nGuard: no-op once the player is already checked in (must use the in-session path instead)");
{
  const state = makeState({
    players: {
      p1: { id: "p1", name: "Juan", skill: "beginner", checkedIn: true, checkedInAt: Date.now(), games: 0 },
    },
  });
  const next = setPreCheckInSkill(state, "p1", "intermediate");
  assert("returns the exact same state reference (no-op)", next === state);
}

console.log("\nGuard: no-op for an invalid/unchanged skill value");
{
  const state = makeState();
  assert("no-op for an unknown skill string", setPreCheckInSkill(state, "p1", "advanced") === state);
  assert("no-op when the skill is already that value", setPreCheckInSkill(state, "p1", "beginner") === state);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
