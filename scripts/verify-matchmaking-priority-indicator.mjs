// Persistent Matchmaking Priority Indicator — automated, headless coverage
// of the label lookup ScorerView.jsx's new Session Information row uses
// (same MATCHMAKING_PRIORITIES.find(...) pattern rotationModeLabel already
// uses for Rotation Mode, tested here directly rather than via JSX
// rendering — same "test the pure logic" precedent as every other *View.jsx
// in this repo). Confirms visibility-only: no priority/queue-sorting logic
// exists here at all, only a label string derivation.
//
// Usage: node scripts/verify-matchmaking-priority-indicator.mjs
import { MATCHMAKING_PRIORITIES } from "../src/lib/constants.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

// The exact expression ScorerView.jsx computes matchmakingPriorityLabel with.
function matchmakingPriorityLabel(matchmakingPriority) {
  return matchmakingPriority
    ? MATCHMAKING_PRIORITIES.find((p) => p.value === matchmakingPriority)?.label || matchmakingPriority
    : null;
}

console.log("\nmatchmakingPriorityLabel — every real MATCHMAKING_PRIORITIES value resolves to its own label");
{
  for (const { value, label } of MATCHMAKING_PRIORITIES) {
    assert(`"${value}" resolves to "${label}"`, matchmakingPriorityLabel(value) === label);
  }
}

console.log("\nmatchmakingPriorityLabel — null (no priority set) means no indicator, updates when the setting changes");
{
  assert("null -> no label (the indicator doesn't render at all)", matchmakingPriorityLabel(null) === null);
  assert("empty string (Session Settings' own \"None\" option value) -> no label", matchmakingPriorityLabel("") === null);
  // Changing the setting is just changing this input value — the label
  // recomputes fresh from state.matchmakingPriority every render, no
  // separate stored/cached label to go stale.
  assert("changing from one real priority to another updates the resolved label", (
    matchmakingPriorityLabel("longestWaiting") === "Longest Waiting Time" &&
    matchmakingPriorityLabel("leastGamesPlayed") === "Least Games Played"
  ));
}

console.log("\nmatchmakingPriorityLabel — an unrecognized value falls back to the raw value string, never crashes (same convention as rotationModeLabel)");
{
  assert("an unknown priority value falls back to itself rather than throwing/guessing", matchmakingPriorityLabel("somethingNew") === "somethingNew");
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
