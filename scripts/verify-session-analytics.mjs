// Session Analytics Engine (Sprint 4A) — automated, headless, logic-layer
// coverage. Calls the real pure functions directly (applyWaitingTimeTracking,
// computeSessionAnalyticsReport, gradeLabelForScore from
// src/lib/sessionAnalytics.js) — no synthetic reimplementation.
//
// Usage: node scripts/verify-session-analytics.mjs
import {
  applyWaitingTimeTracking,
  computeSessionAnalyticsReport,
  gradeLabelForScore,
  SESSION_GRADE_BANDS,
  SESSION_GRADE_WEIGHTS,
} from "../src/lib/sessionAnalytics.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayer(id, overrides = {}) {
  return {
    id, name: `Player ${id}`, skill: "beginner", games: 0, checkedInAt: 0,
    partnerCounts: {}, opponentCounts: {},
    totalWaitMs: 0, longestWaitMs: 0, waitPeriodsCount: 0, currentPlayStreak: 0, longestPlayStreak: 0,
    ...overrides,
  };
}

console.log("\n1. applyWaitingTimeTracking — basic accumulation");
{
  const now = 1_000_000;
  const players = { p1: makePlayer("p1", { checkedInAt: now - 10 * 60000 }) };
  const prevCourts = [{ number: 1, status: "open", teamA: [], teamB: [] }];
  const nextCourts = [{ number: 1, status: "live", teamA: ["p1"], teamB: [], }];
  const updated = applyWaitingTimeTracking(prevCourts, nextCourts, players, now);
  assert("p1's totalWaitMs reflects the 10-minute wait", updated.p1.totalWaitMs === 10 * 60000);
  assert("p1's longestWaitMs matches", updated.p1.longestWaitMs === 10 * 60000);
  assert("p1's waitPeriodsCount is 1", updated.p1.waitPeriodsCount === 1);
  assert("p1's longestPlayStreak starts at 1 (real wait preceded it)", updated.p1.longestPlayStreak === 1);
}

console.log("\n2. applyWaitingTimeTracking — no-op when nobody newly transitions");
{
  const now = 1_000_000;
  const players = { p1: makePlayer("p1", { checkedInAt: now - 5 * 60000 }) };
  const courts = [{ number: 1, status: "live", teamA: ["p1"], teamB: [] }];
  // p1 already on a live court both before and after -- not a new transition
  const updated = applyWaitingTimeTracking(courts, courts, players, now);
  assert("returns the exact same players reference (no spurious update)", updated === players);
}

console.log("\n3. applyWaitingTimeTracking — dispatching counts as no-longer-waiting");
{
  const now = 1_000_000;
  const players = { p1: makePlayer("p1", { checkedInAt: now - 3 * 60000 }) };
  const prevCourts = [{ number: 1, status: "open", teamA: [], teamB: [] }];
  const nextCourts = [{ number: 1, status: "dispatching", teamA: ["p1"], teamB: [] }];
  const updated = applyWaitingTimeTracking(prevCourts, nextCourts, players, now);
  assert("wait period ends at 'dispatching', not only 'live'", updated.p1.waitPeriodsCount === 1);
}

console.log("\n4. applyWaitingTimeTracking — consecutive play streak vs. a real wait");
{
  let now = 1_000_000;
  let players = { p1: makePlayer("p1", { checkedInAt: now - 30000 }) }; // 30s -- under the no-real-wait threshold
  let prevCourts = [{ number: 1, status: "open", teamA: [], teamB: [] }];
  let nextCourts = [{ number: 1, status: "live", teamA: ["p1"], teamB: [] }];
  players = applyWaitingTimeTracking(prevCourts, nextCourts, players, now);
  assert("first transition (short wait) still counts as streak 1", players.p1.longestPlayStreak === 1);

  // p1 finishes, immediately regroups onto another court with <1min gap (pooling-style)
  players.p1 = { ...players.p1, lastMatchEndAt: now };
  now += 20000; // 20s later, another instant regroup
  prevCourts = [{ number: 2, status: "open", teamA: [], teamB: [] }];
  nextCourts = [{ number: 2, status: "live", teamA: ["p1"], teamB: [] }];
  players = applyWaitingTimeTracking(prevCourts, nextCourts, players, now);
  assert("a sub-1-minute gap extends the play streak instead of resetting it", players.p1.longestPlayStreak === 2);

  // now a REAL wait (5 minutes) breaks the streak
  players.p1 = { ...players.p1, lastMatchEndAt: now };
  now += 5 * 60000;
  prevCourts = [{ number: 3, status: "open", teamA: [], teamB: [] }];
  nextCourts = [{ number: 3, status: "live", teamA: ["p1"], teamB: [] }];
  players = applyWaitingTimeTracking(prevCourts, nextCourts, players, now);
  assert("a real wait resets currentPlayStreak to 1", players.p1.currentPlayStreak === 1);
  assert("but longestPlayStreak still remembers the earlier streak of 2", players.p1.longestPlayStreak === 2);
}

