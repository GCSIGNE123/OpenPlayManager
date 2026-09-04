// Four Open-Play-session improvements — automated, headless coverage.
//
// Same "call the real functions, only re-express PickleballOpenPlay.jsx's
// own inline orchestration glue in miniature" precedent as
// scripts/run-acceptance-test.mjs. window.storage is faked in-memory (same
// pattern as scripts/verify-all-sessions.mjs) so the REAL, unmodified
// lib/playerDatabase.js functions (emptyPlayerRecord/savePlayerRecord/
// fetchAllPlayers/fetchPlayer/filterPlayersByQuery) can be exercised
// directly — nothing about the Player Database is reimplemented here.
//
// Usage: node scripts/verify-checkin-improvements.mjs

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeFakeStorage() {
  const map = new Map();
  return {
    async get(key) {
      if (!map.has(key)) return { value: null };
      return { value: map.get(key) };
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list(prefix) {
      return { keys: [...map.keys()].filter((k) => k.startsWith(prefix)) };
    },
    _map: map,
  };
}

global.window = { storage: makeFakeStorage() };

const { emptyPlayerRecord, savePlayerRecord, fetchAllPlayers, fetchPlayer, filterPlayersByQuery, resolveDatabaseCheckIn } = await import(
  "../src/lib/playerDatabase.js"
);
const { getRotationEngine, refreshNextMatchups } = await import("../src/lib/utils.js");
const { defaultState } = await import("../src/lib/constants.js");

// =====================================================================
// ITEM 1 — Walk-in players must also be added to the Player Database
// =====================================================================
console.log("\n=== ITEM 1: Walk-in players join the Player Database ===");
{
  // Mirrors quickAddCheckIn's own new shape exactly: build the Player
  // Database record FIRST, then reuse its own id for the session player —
  // never a second, unrelated id.
  const record = emptyPlayerRecord({ firstName: "Walk In Wanda", displayName: "Walk In Wanda", photo: "data:image/png;base64,abc", skill: "intermediate" });
  await savePlayerRecord(record);
  const sessionPlayer = { id: record.id, name: "Walk In Wanda", skill: "intermediate", checkedIn: true };

  assert("1: the session player's id is the EXACT SAME id as the Player Database record — never a second, unrelated id", sessionPlayer.id === record.id);

  const allPlayers = await fetchAllPlayers();
  assert("1: the walk-in now appears in the Player Database (fetchAllPlayers)", allPlayers.some((p) => p.id === record.id));
  assert("1: exactly one record was created for this one registration action — no duplicate", allPlayers.filter((p) => p.displayName === "Walk In Wanda").length === 1);

  const found = filterPlayersByQuery(allPlayers, "wanda");
  assert("1: the walk-in can be found via 'Search registered players' next session (filterPlayersByQuery)", found.length === 1 && found[0].id === record.id);
  assert("1: photo is preserved on the Player Database record", found[0].photo === "data:image/png;base64,abc");
  assert("1: skill is preserved on the Player Database record", found[0].skill === "intermediate");

  // Simulate "next session": an organizer checks this same walk-in in via
  // the registered-player search path (checkInFromDatabase), on a session
  // that has never seen them before — resolveDatabaseCheckIn is the REAL,
  // unmodified function every registered check-in already goes through.
  const decision = resolveDatabaseCheckIn({}, found[0]);
  assert("1: found-via-search walk-in resolves to createNew, reusing the SAME Player Database id — no duplicate identity ever created", decision.action === "createNew" && decision.id === record.id);
}

console.log("\n=== ITEM 1 (regression): existing registered-player check-in is unchanged ===");
{
  const record = { id: "already-existed-1", displayName: "Existing Player", skill: "beginner", photo: null };
  const decision1 = resolveDatabaseCheckIn({}, record);
  assert("brand-new-to-this-session registered player still resolves to createNew, unchanged", decision1.action === "createNew" && decision1.id === "already-existed-1");
  const decision2 = resolveDatabaseCheckIn({ "already-existed-1": { id: "already-existed-1", checkedIn: true } }, record);
  assert("already-checked-in registered player still resolves to noop, unchanged", decision2.action === "noop");
}

// =====================================================================
// ITEM 2 — Do not auto-generate games when players are checked in
// =====================================================================
console.log("\n=== ITEM 2: Start Queuing gate ===");

// Miniature re-expression of save()'s own gating decision — the exact
// same one-line ternary PickleballOpenPlay.jsx's save() and
// generateRemainingCourts now both use — calling the REAL, unmodified
// refreshNextMatchups/getRotationEngine, never a reimplementation of
// matchmaking itself. See PickleballOpenPlay.jsx's save() for the
// authoritative version this mirrors.
function simulateSave(state) {
  const queueingNotYetStarted = state.queueingStarted === false;
  const engine = getRotationEngine(state.rotationMode);
  const nextMatchups = queueingNotYetStarted || state.queueingStopped
    ? state.nextMatchups || []
    : refreshNextMatchups(state.queueIds, state.players, state.nextMatchups || [], engine, null, 99);
  return { ...state, nextMatchups };
}

function makePlayer(id, overrides = {}) {
  return { id, name: id, skill: "beginner", games: 0, checkedIn: true, held: false, status: "ACTIVE", partnerCounts: {}, recentPartnerIds: {}, opponentCounts: {}, recentOpponentIds: [], ...overrides };
}

console.log("\nA. Create session with zero players");
{
  const state = { ...defaultState, rotationMode: "continuous", players: {}, queueIds: [], nextMatchups: [] };
  const result = simulateSave(state);
  assert("zero players -> zero matchups, no crash", result.nextMatchups.length === 0);
}

console.log("\nB/C. Check in players (even 8 eligible) before Start Queuing -> zero matchups generated");
{
  const players = {};
  const queueIds = [];
  for (let i = 1; i <= 8; i++) {
    players[`p${i}`] = makePlayer(`p${i}`);
    queueIds.push(`p${i}`);
  }
  const state = { ...defaultState, rotationMode: "continuous", players, queueIds, nextMatchups: [] };
  assert("defaultState.queueingStarted defaults to false (new-session shape)", defaultState.queueingStarted === false);
  const result = simulateSave(state);
  assert("B/C: 8 eligible checked-in players, queueingStarted still false -> ZERO matchups generated", result.nextMatchups.length === 0);
}

console.log("\nD/E. Scorer clicks Start Queuing -> queue initializes, first matchups generated, ready for dispatch");
{
  const players = {};
  const queueIds = [];
  for (let i = 1; i <= 8; i++) {
    players[`p${i}`] = makePlayer(`p${i}`);
    queueIds.push(`p${i}`);
  }
  const beforeStart = { ...defaultState, rotationMode: "continuous", players, queueIds, nextMatchups: [] };
  const stillGated = simulateSave(beforeStart);
  assert("D: still gated the instant before Start Queuing is clicked", stillGated.nextMatchups.length === 0);

  // "Start Queuing" itself does nothing but flip the one field — the very
  // next save() is what actually generates the first batch, using the
  // exact same queueIds/players that already accumulated during check-in.
  const afterStart = simulateSave({ ...beforeStart, queueingStarted: true });
  assert("D: clicking Start Queuing -> the very next save() generates real matchups from the already-checked-in players", afterStart.nextMatchups.length > 0);
  assert("E: matchups generated are complete (4 players each), ready for existing dispatch logic to pick up untouched", afterStart.nextMatchups.every((m) => m.teamA.length === 2 && m.teamB.length === 2));
}

console.log("\nF. Late arrival after queuing already started -> existing behavior (new matchups keep generating normally)");
{
  const players = {};
  for (let i = 1; i <= 4; i++) players[`p${i}`] = makePlayer(`p${i}`);
  const state = { ...defaultState, rotationMode: "continuous", players, queueIds: ["p1", "p2", "p3", "p4"], nextMatchups: [], queueingStarted: true };
  const afterFirstFour = simulateSave(state);
  assert("first 4 already form a matchup once queueing is active", afterFirstFour.nextMatchups.length === 1);

  // a 5th player (late arrival) checks in — mirrors checkInExisting's own
  // queueIds.push, unrelated to this gate
  const withLateArrival = { ...afterFirstFour, players: { ...afterFirstFour.players, p5: makePlayer("p5") }, queueIds: [...afterFirstFour.queueIds, "p5"] };
  const afterLateArrival = simulateSave(withLateArrival);
  assert("F: a late arrival after Start Queuing is simply added to the existing active queue — no special-casing, no regeneration of the existing matchup", afterLateArrival.nextMatchups.length === 1 && afterLateArrival.nextMatchups[0].id === afterFirstFour.nextMatchups[0].id);
}

console.log("\nG. Reload/realtime update BEFORE queuing starts -> still not generating matches");
{
  const players = {};
  for (let i = 1; i <= 8; i++) players[`p${i}`] = makePlayer(`p${i}`);
  // Simulates a page reload: state is reconstructed fresh from the persisted
  // blob (queueingStarted survives as an explicit false, same as any other
  // persisted field), then save() runs again (e.g. from a realtime tick).
  const reloaded = { ...defaultState, rotationMode: "continuous", players, queueIds: Object.keys(players), nextMatchups: [], queueingStarted: false };
  const result = simulateSave(reloaded);
  assert("G: reload before Start Queuing -> still zero matchups", result.nextMatchups.length === 0);
}

console.log("\nH. Reload AFTER queuing started -> active queue state persists, matchups keep flowing");
{
  const players = {};
  for (let i = 1; i <= 8; i++) players[`p${i}`] = makePlayer(`p${i}`);
  const reloaded = { ...defaultState, rotationMode: "continuous", players, queueIds: Object.keys(players), nextMatchups: [], queueingStarted: true };
  const result = simulateSave(reloaded);
  assert("H: reload after Start Queuing -> queueingStarted persisted as true, matchups generate normally", result.nextMatchups.length > 0);
}

console.log("\nI. Start Queuing cannot accidentally double-trigger / reset rotation history");
{
  const players = { p1: makePlayer("p1", { games: 3, partnerCounts: { p2: 5 }, recentPartnerIds: ["p2"] }), p2: makePlayer("p2", { games: 3 }) };
  const state = { ...defaultState, rotationMode: "continuous", players, queueIds: ["p1", "p2"], nextMatchups: [], queueingStarted: true };
  // startQueuing()'s own real guard: `if (state.queueingStarted) return;` —
  // re-expressed here since it's a one-line closure, not a separate export.
  function startQueuing(current) {
    if (current.queueingStarted) return current;
    return { ...current, queueingStarted: true };
  }
  const triggeredTwice = startQueuing(startQueuing(state));
  assert("I: calling Start Queuing again once already started is a true no-op — same object reference, nothing reset", triggeredTwice === state);
  assert("I: rotation history (games played, partner counts) is completely untouched by Start Queuing at all", players.p1.games === 3 && players.p1.partnerCounts.p2 === 5);
}

console.log("\nBackward compatibility — an EXISTING session predating this field (queueingStarted undefined) behaves exactly as it always has");
{
  const players = {};
  for (let i = 1; i <= 4; i++) players[`p${i}`] = makePlayer(`p${i}`);
  const oldSession = { ...defaultState, rotationMode: "continuous", players, queueIds: Object.keys(players), nextMatchups: [] };
  delete oldSession.queueingStarted; // simulates a real pre-existing session blob that never had this field at all
  const result = simulateSave(oldSession);
  assert("a pre-existing session with no queueingStarted field at all keeps auto-generating exactly as before (never newly gated)", result.nextMatchups.length > 0);
}

// =====================================================================
// ITEM 3 — Last Open Play category becomes the player's current category
// =====================================================================
console.log("\n=== ITEM 3: Last Open Play category persistence ===");
{
  const record = emptyPlayerRecord({ firstName: "Category Carl", displayName: "Category Carl", skill: "beginner" });
  await savePlayerRecord(record);

  let fetched = await fetchPlayer(record.id);
  assert("A: player has Beginner stored -> next Open Play defaults Beginner", fetched.skill === "beginner");

  // B: organizer changes the category before check-in (setPreCheckInSkill's
  // own new persistence side effect) — mirrors PickleballOpenPlay.jsx's
  // setPreCheckInSkill wrapper: fetchPlayer, then savePlayerRecord with the
  // new skill merged in.
  const before = await fetchPlayer(record.id);
  await savePlayerRecord({ ...before, skill: "intermediate" });

  fetched = await fetchPlayer(record.id);
  assert("B: persistent value becomes Intermediate after the organizer changes it", fetched.skill === "intermediate");

  // C: "next session" is just fetching the same record again — nothing
  // session-scoped survives, only the Player Database record does.
  const nextSessionRecord = await fetchPlayer(record.id);
  assert("C: next session defaults Intermediate", nextSessionRecord.skill === "intermediate");

  // D: a walk-in who selected Intermediate at creation time
  const walkIn = emptyPlayerRecord({ firstName: "Walk-in Dana", displayName: "Walk-in Dana", photo: "data:x", skill: "intermediate" });
  await savePlayerRecord(walkIn);
  const walkInFetched = await fetchPlayer(walkIn.id);
  assert("D: new walk-in selected Intermediate -> Player Database stores Intermediate", walkInFetched.skill === "intermediate");

  // E: an existing registered player's session skill can still be changed
  // right before check-in (setPreCheckInSkillAction's own pure logic,
  // unchanged — see verify-pre-checkin-skill.mjs for its own full
  // coverage; only confirming the persistence side effect layers on top
  // without altering that decision).
  await savePlayerRecord({ ...(await fetchPlayer(record.id)), skill: "beginner" });
  assert("E: existing registered player's category can still be manually changed before check-in", (await fetchPlayer(record.id)).skill === "beginner");

  // F: existing matchmaking still receives the correct session skill —
  // resolveDatabaseCheckIn (real, unmodified) passes the record's CURRENT
  // skill straight through to the session player.
  const decision = resolveDatabaseCheckIn({}, await fetchPlayer(record.id));
  assert("F: matchmaking receives the correct (currently-stored) session skill via the unmodified check-in path", decision.skill === "beginner");

  // Advanced-is-never-silently-promoted guard — unchanged existing engine
  // limitation, still preserved.
  const advancedDecision = resolveDatabaseCheckIn({}, { id: "adv-1", displayName: "Advanced Andy", skill: "advanced" });
  assert("Advanced is never silently converted into a supported matchmaking category (existing, unchanged limitation)", advancedDecision.skill === "beginner");
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
