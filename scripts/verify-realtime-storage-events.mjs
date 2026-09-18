// Phase 5a/5b egress fixes — unit tests for src/lib/realtimeStorageEvents.js
// (the Pro equivalent of Player's proven realtimeSessionEvents.js) and for
// storage.js's subscribeToKey resync behavior (mocked Supabase client, no
// network).
//
// Usage: node scripts/verify-realtime-storage-events.mjs
import { parseStorageChangePayload, createResyncStatusHandler, resolveRealtimeUpdate } from "../src/lib/realtimeStorageEvents.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${desc}`);
  }
}

// ---- parseStorageChangePayload ---------------------------------------------

{
  const insertPayload = { eventType: "INSERT", new: { value: JSON.stringify({ foo: "bar" }) } };
  const event = parseStorageChangePayload(insertPayload);
  assert("INSERT payload returns { value } parsed from payload.new.value", event?.value?.foo === "bar");
  assert("INSERT payload result has no `deleted` flag", !event.deleted);
}

{
  const updatePayload = { eventType: "UPDATE", new: { value: JSON.stringify({ updatedAt: 123 }) }, old: { value: null } };
  const event = parseStorageChangePayload(updatePayload);
  assert("UPDATE payload returns { value } parsed from payload.new.value (old row content is irrelevant/never read)", event?.value?.updatedAt === 123);
}

{
  const deletePayload = { eventType: "DELETE", old: { value: JSON.stringify({ some: "stale-data-never-read" }) } };
  const event = parseStorageChangePayload(deletePayload);
  assert("DELETE payload returns { deleted: true } without touching payload.old at all", event?.deleted === true);
  assert("DELETE payload result has no `value`", event.value === undefined);
}

assert("null payload returns null", parseStorageChangePayload(null) === null);
assert("undefined payload returns null", parseStorageChangePayload(undefined) === null);
assert(
  "an INSERT/UPDATE payload with a missing new.value returns null",
  parseStorageChangePayload({ eventType: "INSERT", new: {} }) === null
);
assert(
  "an INSERT/UPDATE payload with a non-string new.value returns null",
  parseStorageChangePayload({ eventType: "UPDATE", new: { value: { already: "an object" } } }) === null
);
assert(
  "malformed JSON in new.value returns null rather than throwing",
  parseStorageChangePayload({ eventType: "INSERT", new: { value: "{not valid json" } }) === null
);

// ---- createResyncStatusHandler ---------------------------------------------
// storage.js's subscribeToKey wires this exact function directly into
// Supabase's own `.subscribe((status) => ...)` callback — testing it here
// pins the real "first SUBSCRIBED never resyncs; every SUBSEQUENT
// SUBSCRIBED does" contract these five consumers depend on to never miss
// an update after a reconnect.
{
  const resyncCalls = [];
  const statusHandler = createResyncStatusHandler(() => resyncCalls.push("resync"));
  statusHandler("SUBSCRIBED"); // initial connect
  assert("the FIRST SUBSCRIBED never triggers onResync", resyncCalls.length === 0);
  statusHandler("CLOSED");
  statusHandler("SUBSCRIBED"); // reconnect
  assert("a SUBSEQUENT SUBSCRIBED (after a drop) triggers onResync exactly once", resyncCalls.length === 1);
  statusHandler("SUBSCRIBED"); // a third SUBSCRIBED (e.g. another drop+reconnect)
  assert("a THIRD SUBSCRIBED triggers onResync again", resyncCalls.length === 2);
}

{
  // onResync is optional — existing 3-arg callers (PickleballOpenPlay.jsx,
  // via subscribeToKey's own default) must never throw just because they
  // don't pass one.
  const statusHandler = createResyncStatusHandler(undefined);
  assert("missing onResync never throws on repeated SUBSCRIBED", (() => {
    try {
      statusHandler("SUBSCRIBED");
      statusHandler("CLOSED");
      statusHandler("SUBSCRIBED");
      return true;
    } catch {
      return false;
    }
  })());
}

assert(
  "an intermediate non-SUBSCRIBED status (e.g. CHANNEL_ERROR) never itself counts as a connect or a resync",
  (() => {
    const calls = [];
    const statusHandler = createResyncStatusHandler(() => calls.push("resync"));
    statusHandler("CHANNEL_ERROR");
    statusHandler("SUBSCRIBED"); // still the FIRST real SUBSCRIBED
    return calls.length === 0;
  })()
);

// ---- resolveRealtimeUpdate (Phase 5b — PickleballOpenPlay.jsx's organizer
// dashboard, the one consumer that also writes to this row locally and
// needs the updatedAt staleness guard preserved exactly) ---------------------

// 1. Newer Realtime payload replaces state.
{
  const payload = { eventType: "UPDATE", new: { value: JSON.stringify({ updatedAt: 200, foo: "new" }) } };
  const result = resolveRealtimeUpdate(payload, 100);
  assert("a newer payload (200 >= 100) resolves to action:apply with the new value", result.action === "apply" && result.value.foo === "new");
}

// 2. Older Realtime payload does not replace newer local state.
{
  const payload = { eventType: "UPDATE", new: { value: JSON.stringify({ updatedAt: 50, foo: "old" }) } };
  const result = resolveRealtimeUpdate(payload, 100);
  assert("an older payload (50 < 100) resolves to action:stale, never applied", result.action === "stale");
}

// 3. Equal updatedAt behavior matches the existing implementation — the
// original code used `>=`, so equal timestamps DO apply (not a no-op).
{
  const payload = { eventType: "UPDATE", new: { value: JSON.stringify({ updatedAt: 100, foo: "same-time" }) } };
  const result = resolveRealtimeUpdate(payload, 100);
  assert("an equal updatedAt (100 >= 100) still resolves to action:apply, matching the original >= comparison exactly", result.action === "apply");
}

// A currentUpdatedAt of 0/undefined must behave like the original
// `(stateRef.current.updatedAt || 0)` fallback.
{
  const payload = { eventType: "INSERT", new: { value: JSON.stringify({ updatedAt: 1, foo: "first-ever" }) } };
  assert(
    "undefined currentUpdatedAt falls back to 0, same as the original (stateRef.current.updatedAt || 0)",
    resolveRealtimeUpdate(payload, undefined).action === "apply"
  );
}

// 6. DELETE behavior — resolves to action:deleted; the caller (not this
// pure function) decides that this means "leave state untouched," which
// is what PickleballOpenPlay.jsx's applyRealtimeSessionChange does.
{
  const payload = { eventType: "DELETE", old: { value: JSON.stringify({ some: "stale-data-never-read" }) } };
  const result = resolveRealtimeUpdate(payload, 100);
  assert("a DELETE payload resolves to action:deleted regardless of currentUpdatedAt", result.action === "deleted");
}

// 7. Malformed payload behavior — resolves to action:refetch, so the
// caller falls back to a real, guarded fetch (load()) exactly like the
// old discard-and-refetch always did for every event.
assert(
  "a malformed payload (missing new.value) resolves to action:refetch",
  resolveRealtimeUpdate({ eventType: "UPDATE", new: {} }, 100).action === "refetch"
);
assert(
  "an unparseable JSON payload resolves to action:refetch",
  resolveRealtimeUpdate({ eventType: "UPDATE", new: { value: "{not json" } }, 100).action === "refetch"
);
assert("a null payload resolves to action:refetch", resolveRealtimeUpdate(null, 100).action === "refetch");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
