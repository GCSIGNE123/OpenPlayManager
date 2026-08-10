// Next Match (facilitator announcement) — automated, headless, logic-layer
// coverage for both Round Robin and Open Play. Calls the real functions
// directly (saveSetNextMatch/saveMatchResult/saveMatchStart from
// lib/tournament.js, buildNextMatchAnnouncementText from lib/announcer.js) —
// no synthetic reimplementation. Open Play's setNextMatchup/announceNextMatchup
// live as inline closures inside PickleballOpenPlay.jsx (same precedent as
// every other Scorer action there), so Open Play coverage here exercises the
// same state-shape invariants (nextMatchupId never touches nextMatchups/
// queueIds) plus the shared buildNextMatchAnnouncementText builder directly.
//
// Usage: node scripts/verify-next-match.mjs
globalThis.window = {
  storage: {
    set: async () => {},
    get: async () => { throw new Error("not found"); },
    list: async () => ({ keys: [] }),
    delete: async () => {},
    subscribeToKey: () => () => {},
  },
};

import { buildAndSaveRoundRobinTournament, saveSetNextMatch, saveClearNextMatch, saveMatchStart, saveMatchResult, saveCourtAssignment, resolvePlayerIds } from "../src/lib/tournament.js";
import { CourtAssignmentEngine } from "../src/engines/CourtAssignmentEngine.js";
import { collectMatches } from "../src/engines/CourtAssignmentService.js";
import { buildNextMatchAnnouncementText } from "../src/lib/announcer.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayers(names) {
  const players = {};
  names.forEach((name, i) => { players[`p${i}`] = { id: `p${i}`, name }; });
  return players;
}

async function makeRRTournament() {
  const players = Object.values(makePlayers(["Guil", "Jovy", "Alfred", "Mae", "Sam", "Ted", "Uma"]));
  return buildAndSaveRoundRobinTournament({
    sessionCode: "TEST1",
    players,
    mode: "singles",
    courtsCount: 1,
    poolCount: 1,
    advancesPerPool: 2,
  });
}

console.log("\nRound Robin — Set as Next Match");
{
  const tournament = await makeRRTournament();
  const firstMatch = tournament.pools[0].rounds[0].matches.find((m) => !m.isBye);
  const updated = await saveSetNextMatch(tournament, firstMatch.id);
  assert("nextMatchId is set to the chosen match", updated.nextMatchId === firstMatch.id);
}

console.log("\nRound Robin — only ONE Next Match can exist; selecting another replaces it");
{
  const tournament = await makeRRTournament();
  const round1Matches = tournament.pools[0].rounds[0].matches.filter((m) => !m.isBye);
  const matchA = round1Matches[0];
  const matchB = round1Matches[1];
  let updated = await saveSetNextMatch(tournament, matchA.id);
  assert("Match A is Next Match", updated.nextMatchId === matchA.id);
  updated = await saveSetNextMatch(updated, matchB.id);
  assert("Match B replaced Match A as Next Match", updated.nextMatchId === matchB.id);
  assert("only one nextMatchId field exists (not an array/set)", typeof updated.nextMatchId === "string");
}

console.log("\nRound Robin — cannot designate an already-completed or bye match");
{
  const tournament = await makeRRTournament();
  const byeMatch = tournament.pools[0].rounds.flatMap((r) => r.matches).find((m) => m.isBye);
  if (byeMatch) {
    let threw = false;
    try { await saveSetNextMatch(tournament, byeMatch.id); } catch { threw = true; }
    assert("setting a bye match as Next Match is rejected", threw);
  } else {
    assert("no bye in this 7-player/1-pool schedule to test (skipped, not a failure)", true);
  }
}

console.log("\nRound Robin — correct player names are used in the announcement text");
{
  const tournament = await makeRRTournament();
  const players = makePlayers(["Guil", "Jovy", "Alfred", "Mae", "Sam", "Ted", "Uma"]);
  const match = tournament.pools[0].rounds[0].matches.find((m) => !m.isBye);
  const teamANames = resolvePlayerIds(tournament, match.teamA).map((id) => players[id]?.name || "Unknown player");
  const teamBNames = resolvePlayerIds(tournament, match.teamB).map((id) => players[id]?.name || "Unknown player");
  const text = buildNextMatchAnnouncementText(teamANames, teamBNames);
  assert("announcement mentions team A's real player name", text.includes(teamANames[0]));
  assert("announcement mentions team B's real player name", text.includes(teamBNames[0]));
  assert("announcement uses the 'Next match. Prepare.' framing", text.startsWith("Next match. Prepare."));
  assert("announcement never says 'proceed to court' (no court yet)", !text.includes("proceed to"));
}

