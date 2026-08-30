// Registered Player Check-In (Player Database) — automated, headless
// coverage of resolveDatabaseCheckIn (lib/playerDatabase.js) — the pure
// decision logic behind CheckinView.jsx's new "Search registered players"
// section / PickleballOpenPlay.jsx's checkInFromDatabase. The surrounding
// save()-calling wrapper mirrors the existing, untested-at-this-level
// quickAddCheckIn/checkInExisting pattern (same precedent as every other
// check-in action in this app); only the genuinely new branching decision
// is exercised directly here.
//
// Usage: node scripts/verify-registered-checkin.mjs
import { resolveDatabaseCheckIn, filterPlayersByQuery } from "../src/lib/playerDatabase.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

const record = { id: "db-player-1", displayName: "Juan Dela Cruz", skill: "intermediate", photo: "data:image/png;base64,abc" };

console.log("\nresolveDatabaseCheckIn — registered player search results");
{
  const decision = resolveDatabaseCheckIn({}, record);
  assert("a registered player search works: brand-new-to-this-session player resolves to createNew", decision.action === "createNew");
  assert("selecting a registered player preserves their EXISTING Player Database id — never a new random id", decision.id === "db-player-1");
  assert("createNew carries the real displayName/skill/photo through unchanged", (
    decision.name === "Juan Dela Cruz" && decision.skill === "intermediate" && decision.photo === "data:image/png;base64,abc"
  ));
}

console.log("\nresolveDatabaseCheckIn — a player already pre-registered on this session's roster (not yet checked in)");
{
  const sessionPlayers = { "db-player-1": { id: "db-player-1", name: "Juan Dela Cruz", checkedIn: false } };
  const decision = resolveDatabaseCheckIn(sessionPlayers, record);
  assert("reuses the existing checkInExisting path — never creates a second, duplicate record for the same id", decision.action === "checkInExisting" && decision.id === "db-player-1");
}

console.log("\nresolveDatabaseCheckIn — duplicate check-in prevention");
{
  const sessionPlayers = { "db-player-1": { id: "db-player-1", name: "Juan Dela Cruz", checkedIn: true } };
  const decision = resolveDatabaseCheckIn(sessionPlayers, record);
  assert("a player already checked in this session resolves to a no-op — duplicate check-in prevented", decision.action === "noop");
}

console.log("\nresolveDatabaseCheckIn — malformed input never crashes, never guessed");
{
  assert("no record at all -> noop", resolveDatabaseCheckIn({}, null).action === "noop");
  assert("a record with no id -> noop", resolveDatabaseCheckIn({}, { displayName: "No Id" }).action === "noop");
}

console.log("\nresolveDatabaseCheckIn — skill falls back to beginner for any non-'intermediate' value (same convention as quickAddCheckIn)");
{
  const decision = resolveDatabaseCheckIn({}, { id: "p2", displayName: "Advanced Andy", skill: "advanced" });
  assert("an 'advanced'-tagged Player Database record still resolves to 'beginner' for session matchmaking purposes (existing engine limitation, unchanged by this task)", decision.skill === "beginner");
}

console.log("\nfilterPlayersByQuery — reused verbatim, unmodified, for the new registered-player search box");
{
  const players = [
    { id: "1", displayName: "Ana Reyes", firstName: "Ana", lastName: "Reyes", nickname: null, contactNumber: null },
    { id: "2", displayName: "Ben Santos", firstName: "Ben", lastName: "Santos", nickname: "Benny", contactNumber: null },
  ];
  assert("search matches by display name", filterPlayersByQuery(players, "reyes").length === 1);
  assert("search matches by nickname", filterPlayersByQuery(players, "benny").length === 1);
  assert("empty query returns everyone", filterPlayersByQuery(players, "").length === 2);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
