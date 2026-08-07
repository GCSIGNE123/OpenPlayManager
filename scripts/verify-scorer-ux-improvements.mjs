// Scorer UX Improvements — End Match Early continues waiting time,
// Substitute Right Away — automated, headless coverage. Calls the real
// pure function directly (nextLastMatchEndAt, src/lib/utils.js) — no
// synthetic reimplementation. The "Substitute Right Away" UI change
// (PlayerPicker's onSelect firing the swap immediately, no Confirm button)
// is a pure interaction-flow change with no separate pure-function surface
// to unit-test — see TESTING.md for its live-browser verification.
//
// Usage: node scripts/verify-scorer-ux-improvements.mjs
import { nextLastMatchEndAt } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

const now = Date.now();

console.log("\nEnd Match Early — an early-ended match (court never reached 'finished') preserves the player's prior lastMatchEndAt");
{
  const oldWait = now - 40 * 60000;
  const player = { id: "p1", name: "Juan", lastMatchEndAt: oldWait };
  const result = nextLastMatchEndAt(player, now, true);
  assert("returns the player's ORIGINAL lastMatchEndAt, not the new matchEndedAt", result === oldWait);
  assert("does NOT return the just-passed matchEndedAt", result !== now);
}

console.log("\nA normally-completed match (court already 'finished') resets lastMatchEndAt to right now");
{
  const oldWait = now - 40 * 60000;
  const player = { id: "p1", name: "Juan", lastMatchEndAt: oldWait };
  const result = nextLastMatchEndAt(player, now, false);
  assert("returns the fresh matchEndedAt", result === now);
  assert("does not return the stale prior value", result !== oldWait);
}

console.log("\nA player who's never played before (no prior lastMatchEndAt) — early end leaves it null/undefined, not a fabricated timestamp");
{
  const player = { id: "p1", name: "Juan" }; // no lastMatchEndAt at all yet
  const result = nextLastMatchEndAt(player, now, true);
  assert("stays undefined (untouched) rather than being set to anything", result === undefined);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