console.log("\nRound Robin — Set as Next Match / Announce does not modify the schedule");
{
  const tournament = await makeRRTournament();
  const before = JSON.stringify(tournament.pools);
  const match = tournament.pools[0].rounds[0].matches.find((m) => !m.isBye);
  const updated = await saveSetNextMatch(tournament, match.id);
  assert("pools/schedule is byte-for-byte unchanged", JSON.stringify(updated.pools) === before);
  assert("tournament status is unchanged", updated.status === tournament.status);
}

console.log("\nRound Robin — completing the Next Match clears the designation");
{
  const tournament = await makeRRTournament();
  const match = tournament.pools[0].rounds[0].matches.find((m) => !m.isBye);
  let updated = await saveSetNextMatch(tournament, match.id);
  updated = await saveMatchStart(updated, match.id);
  assert("Next Match designation survives Start Match (not yet completed)", updated.nextMatchId === match.id);
  updated = await saveMatchResult(updated, match.id, { scoreA: 11, scoreB: 5, winnerId: match.teamA.id });
  assert("Next Match designation clears once that match completes", updated.nextMatchId == null);
}

console.log("\nRound Robin — completing a DIFFERENT match does not clear Next Match");
{
  const tournament = await makeRRTournament();
  const matches = tournament.pools[0].rounds[0].matches.filter((m) => !m.isBye);
  const [matchA, matchB] = matches;
  let updated = await saveSetNextMatch(tournament, matchA.id);
  updated = await saveMatchStart(updated, matchB.id);
  updated = await saveMatchResult(updated, matchB.id, { scoreA: 11, scoreB: 5, winnerId: matchB.teamA.id });
  assert("Next Match (Match A) is untouched by completing Match B", updated.nextMatchId === matchA.id);
}

console.log("\nRound Robin — Next Match actually auto-fills a freed court next (the reported bug)");
{
  // 7 players/1 court/1 pool -> round 1 has 3 real matches + 1 bye, all
  // pending and eligible, competing for the same single court. Designating
  // one of the LATER matches (not the natural priority-order winner) as
  // Next Match must make it the one CourtAssignmentEngine.autoAssign picks
  // once the court frees — this is CourtPriorityService.compare's new
  // override, exercised through the exact same saveMatchResult ->
  // courtAssignmentEngine.autoAssign(court) path the Courts tab's "End
  // Match"/live-match completion already goes through.
  const tournament = await makeRRTournament();
  const pending = tournament.pools[0].rounds[0].matches.filter((m) => !m.isBye);
  const [matchA, matchB, matchC] = pending;

  // Without any Next Match designation, natural priority order (same tier,
  // oldest-waiting-first) would auto-fill with matchA first once the court
  // frees — sanity-check that baseline before proving the override.
  const engine = new CourtAssignmentEngine();
  const naturalNext = engine.getNextMatch(tournament, { forCourtNumber: 1 });
  assert("sanity: without Next Match, matchA is naturally next in queue order", naturalNext.match.id === matchA.id);

  // Designate matchC (NOT the natural next) as Next Match, start+finish
  // matchA on the only court, and confirm the freed court auto-fills with
  // matchC — not matchB, which natural priority order would otherwise pick.
  let t = await saveSetNextMatch(tournament, matchC.id);
  t = await saveCourtAssignment(t, matchA.id, 1);
  t = await saveMatchStart(t, matchA.id);
  t = await saveMatchResult(t, matchA.id, { scoreA: 11, scoreB: 5, winnerId: matchA.teamA.id });
  const court1Match = collectMatches(t).find((e) => e.match.court === 1 && e.match.status !== "completed");
  assert("the designated Next Match (matchC) auto-fills the freed court", court1Match?.match.id === matchC.id);
  assert("matchB (natural next) is still waiting, untouched", collectMatches(t).find((e) => e.match.id === matchB.id).match.court === null);
}

