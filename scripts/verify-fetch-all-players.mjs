// Phase 5c/5d egress fixes — unit tests for src/lib/playerDatabase.js's
// fetchAllPlayers()/savePlayerRecord(). Mocked window.storage (same
// globalThis.window precedent already used by
// scripts/verify-court-board-scoring.mjs) with explicit call counting.
//
// IMPORTANT: fetchAllPlayers() is now backed by a module-level shared
// cache (Phase 5d, asyncCache.js) — a single singleton for this whole
// process, just like in the real app. Every test scenario below that
// needs a GUARANTEED fresh fetch starts by invalidating that cache via a
// throwaway savePlayerRecord() call (the same mechanism a real save
// uses), rather than reaching into playerDatabase.js's internals.
//
// Usage: node scripts/verify-fetch-all-players.mjs
const calls = { listWithValues: 0, list: 0, get: 0, set: 0 };
let listWithValuesResult = { rows: [] };
let setShouldFail = false;

globalThis.window = {
  storage: {
    listWithValues: async (prefix, shared) => {
      calls.listWithValues++;
      calls.lastPrefix = prefix;
      calls.lastShared = shared;
      return listWithValuesResult;
    },
    list: async () => {
      calls.list++;
      return { keys: [] };
    },
    get: async () => {
      calls.get++;
      throw new Error("get() should not be called by fetchAllPlayers() anymore");
    },
    set: async () => {
      calls.set++;
      if (setShouldFail) throw new Error("simulated write failure");
    },
    delete: async () => {},
    subscribeToKey: () => () => {},
  },
};

const { fetchAllPlayers, savePlayerRecord } = await import("../src/lib/playerDatabase.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${desc}`);
  }
}

function resetCalls() {
  calls.listWithValues = 0;
  calls.list = 0;
  calls.get = 0;
  calls.set = 0;
}

function samplePlayer(overrides = {}) {
  return {
    id: "p1",
    firstName: "Jamie",
    lastName: "Cruz",
    displayName: "Jamie Cruz",
    photo: null,
    skill: "beginner",
    active: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

// Forces the next fetchAllPlayers() call to be a genuine fresh fetch —
// the same invalidation path a real save uses, not a test-only backdoor.
async function invalidateCache() {
  setShouldFail = false;
  await savePlayerRecord(samplePlayer({ id: "cache-reset-noop" }));
}

// ---- 1. first call performs one bulk request -------------------------------
{
  await invalidateCache();
  resetCalls();
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer()) }] };
  await fetchAllPlayers();
  assert("the first fetchAllPlayers() call performs exactly one bulk listWithValues request", calls.listWithValues === 1);
  assert("fetchAllPlayers() never calls list() (the old two-step scan)", calls.list === 0);
  assert("fetchAllPlayers() never calls get() (the old N+1 pattern)", calls.get === 0);
  assert("listWithValues is called with the PLAYER_DB_PREFIX and shared:true", calls.lastPrefix === "opl-player-" && calls.lastShared === true);
}

// Simulates the exact 330-player case measured in production: one call
// regardless of roster size, not 330 individual requests.
{
  await invalidateCache();
  resetCalls();
  const rows = Array.from({ length: 330 }, (_, i) => ({
    key: `opl-player-p${i}`,
    value: JSON.stringify(samplePlayer({ id: `p${i}`, displayName: `Player ${i}` })),
  }));
  listWithValuesResult = { rows };
  const players = await fetchAllPlayers();
  assert("330 players: exactly 1 request total (was 331 — 1 list + 330 get)", calls.listWithValues === 1 && calls.list === 0 && calls.get === 0);
  assert("330 players: all 330 records returned", players.length === 330);
}

// ---- 2. second call within TTL performs zero additional requests ----------
{
  await invalidateCache();
  resetCalls();
  const player = samplePlayer({ contactNumber: "555-0100" });
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(player) }] };
  const first = await fetchAllPlayers();
  const second = await fetchAllPlayers(); // moments later — well within the 8s TTL
  assert("a second call moments later performs zero additional requests", calls.listWithValues === 1);
  assert("both calls return equivalent data (the cached roster)", JSON.stringify(first) === JSON.stringify(second));
  assert("the record is deep-equal to what was stored (full fidelity, no field loss)", JSON.stringify(first[0]) === JSON.stringify(player));
}

// ---- 3. concurrent calls share one in-flight request -----------------------
{
  await invalidateCache();
  resetCalls();
  let resolveListWithValues;
  const pending = new Promise((resolve) => {
    resolveListWithValues = resolve;
  });
  const originalListWithValues = globalThis.window.storage.listWithValues;
  globalThis.window.storage.listWithValues = async (prefix, shared) => {
    calls.listWithValues++;
    calls.lastPrefix = prefix;
    calls.lastShared = shared;
    return pending;
  };

  const p1 = fetchAllPlayers();
  const p2 = fetchAllPlayers();
  assert("two calls issued before either resolves trigger only one real request", calls.listWithValues === 1);
  resolveListWithValues({ rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer()) }] });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert("both concurrent callers receive the same resolved roster", JSON.stringify(r1) === JSON.stringify(r2) && r1.length === 1);

  globalThis.window.storage.listWithValues = originalListWithValues;
}