console.log("\n5. computeSessionAnalyticsReport — participation stats");
{
  const players = {
    p1: makePlayer("p1", { games: 8 }),
    p2: makePlayer("p2", { games: 6 }),
    p3: makePlayer("p3", { games: 4 }),
    p4: makePlayer("p4", { games: 0, checkedInAt: null }), // never checked in -- excluded
  };
  const state = { players, courts: [{}, {}], rotationMode: "continuous", venue: "Test Session", sessionStartedAt: Date.now() - 3600000 };
  const report = computeSessionAnalyticsReport(state);
  assert("only checked-in players count toward participation", report.sessionSummary.playersCount === 3);
  assert("averageGames is (8+6+4)/3 = 6", report.participation.averageGames === 6);
  assert("highestGames is 8", report.participation.highestGames === 8);
  assert("lowestGames is 4", report.participation.lowestGames === 4);
  assert("gamesFairnessScore is between 0 and 100", report.participation.gamesFairnessScore >= 0 && report.participation.gamesFairnessScore <= 100);
  assert("adaptive section is null for a non-adaptive rotation mode", report.adaptive === null);
}

console.log("\n6. computeSessionAnalyticsReport — waiting stats");
{
  const players = {
    p1: makePlayer("p1", { games: 2, totalWaitMs: 20 * 60000, waitPeriodsCount: 2, longestWaitMs: 15 * 60000 }),
    p2: makePlayer("p2", { games: 2, totalWaitMs: 10 * 60000, waitPeriodsCount: 2, longestWaitMs: 8 * 60000 }),
  };
  const state = { players, courts: [{}], rotationMode: "continuous", sessionStartedAt: Date.now() - 1000 };
  const report = computeSessionAnalyticsReport(state);
  assert("longestWaitMinutes picks the max across players (15 min)", report.waiting.longestWaitMinutes === 15);
  assert("averageWaitMinutes is the mean of each player's own average (10 and 5 -> 7.5)", report.waiting.averageWaitMinutes === 7.5);
}

console.log("\n7. computeSessionAnalyticsReport — diversity stats reuse partnerCounts/opponentCounts");
{
  const players = {
    p1: makePlayer("p1", { games: 4, partnerCounts: { a: 1, b: 1, c: 2 }, opponentCounts: { x: 1, y: 1, z: 1, w: 1 } }),
    p2: makePlayer("p2", { games: 4, partnerCounts: { a: 4 }, opponentCounts: { x: 4, y: 4 } }),
  };
  const state = { players, courts: [{}], rotationMode: "continuous", sessionStartedAt: Date.now() - 1000 };
  const report = computeSessionAnalyticsReport(state);
  assert("averageUniquePartners is (3+1)/2 = 2", report.diversity.averageUniquePartners === 2);
  assert("averageUniqueOpponents is (4+2)/2 = 3", report.diversity.averageUniqueOpponents === 3);
}

console.log("\n8. computeSessionAnalyticsReport — Adaptive Skill Analysis, only when rotationMode is adaptiveSkill, manual vs automatic distinguished by `source`");
{
  const players = { p1: makePlayer("p1", { games: 3 }) };
  const skillChangeLog = [
    { newSkill: "intermediate", source: "automatic" },
    { newSkill: "beginner", source: "automatic" },
    { newSkill: "intermediate", source: "manual" },
    { newSkill: "beginner", reason: "Manual override" }, // legacy entry, no `source` field, falls back to reason text
    { newSkill: "intermediate", reason: "3 consecutive wins" }, // legacy automatic entry, no `source` field
  ];
  const state = { players, courts: [{}], rotationMode: "adaptiveSkill", skillChangeLog, sessionStartedAt: Date.now() - 1000 };
  const report = computeSessionAnalyticsReport(state);
  assert("adaptive section present for adaptiveSkill rotation mode", report.adaptive !== null);
  assert("promotions counts newSkill === intermediate (3)", report.adaptive.promotions === 3);
  assert("relegations counts newSkill === beginner (2)", report.adaptive.relegations === 2);
  assert("automaticChanges counts source==='automatic' plus the legacy 'consecutive' fallback (3)", report.adaptive.automaticChanges === 3);
  assert("manualChanges counts source==='manual' plus the legacy 'Manual override' fallback (2)", report.adaptive.manualChanges === 2);
}

