// Held Player Reminder — automated, headless, logic-layer coverage. Calls
// the real pure functions directly (holdPlayer, resumePlayer,
// getPlayersNeedingHeldReminder, markHeldReminderShown from
// src/lib/queueManagement.js) — no synthetic reimplementation.
//
// Usage: node scripts/verify-held-player-reminder.mjs
import { holdPlayer, resumePlayer, getPlayersNeedingHeldReminder, markHeldReminderShown } from "../src/lib/queueManagement.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeState(overrides = {}) {
  return {
    players: {
      p1: { id: "p1", name: "Jeffrey", held: false, status: "ACTIVE" },
      p2: { id: "p2", name: "Alice", held: false, status: "ACTIVE" },
    },
    queueIds: ["p1", "p2"],
    nextMatchups: [],
    matchHistory: [],
    queueActivityLog: [],
    heldPlayerReminderSettings: { thresholdMinutes: 20, thresholdRounds: 3, repeatIntervalMinutes: 10 },
    ...overrides,
  };
}

console.log("\n1. holdPlayer sets heldAt/heldAtRound/heldReminderLastShownAt fresh");
{
  const state = makeState({ matchHistory: [{}, {}] }); // 2 completed rounds so far
  const next = holdPlayer(state, "p1");
  assert("held is true", next.players.p1.held === true);
  assert("heldAt is set to (about) now", Math.abs(Date.now() - next.players.p1.heldAt) < 1000);
  assert("heldAtRound captures the current round count (2)", next.players.p1.heldAtRound === 2);
  assert("heldReminderLastShownAt starts null", next.players.p1.heldReminderLastShownAt === null);
}

console.log("\n2. resumePlayer clears all three Held Player Reminder fields");
{
  let state = makeState({ matchHistory: [{}, {}] });
  state = holdPlayer(state, "p1");
  const next = resumePlayer(state, "p1");
  assert("held is false", next.players.p1.held === false);
  assert("heldAt cleared", next.players.p1.heldAt === null);
  assert("heldAtRound cleared", next.players.p1.heldAtRound === null);
  assert("heldReminderLastShownAt cleared", next.players.p1.heldReminderLastShownAt === null);
}

console.log("\n3. getPlayersNeedingHeldReminder — minutes threshold");
{
  const now = Date.now();
  let state = makeState();
  state.players.p1.held = true;
  state.players.p1.heldAt = now - 25 * 60000; // held 25 minutes -- over the 20-minute default
  state.players.p1.heldAtRound = 0;
  state.matchHistory = []; // 0 rounds completed since -- only the minutes threshold should fire
  const due = getPlayersNeedingHeldReminder(state, now);
  assert("Jeffrey (25 min held) is due", due.some((d) => d.playerId === "p1"));
  assert("minutesHeld reported correctly (~25)", due.find((d) => d.playerId === "p1").minutesHeld === 25);
  assert("Alice (not held) is not due", !due.some((d) => d.playerId === "p2"));
}

console.log("\n4. getPlayersNeedingHeldReminder — rounds threshold (whichever fires first)");
{
  const now = Date.now();
  let state = makeState();
  state.players.p1.held = true;
  state.players.p1.heldAt = now - 5 * 60000; // only 5 minutes -- under the minutes threshold
  state.players.p1.heldAtRound = 0;
  state.matchHistory = [{}, {}, {}]; // 3 rounds completed since -- meets the rounds threshold
  const due = getPlayersNeedingHeldReminder(state, now);
  assert("Jeffrey is due via the ROUNDS threshold even though minutes threshold isn't met", due.some((d) => d.playerId === "p1"));
  assert("roundsHeld reported correctly (3)", due.find((d) => d.playerId === "p1").roundsHeld === 3);
}

console.log("\n5. getPlayersNeedingHeldReminder — under both thresholds is NOT due");
{
  const now = Date.now();
  let state = makeState();
  state.players.p1.held = true;
  state.players.p1.heldAt = now - 5 * 60000;
  state.players.p1.heldAtRound = 0;
  state.matchHistory = [{}]; // 1 round -- under both thresholds
  const due = getPlayersNeedingHeldReminder(state, now);
  assert("not due yet", !due.some((d) => d.playerId === "p1"));
}

console.log("\n6. getPlayersNeedingHeldReminder — repeat interval gate");
{
  const now = Date.now();
  let state = makeState();
  state.players.p1.held = true;
  state.players.p1.heldAt = now - 25 * 60000;
  state.players.p1.heldAtRound = 0;
  state.players.p1.heldReminderLastShownAt = now - 5 * 60000; // shown 5 min ago -- under the 10-min repeat interval
  const due = getPlayersNeedingHeldReminder(state, now);
  assert("not due again yet (within repeat interval)", !due.some((d) => d.playerId === "p1"));

  state.players.p1.heldReminderLastShownAt = now - 11 * 60000; // 11 min ago -- past the repeat interval
  const dueAgain = getPlayersNeedingHeldReminder(state, now);
  assert("due again once the repeat interval has elapsed", dueAgain.some((d) => d.playerId === "p1"));
}