// ---- 4. expired TTL causes one new bulk request ----------------------------
// (The exact TTL-boundary timing is exhaustively covered, with an injected
// clock, in scripts/verify-async-cache.mjs against the same createAsyncCache
// primitive fetchAllPlayers() is built on — not re-timed here with real
// waits. This test instead proves fetchAllPlayers() really is wired to
// that shared, invalidatable cache rather than its own separate one.)
{
  await invalidateCache();
  resetCalls();
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer({ displayName: "Before" })) }] };
  await fetchAllPlayers();
  await invalidateCache(); // stands in for "TTL has elapsed" — same effect: next call is a real fetch
  resetCalls();
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer({ displayName: "After" })) }] };
  const players = await fetchAllPlayers();
  assert("after the cache is invalidated (TTL-equivalent), exactly one new request is made", calls.listWithValues === 1);
  assert("the freshly-fetched data is returned, not the stale cached roster", players[0].displayName === "After");
}

// ---- 5/7. successful savePlayerRecord() invalidates the cache; a newly
// added player is visible immediately after save + next fetch -------------
{
  await invalidateCache();
  resetCalls();
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer()) }] };
  const before = await fetchAllPlayers();
  assert("baseline: one player before the add", before.length === 1);

  setShouldFail = false;
  const newPlayer = samplePlayer({ id: "p2", displayName: "New Player" });
  await savePlayerRecord(newPlayer);
  // The cache is now invalidated — the next fetchAllPlayers() call must be
  // a real request reflecting the updated roster (simulated here exactly
  // as the real opl_kv table would now contain both rows).
  resetCalls();
  listWithValuesResult = {
    rows: [
      { key: "opl-player-p1", value: JSON.stringify(samplePlayer()) },
      { key: "opl-player-p2", value: JSON.stringify(newPlayer) },
    ],
  };
  const after = await fetchAllPlayers();
  assert("a successful savePlayerRecord() triggers a fresh fetch on the next call (cache was invalidated)", calls.listWithValues === 1);
  assert("the newly added player is visible immediately after save + next fetch", after.some((p) => p.id === "p2"));
  assert("the roster now has both players", after.length === 2);
}

// ---- 8. edited player data becomes visible immediately after save + fetch -
{
  await invalidateCache();
  resetCalls();
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer({ skill: "beginner" })) }] };
  const before = await fetchAllPlayers();
  assert("baseline: player p1 starts as beginner", before[0].skill === "beginner");

  const edited = samplePlayer({ skill: "advanced" });
  await savePlayerRecord(edited);
  resetCalls();
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(edited) }] };
  const after = await fetchAllPlayers();
  assert("an edited player's new data is visible immediately after save + next fetch", after[0].skill === "advanced");
  assert("the edit triggered exactly one fresh fetch", calls.listWithValues === 1);
}

// ---- 6. a FAILED savePlayerRecord() does not invalidate/replace a
// previously valid cached roster ---------------------------------------------
{
  await invalidateCache();
  resetCalls();
  const original = samplePlayer({ displayName: "Original Cached Value" });
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(original) }] };
  const cached = await fetchAllPlayers();
  assert("baseline fetch populates the cache", cached[0].displayName === "Original Cached Value");

  setShouldFail = true;
  let saveThrew = false;
  try {
    await savePlayerRecord(samplePlayer({ id: "p-fails", displayName: "Should Never Appear" }));
  } catch {
    saveThrew = true;
  }
  setShouldFail = false;
  assert("the failing save actually threw (sanity check on the test's own mock)", saveThrew);

  resetCalls();
  // If the failed save had wrongly invalidated the cache, this call would
  // issue a real request; listWithValuesResult is deliberately left
  // pointing at stale/different data to make that failure visible.
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer({ displayName: "WRONG — should never be seen" })) }] };
  const stillCached = await fetchAllPlayers();
  assert("a failed save performs zero additional requests — the cache was never invalidated", calls.listWithValues === 0);
  assert("the previously cached (correct) roster is still returned after a failed save", stillCached[0].displayName === "Original Cached Value");
}

// ---- 9. malformed records retain existing behavior -------------------------
{
  await invalidateCache();
  resetCalls();
  listWithValuesResult = {
    rows: [
      { key: "opl-player-good", value: JSON.stringify(samplePlayer({ id: "good" })) },
      { key: "opl-player-bad", value: "{not valid json" },
    ],
  };
  const players = await fetchAllPlayers();
  assert("a malformed stored value is skipped (same as the old try/catch → null → filter(Boolean))", players.length === 1);
  assert("the one good record still comes through despite the malformed sibling", players[0].id === "good");
}

// Empty roster behavior is unchanged.
{
  await invalidateCache();
  resetCalls();
  listWithValuesResult = { rows: [] };
  const players = await fetchAllPlayers();
  assert("an empty roster still returns []", Array.isArray(players) && players.length === 0);
  assert("an empty roster still only costs one request (not zero-then-skip, not an error)", calls.listWithValues === 1);
}

// ---- 10. no unrelated storage requests occur -------------------------------
{
  await invalidateCache();
  resetCalls();
  listWithValuesResult = { rows: [{ key: "opl-player-p1", value: JSON.stringify(samplePlayer()) }] };
  await fetchAllPlayers();
  assert("fetchAllPlayers() never calls list()/get() — read-only, single-request", calls.list === 0 && calls.get === 0);
  assert("fetchAllPlayers() never calls set() — no write side effects", calls.set === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
