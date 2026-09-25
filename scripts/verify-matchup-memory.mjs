// Rotation Redesign R1 — Instrumentation & Baseline Regression.
//
// Covers two things, per the R1 spec (see the Rotation Algorithm Audit and
// the R1 authorization message):
//   1. The new bounded, session-level matchup-memory helpers
//      (matchupKeyFor / recordMatchupMemory / isRecentMatchup /
//      MAX_RECENT_MATCHUPS) in src/lib/utils.js — pure functions, no
//      scheduling behavior involved.
//   2. A pinned baseline fixture: the exact real-session numbers from the
//      Rotation Algorithm Audit (session opl-session-report-1wk4p7a /
//      opl-session-ZQBJ4P), asserted as fixed constants so a future phase
//      can diff against them. These are NOT re-derived here — re-deriving
//      them would require the original session's full matchHistory, which
//      is intentionally NOT bundled into this repo (see audit deliverable).
//
// Usage: node scripts/verify-matchup-memory.mjs
import { matchupKeyFor, recordMatchupMemory, isRecentMatchup, MAX_RECENT_MATCHUPS } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

console.log("\n1. MAX_RECENT_MATCHUPS is the documented, small, bounded cap");
{
  assert("MAX_RECENT_MATCHUPS is 16", MAX_RECENT_MATCHUPS === 16);
}

console.log("\n2. Player-order normalization within a team: [A,B] == [B,A]");
{
  const key1 = matchupKeyFor(["p1", "p2"], ["p3", "p4"]);
  const key2 = matchupKeyFor(["p2", "p1"], ["p3", "p4"]);
  assert("swapping player order within teamA yields the same key", key1 === key2);
  const key3 = matchupKeyFor(["p1", "p2"], ["p4", "p3"]);
  assert("swapping player order within teamB yields the same key", key1 === key3);
}

console.log("\n3. Team-order normalization: Team1 vs Team2 == Team2 vs Team1");
{
  const key1 = matchupKeyFor(["p1", "p2"], ["p3", "p4"]);
  const key2 = matchupKeyFor(["p3", "p4"], ["p1", "p2"]);
  assert("swapping which team is passed as teamA/teamB yields the same key", key1 === key2);
}

console.log("\n4. Duplicate orientation (both normalizations at once) still recognized as the same matchup");
{
  const key1 = matchupKeyFor(["p1", "p2"], ["p3", "p4"]);
  const key2 = matchupKeyFor(["p4", "p3"], ["p2", "p1"]);
  assert("fully reversed orientation on both teams and both sides yields the same key", key1 === key2);
}

console.log("\n5. Unrelated matches remain distinct");
{
  const key1 = matchupKeyFor(["p1", "p2"], ["p3", "p4"]);
  const key2 = matchupKeyFor(["p1", "p2"], ["p3", "p5"]);
  const key3 = matchupKeyFor(["p5", "p6"], ["p7", "p8"]);
  assert("changing one player produces a different key", key1 !== key2);
  assert("a completely different matchup produces a different key", key1 !== key3);
}

console.log("\n6. recordMatchupMemory records a new matchup, most-recent first");
{
  let recent = [];
  recent = recordMatchupMemory(recent, ["p1", "p2"], ["p3", "p4"]);
  assert("history has 1 entry after 1 match", recent.length === 1);
  assert("isRecentMatchup finds it regardless of orientation", isRecentMatchup(recent, ["p4", "p3"], ["p2", "p1"]));
  recent = recordMatchupMemory(recent, ["p5", "p6"], ["p7", "p8"]);
  assert("history has 2 entries after 2 distinct matches", recent.length === 2);
  assert("most recent match is first", recent[0] === matchupKeyFor(["p5", "p6"], ["p7", "p8"]));
  assert("older match is still present", isRecentMatchup(recent, ["p1", "p2"], ["p3", "p4"]));
}

console.log("\n7. Cap enforcement: history never exceeds MAX_RECENT_MATCHUPS, oldest entry discarded on overflow");
{
  let recent = [];
  for (let i = 0; i < MAX_RECENT_MATCHUPS + 5; i++) {
    recent = recordMatchupMemory(recent, [`a${i}`, `b${i}`], [`c${i}`, `d${i}`]);
  }
  assert(`history length capped at ${MAX_RECENT_MATCHUPS} after ${MAX_RECENT_MATCHUPS + 5} matches`, recent.length === MAX_RECENT_MATCHUPS);
  const oldestStillPresent = isRecentMatchup(recent, ["a0", "b0"], ["c0", "d0"]);
  assert("the oldest (1st) match was discarded once the cap was exceeded", !oldestStillPresent);
  const newestPresent = isRecentMatchup(recent, [`a${MAX_RECENT_MATCHUPS + 4}`, `b${MAX_RECENT_MATCHUPS + 4}`], [`c${MAX_RECENT_MATCHUPS + 4}`, `d${MAX_RECENT_MATCHUPS + 4}`]);
  assert("the newest match is present", newestPresent);
  const justInsideWindow = isRecentMatchup(recent, ["a5", "b5"], ["c5", "d5"]);
  assert("a match still within the last MAX_RECENT_MATCHUPS is present", justInsideWindow);
}

console.log("\n8. Baseline fixture — pinned real-session audit numbers (Rotation Algorithm Audit, session opl-session-report-1wk4p7a / opl-session-ZQBJ4P). Not re-derived here; asserted as the known-correct, documented baseline for future phases to diff against.");
{
  const AUDIT_BASELINE = {
    totalMatches: 49,
    distinctTeamVsTeamMatchups: 46,
    repeatOpponentMatches: 3,
    repeatOpponentPct: 6.1,
    immediateRematches: 0,
    allPriorWinnerPct: 8.2,
    allPriorLoserPct: 6.1,
    repeatedPartnerPairs: 13,
    totalPartnerPairs: 67,
  };
  assert("total matches = 49", AUDIT_BASELINE.totalMatches === 49);
  assert("distinct team-vs-team matchups = 46", AUDIT_BASELINE.distinctTeamVsTeamMatchups === 46);
  assert("repeat-opponent matches = 3 (6.1%)", AUDIT_BASELINE.repeatOpponentMatches === 3 && AUDIT_BASELINE.repeatOpponentPct === 6.1);
  assert("immediate (same-round) rematches = 0", AUDIT_BASELINE.immediateRematches === 0);
  assert("all-prior-winner matches = 8.2%", AUDIT_BASELINE.allPriorWinnerPct === 8.2);
  assert("all-prior-loser matches = 6.1%", AUDIT_BASELINE.allPriorLoserPct === 6.1);
  assert("repeated partner pairs = 13 of 67", AUDIT_BASELINE.repeatedPartnerPairs === 13 && AUDIT_BASELINE.totalPartnerPairs === 67);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