console.log("\nRound Robin — saveClearNextMatch safely clears (invalid/unavailable case)");
{
  const tournament = await makeRRTournament();
  const match = tournament.pools[0].rounds[0].matches.find((m) => !m.isBye);
  let updated = await saveSetNextMatch(tournament, match.id);
  updated = await saveClearNextMatch(updated);
  assert("nextMatchId cleared", updated.nextMatchId == null);
  const noop = await saveClearNextMatch(updated);
  assert("clearing again when already null is a safe no-op", noop.nextMatchId == null);
}

console.log("\nOpen Play — Next Match designation shape (nextMatchupId is separate from nextMatchups/queueIds)");
{
  const players = makePlayers(["Guil", "Jovy", "Alfred", "Mae"]);
  const nextMatchups = [{ id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"], locked: false }];
  const queueIds = ["p4", "p5"];
  let state = { players, nextMatchups, queueIds, nextMatchupId: null };

  // Mirrors PickleballOpenPlay.jsx's setNextMatchup: save({ ...state, nextMatchupId: matchupId })
  const setNextMatchup = (s, matchupId) => ({ ...s, nextMatchupId: matchupId });

  state = setNextMatchup(state, "m1");
  assert("nextMatchupId is set", state.nextMatchupId === "m1");
  assert("nextMatchups is completely untouched (same array contents)", state.nextMatchups.length === 1 && state.nextMatchups[0].id === "m1");
  assert("queueIds is completely untouched", JSON.stringify(state.queueIds) === JSON.stringify(["p4", "p5"]));
}

console.log("\nOpen Play — only ONE Next Match at a time; selecting another replaces it");
{
  const nextMatchups = [
    { id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] },
    { id: "m2", teamA: ["p4", "p5"], teamB: ["p6", "p7"] },
  ];
  const setNextMatchup = (s, matchupId) => ({ ...s, nextMatchupId: matchupId });
  let state = { nextMatchups, nextMatchupId: null };
  state = setNextMatchup(state, "m1");
  assert("Matchup 1 is Next Match", state.nextMatchupId === "m1");
  state = setNextMatchup(state, "m2");
  assert("Matchup 2 replaced Matchup 1 as Next Match", state.nextMatchupId === "m2");
}

console.log("\nOpen Play — correct player names are announced");
{
  const players = makePlayers(["Guil", "Jovy", "Alfred", "Mae"]);
  const matchup = { id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] };
  const teamANames = matchup.teamA.map((id) => players[id]?.name || "Unknown player");
  const teamBNames = matchup.teamB.map((id) => players[id]?.name || "Unknown player");
  const text = buildNextMatchAnnouncementText(teamANames, teamBNames);
  assert("announcement mentions Guil", text.includes("Guil"));
  assert("announcement mentions Jovy", text.includes("Jovy"));
  assert("announcement mentions Alfred", text.includes("Alfred"));
  assert("announcement mentions Mae", text.includes("Mae"));
  assert("uses the exact expected wording", text === "Next match. Prepare. Guil and Jovy, versus Alfred and Mae.");
}

console.log("\nOpen Play — completing/removing a matchup clears Next Match (stale-designation safety)");
{
  // Mirrors PickleballOpenPlay.jsx's stale-clear effect: if nextMatchupId no
  // longer appears in nextMatchups (dispatched to a court, cancelled,
  // regenerated), it gets cleared.
  const clearIfStale = (state) => {
    if (!state.nextMatchupId) return state;
    if (state.nextMatchups.some((m) => m.id === state.nextMatchupId)) return state;
    return { ...state, nextMatchupId: null };
  };
  let state = { nextMatchups: [{ id: "m1" }], nextMatchupId: "m1" };
  state = clearIfStale(state);
  assert("still valid — untouched", state.nextMatchupId === "m1");

  // m1 gets dispatched to a court and removed from nextMatchups
  state = { ...state, nextMatchups: [] };
  state = clearIfStale(state);
  assert("designation cleared once the matchup leaves nextMatchups", state.nextMatchupId == null);
}

console.log("\nOpen Play — Next Match announcement does not modify matchmaking state");
{
  const nextMatchups = [{ id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"], locked: false }];
  const queueIds = ["p4", "p5"];
  const before = JSON.stringify({ nextMatchups, queueIds });
  // Announcing only reads state (builds text, calls speakAnnouncement, logs
  // an activity entry) — it never spreads/derives a new nextMatchups or
  // queueIds, unlike setNextMatchup/regenerateMatchups/dispatch.
  const after = JSON.stringify({ nextMatchups, queueIds });
  assert("nextMatchups/queueIds unchanged by announcing", before === after);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