console.log("\n9. Players Needing Attention — explainable threshold flags");
{
  const players = {
    p1: makePlayer("p1", { name: "Alice", games: 8, checkedInAt: 0 }),
    p2: makePlayer("p2", { name: "Bob", games: 2, checkedInAt: 0, longestWaitMs: 20 * 60000, waitPeriodsCount: 1, totalWaitMs: 20 * 60000 }),
    p3: makePlayer("p3", { name: "Cleo", games: 6, checkedInAt: 0, longestPlayStreak: 5 }),
  };
  const state = { players, courts: [{}], rotationMode: "continuous", sessionStartedAt: Date.now() - 1000 };
  const report = computeSessionAnalyticsReport(state);
  const names = report.playersNeedingAttention.map((p) => p.playerName);
  assert("Bob (fewest games AND longest wait) is flagged", names.includes("Bob"));
  assert("Cleo (longest consecutive playing streak) is flagged", names.includes("Cleo"));
  assert("Alice (no notable issue) is not flagged", !names.includes("Alice"));
  const bob = report.playersNeedingAttention.find((p) => p.playerName === "Bob");
  assert("Bob has more than one reason listed", bob.reasons.length >= 2);
}

console.log("\n10. Session Grade — extensible weights/bands, not a hardcoded inline formula");
{
  assert("SESSION_GRADE_WEIGHTS sums to 1 (a real weighted average)", Math.abs(Object.values(SESSION_GRADE_WEIGHTS).reduce((s, w) => s + w, 0) - 1) < 1e-9);
  assert("gradeLabelForScore(96) is Excellent", gradeLabelForScore(96) === "Excellent");
  assert("gradeLabelForScore(92) is Very Good", gradeLabelForScore(92) === "Very Good");
  assert("gradeLabelForScore(85) is Good", gradeLabelForScore(85) === "Good");
  assert("gradeLabelForScore(75) is Fair", gradeLabelForScore(75) === "Fair");
  assert("gradeLabelForScore(50) is Needs Improvement", gradeLabelForScore(50) === "Needs Improvement");
  assert("bands are ordered highest-first (extensible table, not scattered if/else)", SESSION_GRADE_BANDS[0].min > SESSION_GRADE_BANDS[SESSION_GRADE_BANDS.length - 1].min);
}

console.log("\n11. Session Summary — duration computed from sessionStartedAt");
{
  const sessionStartedAt = Date.now() - (2 * 60 + 15) * 60000; // 2h15m ago
  const state = { players: { p1: makePlayer("p1") }, courts: [{}, {}, {}], rotationMode: "continuous", venue: "Saturday Open Play", sessionStartedAt };
  const report = computeSessionAnalyticsReport(state);
  assert("durationLabel reflects the elapsed time (2h 15m)", report.sessionSummary.durationLabel === "2h 15m");
  assert("courtsCount reflects state.courts.length", report.sessionSummary.courtsCount === 3);
  assert("venue is passed through", report.sessionSummary.venue === "Saturday Open Play");
}

console.log("\n12. Tournament Results — sessionType/tournamentId pass through as a live reference");
{
  const openPlayReport = computeSessionAnalyticsReport({ players: {}, courts: [], rotationMode: "continuous" });
  assert("Open Play session defaults sessionType to 'openPlay'", openPlayReport.sessionType === "openPlay");
  assert("Open Play session has no tournamentId", openPlayReport.tournamentId === null);

  const tournamentReport = computeSessionAnalyticsReport({
    players: {},
    courts: [],
    rotationMode: "continuous",
    sessionType: "tournament",
    tournamentId: "tourn-123",
  });
  assert("Tournament session's sessionType is carried through", tournamentReport.sessionType === "tournament");
  assert("Tournament session's tournamentId is carried through (live reference, not a snapshot)", tournamentReport.tournamentId === "tourn-123");
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
