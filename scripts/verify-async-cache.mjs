// Phase 5d egress fix — unit tests for src/lib/asyncCache.js (Pro's own
// port of pickleking-player/src/lib/asyncCache.js's already-proven
// primitive). These exercise the cache primitive directly with an
// injected clock/deferred promises — the exact TTL-boundary and
// failure-isolation behavior playerDatabase.js's fetchAllPlayers() relies
// on, tested here deterministically rather than by waiting real seconds.
//
// Usage: node scripts/verify-async-cache.mjs
import { createAsyncCache } from "../src/lib/asyncCache.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${desc}`);
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ---- 1/3. first call performs one fetch; concurrent calls share it --------
{
  let calls = 0;
  const d = deferred();
  const cache = createAsyncCache(() => {
    calls += 1;
    return d.promise;
  });

  const p1 = cache.get();
  const p2 = cache.get();
  assert("a second call made before the first resolved triggers zero additional fetches", calls === 1);
  d.resolve("roster-v1");
  const [v1, v2] = await Promise.all([p1, p2]);
  assert("both concurrent callers receive the same resolved value", v1 === "roster-v1" && v2 === "roster-v1");
}

// ---- 2. a call within the TTL reuses the cached value, zero new fetch -----
{
  let calls = 0;
  const cache = createAsyncCache(async () => {
    calls += 1;
    return `roster-v${calls}`;
  }, { ttlMs: 8000 });

  const first = await cache.get(1000);
  const second = await cache.get(1500); // 500ms later, well within the 8s TTL
  assert("a call within the TTL performs zero additional fetches", calls === 1);
  assert("both calls return the identical cached roster", first === "roster-v1" && second === "roster-v1");
}

// ---- 4. an expired TTL triggers exactly one new fetch ----------------------
{
  let calls = 0;
  const cache = createAsyncCache(async () => {
    calls += 1;
    return `roster-v${calls}`;
  }, { ttlMs: 8000 });

  await cache.get(1000);
  const afterExpiry = await cache.get(1000 + 8000); // exactly at the boundary — strict less-than
  assert("a call at/after the TTL boundary triggers exactly one fresh fetch", calls === 2);
  assert("the fresh fetch's value is returned, not the stale one", afterExpiry === "roster-v2");
}

// ---- invalidate() forces a fresh fetch even within the TTL window ----------
{
  let calls = 0;
  const cache = createAsyncCache(async () => {
    calls += 1;
    return `roster-v${calls}`;
  }, { ttlMs: 8000 });

  await cache.get(1000);
  cache.invalidate();
  const afterInvalidate = await cache.get(1001); // 1ms later — would have hit cache without invalidate()
  assert("invalidate() forces the very next call to fetch again, even 1ms later", calls === 2);
  assert("the post-invalidate call returns the freshly-fetched value", afterInvalidate === "roster-v2");
}

// ---- 6. a rejected fetch is never cached — no poisoning --------------------
{
  let calls = 0;
  const cache = createAsyncCache(async () => {
    calls += 1;
    if (calls === 1) throw new Error("network error");
    return "roster-v2";
  }, { ttlMs: 8000 });

  let firstCallThrew = false;
  try {
    await cache.get(1000);
  } catch (e) {
    firstCallThrew = e.message === "network error";
  }
  assert("the first (failing) call's rejection propagates to the caller", firstCallThrew);
  const retried = await cache.get(1001); // 1ms later — a SUCCESS would have been cached this soon, a failure must not be
  assert("the very next call retries immediately, not blocked by the TTL, after a failure", calls === 2 && retried === "roster-v2");
}

// Concurrent callers during an in-flight request that then FAILS all see
// the same rejection, and only one fetch was ever attempted.
{
  let calls = 0;
  const d = deferred();
  const cache = createAsyncCache(() => {
    calls += 1;
    return d.promise;
  });

  const p1 = cache.get();
  const p2 = cache.get();
  d.resolve(Promise.reject(new Error("boom")));

  let p1Threw = false, p2Threw = false;
  try {
    await p1;
  } catch (e) {
    p1Threw = e.message === "boom";
  }
  try {
    await p2;
  } catch (e) {
    p2Threw = e.message === "boom";
  }
  assert("both concurrent callers reject with the same error", p1Threw && p2Threw);
  assert("only one fetch was attempted for both concurrent (failing) callers", calls === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