console.log("\n7. getPlayersNeedingHeldReminder — configurable thresholds are actually read from state");
{
  const now = Date.now();
  let state = makeState({ heldPlayerReminderSettings: { thresholdMinutes: 5, thresholdRounds: 1, repeatIntervalMinutes: 2 } });
  state.players.p1.held = true;
  state.players.p1.heldAt = now - 6 * 60000; // 6 min -- over the CONFIGURED 5-minute threshold (would not be due under the 20-min default)
  state.players.p1.heldAtRound = 0;
  const due = getPlayersNeedingHeldReminder(state, now);
  assert("configured (lower) threshold is honored, not the hardcoded default", due.some((d) => d.playerId === "p1"));
}

console.log("\n8. markHeldReminderShown — updates heldReminderLastShownAt and logs a Queue Activity Log entry");
{
  let state = makeState({ matchHistory: [{}, {}, {}] });
  state = holdPlayer(state, "p1");
  const before = state;
  const next = markHeldReminderShown(state, "p1", { minutesHeld: 22, roundsHeld: 3 });
  assert("heldReminderLastShownAt is now set", typeof next.players.p1.heldReminderLastShownAt === "number");
  assert("a new queueActivityLog entry was added", next.queueActivityLog.length === before.queueActivityLog.length + 1);
  const entry = next.queueActivityLog[0];
  assert("entry kind is heldPlayerReminder", entry.kind === "heldPlayerReminder");
  assert("entry has playerId/playerName/minutesHeld/roundsHeld/timestamp", entry.playerId === "p1" && entry.playerName === "Jeffrey" && entry.minutesHeld === 22 && entry.roundsHeld === 3 && typeof entry.timestamp === "number");
}

console.log("\n9. markHeldReminderShown — no-op if the player isn't actually held");
{
  const state = makeState(); // p1.held === false
  const next = markHeldReminderShown(state, "p1", { minutesHeld: 22, roundsHeld: 3 });
  assert("returns the exact same state reference", next === state);
}

console.log("\n10. Full lifecycle — hold -> due -> shown (logged, gated for repeat interval) -> resume clears everything");
{
  const now = Date.now();
  let state = makeState();
  state = holdPlayer(state, "p1");
  state.players.p1.heldAt = now - 21 * 60000; // simulate 21 minutes having passed since the hold
  let due = getPlayersNeedingHeldReminder(state, now);
  assert("due after 21 minutes (over the 20-min default)", due.some((d) => d.playerId === "p1"));

  state = markHeldReminderShown(state, "p1", { minutesHeld: 21, roundsHeld: 0 });
  due = getPlayersNeedingHeldReminder(state, now);
  assert("not due again immediately after being shown (repeat interval not yet elapsed)", !due.some((d) => d.playerId === "p1"));
  assert("exactly one activity log entry so far", state.queueActivityLog.filter((e) => e.kind === "heldPlayerReminder").length === 1);

  state = resumePlayer(state, "p1");
  assert("no longer held after Resume", state.players.p1.held === false);
  due = getPlayersNeedingHeldReminder(state, now);
  assert("not due at all once resumed", !due.some((d) => d.playerId === "p1"));
}

console.log("\n11. markHeldReminderShown never touches queueIds/nextMatchups/skill/games — cannot affect matchmaking or priority");
{
  const now = Date.now();
  let state = makeState({ matchHistory: [{}, {}, {}, {}] });
  state.players.p1.skill = "beginner";
  state.players.p1.games = 4;
  state = holdPlayer(state, "p1"); // holdPlayer's own (pre-existing, unrelated) effect on nextMatchups happens here
  state.players.p1.heldAt = now - 25 * 60000;
  // snapshot AFTER holdPlayer, so this isolates markHeldReminderShown's own effect only
  const originalQueueIds = state.queueIds;
  const originalNextMatchups = state.nextMatchups;
  const next = markHeldReminderShown(state, "p1", { minutesHeld: 25, roundsHeld: 4 });
  assert("queueIds reference unchanged", next.queueIds === originalQueueIds);
  assert("nextMatchups reference unchanged", next.nextMatchups === originalNextMatchups);
  assert("player's skill untouched", next.players.p1.skill === "beginner");
  assert("player's games untouched", next.players.p1.games === 4);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
