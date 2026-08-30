// In-Court Player Count — automated, headless coverage of
// countInCourtPlayers (lib/utils.js). IN-COURT PLAYERS = every checked-in
// player who is not CHECKED_OUT (PLAYING + HELD + UPCOMING + WAITING
// combined), reusing getPlayerQueueStatus's existing taxonomy verbatim.
//
// Usage: node scripts/verify-in-court-player-count.mjs
import { countInCourtPlayers, getPlayerQueueStatus } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

console.log("\ncountInCourtPlayers — every non-CHECKED_OUT status is counted");
{
  const state = {
    players: {
      playing1: { id: "playing1", checkedIn: true, held: false, status: "ACTIVE" },
      playing2: { id: "playing2", checkedIn: true, held: false, status: "ACTIVE" },
      held1: { id: "held1", checkedIn: true, held: true, status: "ACTIVE" },
      upcoming1: { id: "upcoming1", checkedIn: true, held: false, status: "ACTIVE" },
      waiting1: { id: "waiting1", checkedIn: true, held: false, status: "ACTIVE" },
      checkedOut1: { id: "checkedOut1", checkedIn: true, held: false, status: "CHECKED_OUT" },
    },
    courts: [{ number: 1, status: "live", teamA: ["playing1"], teamB: ["playing2"] }],
    nextMatchups: [{ id: "m1", teamA: ["upcoming1"], teamB: ["someoneElse"] }],
  };

  assert("playing1's status really is PLAYING", getPlayerQueueStatus(state.players.playing1, state) === "Playing");
  assert("held1's status really is HELD", getPlayerQueueStatus(state.players.held1, state) === "Held");
  assert("upcoming1's status really is UPCOMING", getPlayerQueueStatus(state.players.upcoming1, state) === "Upcoming");
  assert("waiting1's status really is WAITING", getPlayerQueueStatus(state.players.waiting1, state) === "Waiting");
  assert("checkedOut1's status really is CHECKED_OUT", getPlayerQueueStatus(state.players.checkedOut1, state) === "Checked Out");

  // 6 players total, 1 excluded (checkedOut1) -> 5 counted
  assert("PLAYING + HELD + UPCOMING + WAITING are all counted, CHECKED_OUT excluded (5 of 6)", countInCourtPlayers(state) === 5);
}

console.log("\ncountInCourtPlayers — checkedIn alone is NOT used (checkedIn stays true after checkout)");
{
  const state = {
    players: {
      p1: { id: "p1", checkedIn: true, status: "CHECKED_OUT" }, // checkedIn still true, per checkoutPlayer's real behavior
    },
    courts: [],
    nextMatchups: [],
  };
  assert("a checked-out player is excluded even though checkedIn is still true", countInCourtPlayers(state) === 0);
}

console.log("\ncountInCourtPlayers — never-checked-in players (pre-registered, not yet checked in) are excluded");
{
  const state = {
    players: {
      notHereYet: { id: "notHereYet", checkedIn: false, status: "ACTIVE" },
    },
    courts: [],
    nextMatchups: [],
  };
  assert("a registered-but-not-checked-in player doesn't count", countInCourtPlayers(state) === 0);
}

console.log("\ncountInCourtPlayers — empty session = 0");
{
  assert("no players at all -> 0", countInCourtPlayers({ players: {}, courts: [], nextMatchups: [] }) === 0);
  assert("missing players object entirely -> 0, never crashes", countInCourtPlayers({ courts: [], nextMatchups: [] }) === 0);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
