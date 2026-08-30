// Live + Overall Standings — automated, headless coverage of the exact
// composition StandingsView.jsx now uses: filter state.players down to
// getPlayerQueueStatus === PLAYING (for Live) THEN feed the result through
// buildStandingsRows (lib/performanceRating.js), completely unchanged — no
// second ranking algorithm. Overall is buildStandingsRows(state.players)
// unchanged. This tests that exact composition directly (StandingsView.jsx
// itself is a thin React wrapper around it — same "test the pure functions"
// precedent as every other *View.jsx in this repo).
//
// Usage: node scripts/verify-live-overall-standings.mjs
import { buildStandingsRows } from "../src/lib/performanceRating.js";
import { getPlayerQueueStatus } from "../src/lib/utils.js";
import { QUEUE_STATUSES } from "../src/lib/constants.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function liveStandings(players, state) {
  const live = Object.fromEntries(Object.entries(players).filter(([, p]) => getPlayerQueueStatus(p, state) === QUEUE_STATUSES.PLAYING));
  return buildStandingsRows(live);
}

function makeState() {
  const players = {
    playing1: { id: "playing1", name: "Playing1", games: 3, wins: 2, losses: 1, streak: 1, pointsFor: 33, pointsAgainst: 20, checkedIn: true, held: false, status: "ACTIVE" },
    playing2: { id: "playing2", name: "Playing2", games: 2, wins: 0, losses: 2, streak: -2, pointsFor: 10, pointsAgainst: 22, checkedIn: true, held: false, status: "ACTIVE" },
    held1: { id: "held1", name: "Held1", games: 4, wins: 3, losses: 1, streak: 2, pointsFor: 44, pointsAgainst: 30, checkedIn: true, held: true, status: "ACTIVE" },
    upcoming1: { id: "upcoming1", name: "Upcoming1", games: 5, wins: 3, losses: 2, streak: 1, pointsFor: 55, pointsAgainst: 48, checkedIn: true, held: false, status: "ACTIVE" },
    waiting1: { id: "waiting1", name: "Waiting1", games: 1, wins: 1, losses: 0, streak: 1, pointsFor: 11, pointsAgainst: 5, checkedIn: true, held: false, status: "ACTIVE" },
    checkedOut1: { id: "checkedOut1", name: "CheckedOut1", games: 6, wins: 4, losses: 2, streak: 1, pointsFor: 66, pointsAgainst: 50, checkedIn: true, held: false, status: "CHECKED_OUT" },
  };
  return {
    players,
    courts: [{ number: 1, status: "live", teamA: ["playing1"], teamB: ["playing2"] }],
    nextMatchups: [{ id: "m1", teamA: ["upcoming1"], teamB: ["someoneElse"] }],
  };
}

console.log("\nOVERALL standing uses the existing, unmodified ranking (buildStandingsRows over ALL session participants)");
{
  const state = makeState();
  const overall = buildStandingsRows(state.players);
  assert("overall includes every player with at least one completed game (all 6 here)", overall.length === 6);
  assert("overall's ranking order is rating -> wins -> diff -> name, exactly as buildStandingsRows already defines", (
    JSON.stringify(overall.map((p) => p.id)) === JSON.stringify([...overall].sort(
      (a, b) => (b.performance.rating ?? 0) - (a.performance.rating ?? 0) || b.wins - a.wins || b.diff - a.diff || a.name.localeCompare(b.name)
    ).map((p) => p.id))
  ));
}

console.log("\nLIVE standing includes ONLY players currently PLAYING on a live court");
{
  const state = makeState();
  const live = liveStandings(state.players, state);
  const liveIds = live.map((p) => p.id).sort();
  assert("live includes exactly the two players on the live court", JSON.stringify(liveIds) === JSON.stringify(["playing1", "playing2"]));
  assert("waiting players are excluded from Live", !liveIds.includes("waiting1"));
  assert("held players are excluded from Live", !liveIds.includes("held1"));
  assert("upcoming (locked into a next matchup) players are excluded from Live", !liveIds.includes("upcoming1"));
  assert("checked-out players are excluded from Live", !liveIds.includes("checkedOut1"));
}

console.log("\nLIVE standing uses the SAME ranking/tiebreak logic as Overall — no separate formula");
{
  const state = makeState();
  const live = liveStandings(state.players, state);
  // Both playing1 (2W-1L) and playing2 (0W-2L) are live; playing1 should
  // rank first under the exact same rating->wins->diff->name order Overall
  // uses — same computation, just a smaller input set.
  assert("playing1 (better record) ranks first in Live, same ordering rule as Overall", live[0].id === "playing1");
}

console.log("\nNo completed-game data is altered by either view — both are read-only derivations");
{
  const state = makeState();
  const before = JSON.stringify(state.players);
  buildStandingsRows(state.players);
  liveStandings(state.players, state);
  assert("state.players is byte-for-byte unchanged after computing both standings", JSON.stringify(state.players) === before);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
