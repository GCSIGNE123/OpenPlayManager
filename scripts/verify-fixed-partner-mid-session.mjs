// Fixed Partner Mid-Session — automated, headless coverage of the pure
// logic underneath the new FixedPartnerPanel.jsx UI surface. The panel
// itself is a thin React wrapper (no new state, no new logic — see its own
// header comment) around setFixedPartner/clearFixedPartner (lib/
// queueManagement.js, both UNCHANGED by this task) and
// BalancedRotationEngine.extractFixedPartnerTeams (also unchanged) — same
// "test the pure functions, not the JSX" precedent every *Panel.jsx in this
// repo already follows (no JSX test renderer is set up here).
//
// Usage: node scripts/verify-fixed-partner-mid-session.mjs
import { setFixedPartner, clearFixedPartner } from "../src/lib/queueManagement.js";
import { getPlayerQueueStatus } from "../src/lib/utils.js";
import { BalancedRotationEngine } from "../src/engines/BalancedRotationEngine.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeState() {
  return {
    players: {
      waiting1: { id: "waiting1", name: "Waiting1", skill: "beginner", checkedIn: true, held: false, status: "ACTIVE", partnerId: null },
      waiting2: { id: "waiting2", name: "Waiting2", skill: "beginner", checkedIn: true, held: false, status: "ACTIVE", partnerId: null },
      playing1: { id: "playing1", name: "Playing1", skill: "intermediate", checkedIn: true, held: false, status: "ACTIVE", partnerId: null },
      playing2: { id: "playing2", name: "Playing2", skill: "intermediate", checkedIn: true, held: false, status: "ACTIVE", partnerId: null },
      reserved1: { id: "reserved1", name: "Reserved1", skill: "beginner", checkedIn: true, held: false, status: "ACTIVE", partnerId: null },
      reserved2: { id: "reserved2", name: "Reserved2", skill: "beginner", checkedIn: true, held: false, status: "ACTIVE", partnerId: null },
    },
    queueIds: ["waiting1", "waiting2"],
    courts: [{ number: 1, status: "live", teamA: ["playing1"], teamB: ["playing2"], scoreA: 3, scoreB: 5 }],
    nextMatchups: [{ id: "M1", teamA: ["reserved1"], teamB: ["reserved2"] }],
    matchHistory: [],
  };
}

console.log("\nsetFixedPartner works regardless of player status (waiting / playing / reserved)");
{
  const state = makeState();
  assert("waiting1's status is WAITING", getPlayerQueueStatus(state.players.waiting1, state) === "Waiting");
  const afterWaiting = setFixedPartner(state, "waiting1", "waiting2");
  assert("a WAITING player can have their partner set", afterWaiting.players.waiting1.partnerId === "waiting2" && afterWaiting.players.waiting2.partnerId === "waiting1");

  assert("playing1's status is PLAYING", getPlayerQueueStatus(state.players.playing1, state) === "Playing");
  const afterPlaying = setFixedPartner(state, "playing1", "playing2");
  assert("a currently PLAYING player can have their partner set", afterPlaying.players.playing1.partnerId === "playing2" && afterPlaying.players.playing2.partnerId === "playing1");

  assert("reserved1's status is UPCOMING (locked into a next matchup)", getPlayerQueueStatus(state.players.reserved1, state) === "Upcoming");
  const afterReserved = setFixedPartner(state, "reserved1", "reserved2");
  assert("a RESERVED (upcoming) player can have their partner set", afterReserved.players.reserved1.partnerId === "reserved2" && afterReserved.players.reserved2.partnerId === "reserved1");
}

console.log("\nclearFixedPartner clears the mutual link on both sides");
{
  const state = setFixedPartner(makeState(), "playing1", "playing2");
  const cleared = clearFixedPartner(state, "playing1");
  assert("both sides are cleared", cleared.players.playing1.partnerId === null && cleared.players.playing2.partnerId === null);
}

console.log("\nsetting a partner for a playing/reserved player does NOT retroactively alter the current match or an already-built next matchup");
{
  const state = makeState();
  const afterPlaying = setFixedPartner(state, "playing1", "playing2");
  assert("the live court (courts[0]) is byte-for-byte unchanged", JSON.stringify(afterPlaying.courts) === JSON.stringify(state.courts));

  const afterReserved = setFixedPartner(state, "reserved1", "reserved2");
  assert("the already-built next matchup (nextMatchups[0]) is byte-for-byte unchanged", JSON.stringify(afterReserved.nextMatchups) === JSON.stringify(state.nextMatchups));
  assert("matchHistory is completely untouched", JSON.stringify(afterReserved.matchHistory) === JSON.stringify(state.matchHistory));
}

console.log("\nfuture matchmaking DOES see a fixed partner set mid-session, once both are back in the waiting pool");
{
  const engine = new BalancedRotationEngine();
  // waiting1/waiting2 are both genuinely waiting (in queueIds) — set them as
  // fixed partners mid-session, exactly like the new panel would, then
  // confirm the NEXT matchmaking pass honors it.
  const state = setFixedPartner(makeState(), "waiting1", "waiting2");
  const { teams, remaining } = engine.extractFixedPartnerTeams(state.queueIds, state.players);
  assert("the fixed pair is pulled out as one team by the engine's next matchmaking pass", (
    teams.length === 1 && teams[0].includes("waiting1") && teams[0].includes("waiting2")
  ));
  assert("no one else is affected", remaining.length === 0);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
