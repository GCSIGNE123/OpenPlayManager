// Short-lived async result cache + in-flight de-duplication.
//
// Mirrors the CONCEPT of pickleking-player/src/lib/asyncCache.js (that
// repo's own Phase 2 egress fix) but is a separate, self-contained
// implementation — same "different repo/build target, not a shared
// import" precedent as photoStorage.js/realtimeStorageEvents.js already
// follow in this codebase.
//
// Phase 5d egress fix — playerDatabase.js's fetchAllPlayers() (a bulk
// ~2.64 MB roster fetch, see EGRESS.md) was being called independently by
// up to 8 different Pro screens, each paying the full cost on every mount
// even when another screen had fetched the identical data moments
// earlier. This doesn't change WHAT is fetched (same query, same
// parsing/filtering rules), only HOW OFTEN a real network request is
// actually made: calls made concurrently share the one in-flight request,
// and a call made shortly after a previous one resolved reuses that
// result instead of re-fetching.
export function createAsyncCache(fetchFn, { ttlMs = 8000 } = {}) {
  let inFlight = null;
  let cachedAt = 0;
  let cachedValue;
  let hasCachedValue = false;

  return {
    get(now = Date.now()) {
      if (inFlight) return inFlight;
      if (hasCachedValue && now - cachedAt < ttlMs) return Promise.resolve(cachedValue);
      // `cachedAt` is stamped from the `now` this fetch was REQUESTED at
      // (not when it resolves) — deterministic under an injected clock for
      // tests, and in practice indistinguishable from resolution time
      // since a real request's round-trip is far shorter than any
      // sensible ttlMs.
      const requestedAt = now;
      inFlight = fetchFn()
        .then((value) => {
          cachedValue = value;
          hasCachedValue = true;
          cachedAt = requestedAt;
          return value;
        })
        .finally(() => {
          inFlight = null;
        });
      // A rejected fetchFn() propagates through unchanged (the .then()
      // success handler above simply never runs) — cachedValue/
      // hasCachedValue/cachedAt are only ever set on success, so a failed
      // request never poisons the cache; the next call retries for real.
      return inFlight;
    },
    // Called by savePlayerRecord() after a successful write, so the next
    // fetchAllPlayers() call sees the new/edited record instead of a
    // stale cached roster.
    invalidate() {
      inFlight = null;
      cachedAt = 0;
      hasCachedValue = false;
      cachedValue = undefined;
    },
  };
}
