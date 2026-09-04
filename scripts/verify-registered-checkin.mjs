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
import { resolveDatabaseCheckIn, filterPlayersByQuery, recentPlayers, disambiguateDuplicateNames } from "../src/lib/playerDatabase.js";

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

console.log("\nrecentPlayers — Register Players Joining Today's scalable default view (never renders the whole database)");
{
  const now = Date.now();
  const many = Array.from({ length: 1000 }, (_, i) => ({
    id: `p${i}`,
    displayName: `Player ${i}`,
    updatedAt: now - i * 1000, // p0 is most-recently touched, p999 the oldest
  }));
  const top = recentPlayers(many);
  assert("A/B/scalability: default subset is capped at 10 regardless of a 1,000-player database", top.length === 10);
  assert("most recently updated player sorts first", top[0].id === "p0");
  assert("does not mutate the original array's order", many[0].id === "p0" && many[999].id === "p999");

  const customLimit = recentPlayers(many, 12);
  assert("a custom limit (e.g. 12, the upper end of '8-12 players') is honored", customLimit.length === 12);

  assert("falls back to createdAt when updatedAt is missing", recentPlayers([
    { id: "old", createdAt: now - 100 },
    { id: "new", createdAt: now - 10 },
  ])[0].id === "new");

  assert("empty/undefined input never crashes", recentPlayers([]).length === 0 && recentPlayers(undefined).length === 0);
}

console.log("\ndisambiguateDuplicateNames — H: duplicate-name players handled clearly, without touching the database");
{
  const noCollision = disambiguateDuplicateNames([
    { id: "1", displayName: "Ana Reyes", lastName: "Reyes" },
    { id: "2", displayName: "Ben Santos", lastName: "Santos" },
  ]);
  assert("no hint at all when every display name in the list is unique", noCollision.size === 0);

  const distinctLastNames = disambiguateDuplicateNames([
    { id: "1", displayName: "Alex", lastName: "Cruz" },
    { id: "2", displayName: "Alex", lastName: "Reyes" },
  ]);
  assert("two same-first-name players with DIFFERENT last names are disambiguated by last name", (
    distinctLastNames.get("1") === "Cruz" && distinctLastNames.get("2") === "Reyes"
  ));

  const sameLastNameToo = disambiguateDuplicateNames([
    { id: "aaaa1111", displayName: "Alex Cruz", lastName: "Cruz" },
    { id: "bbbb2222", displayName: "Alex Cruz", lastName: "Cruz" },
  ]);
  assert("identical name AND last name still gets a real, distinct hint (never silently indistinguishable)", (
    sameLastNameToo.get("aaaa1111") !== sameLastNameToo.get("bbbb2222") &&
    sameLastNameToo.get("aaaa1111") != null && sameLastNameToo.get("bbbb2222") != null
  ));

  assert("case-insensitive collision detection ('alex' === 'Alex')", disambiguateDuplicateNames([
    { id: "1", displayName: "alex", lastName: "Cruz" },
    { id: "2", displayName: "Alex", lastName: "Reyes" },
  ]).size === 2);

  assert("a player with no display name is simply skipped, never crashes", disambiguateDuplicateNames([{ id: "1" }]).size === 0);
  assert("empty/undefined input never crashes", disambiguateDuplicateNames([]).size === 0 && disambiguateDuplicateNames(undefined).size === 0);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
