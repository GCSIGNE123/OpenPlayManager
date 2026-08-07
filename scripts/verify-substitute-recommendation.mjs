// Substitute Recommendation — automated, headless coverage. Calls the
// real pure function directly (getRecommendedSubstitutes, src/lib/utils.js)
// — no synthetic reimplementation.
//
// Usage: node scripts/verify-substitute-recommendation.mjs
import { getRecommendedSubstitutes } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

const now = Date.now();

console.log("\nRecommends the longest-waiting players first (by lastMatchEndAt)");
{
  const waiting = [
    { id: "p1", name: "Recent", lastMatchEndAt: now - 2 * 60000 },
    { id: "p2", name: "Aileen", lastMatchEndAt: now - 30 * 60000 },
    { id: "p3", name: "Middle", lastMatchEndAt: now - 10 * 60000 },
  ];
  const recs = getRecommendedSubstitutes(waiting, 3);
  assert("Aileen (longest wait) is recommended first", recs[0] === "p2");
  assert("Middle is second", recs[1] === "p3");
  assert("Recent is third", recs[2] === "p1");
}

console.log("\nFalls back to checkedInAt for a player who hasn't played yet");
{
  const waiting = [
    { id: "p1", name: "Played", lastMatchEndAt: now - 5 * 60000, checkedInAt: now - 60 * 60000 },
    { id: "p2", name: "NeverPlayed", checkedInAt: now - 20 * 60000 },
  ];
  const recs = getRecommendedSubstitutes(waiting, 2);
  // p1's real wait clock is lastMatchEndAt (5 min ago) not checkedInAt (60 min ago) — NeverPlayed (20 min) waited longer
  assert("never-played player (20 min via checkedInAt) ranked ahead of a recently-finished player (5 min)", recs[0] === "p2");
}

console.log("\nNever recommends a held player, no matter how long they've waited");
{
  const waiting = [
    { id: "p1", name: "HeldLongest", lastMatchEndAt: now - 120 * 60000, held: true },
    { id: "p2", name: "Aileen", lastMatchEndAt: now - 30 * 60000, held: false },
  ];
  const recs = getRecommendedSubstitutes(waiting, 3);
  assert("the held player is never recommended despite waiting far longer", !recs.includes("p1"));
  assert("the non-held player is recommended instead", recs.includes("p2"));
  assert("only 1 recommendation returned (only 1 eligible candidate)", recs.length === 1);
}

console.log("\nCaps at the requested count (default 3)");
{
  const waiting = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, lastMatchEndAt: now - i * 60000 }));
  const recs = getRecommendedSubstitutes(waiting);
  assert("returns exactly 3 by default", recs.length === 3);
  const recsCustom = getRecommendedSubstitutes(waiting, 5);
  assert("respects a custom count", recsCustom.length === 5);
}

console.log("\nGuards: empty/undefined input");
{
  assert("empty array returns empty", getRecommendedSubstitutes([]).length === 0);
  assert("undefined input returns empty, no crash", getRecommendedSubstitutes(undefined).length === 0);
}

console.log("\nDoes not mutate the input array");
{
  const waiting = [
    { id: "p1", name: "B", lastMatchEndAt: now - 5 * 60000 },
    { id: "p2", name: "A", lastMatchEndAt: now - 50 * 60000 },
  ];
  const original = [...waiting];
  getRecommendedSubstitutes(waiting, 2);
  assert("original array order is untouched", waiting[0].id === original[0].id && waiting[1].id === original[1].id);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
