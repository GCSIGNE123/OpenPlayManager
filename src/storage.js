// -----------------------------------------------------------------------
// window.storage shim
// -----------------------------------------------------------------------
// The app was originally built as a Claude.ai artifact, where `window.storage`
// is provided by the host environment and backed by a real server-side
// key/value store shared across every browser/device viewing the artifact.
// That is what makes "everyone sees the same live scores" possible there.
//
// Outside of Claude.ai there is no such host API, so this file provides a
// drop-in replacement with the exact same method signatures
// (get/set/delete/list, each with a `shared` flag), backed by a Supabase
// Postgres table (see supabase/schema.sql) instead of a host-provided store.
// Every device pointed at the same Supabase project shares the same data,
// and `subscribeToKey` below uses Supabase Realtime so changes show up on
// every connected device within roughly a second, without polling.
// -----------------------------------------------------------------------

import { supabase } from "./lib/supabaseClient.js";
import { createResyncStatusHandler } from "./lib/realtimeStorageEvents.js";

const TABLE = "opl_kv";

async function get(key, shared = false) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("value, updated_at")
    .eq("key", key)
    .eq("shared", shared)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // matches the real API: accessing a missing key throws rather than
    // returning null
    throw new Error(`storage.get: key not found: ${key}`);
  }
  // `updatedAt` is the row's own conflict-detection token — see `set`'s
  // `ifMatch` below. Every existing caller already ignores extra fields on
  // this return value, so surfacing it here is additive/non-breaking.
  return { key, value: data.value, shared, updatedAt: data.updated_at };
}

// Thrown by `set` when `ifMatch` was given and didn't match the row's
// CURRENT `updated_at` at write time — either someone else's write landed
// first, or the row didn't exist yet. `name`/`code` let a caller
// distinguish this from an ordinary Supabase/network error without
// string-matching the message.
export class StaleWriteError extends Error {
  constructor(key) {
    super(`storage.set: stale write rejected for key: ${key}`);
    this.name = "StaleWriteError";
    this.code = "STALE_WRITE";
  }
}

// `ifMatch` (optional) — the `updatedAt` token from a PRIOR `get()` of this
// exact row. When given, this performs a conditional UPDATE
// (`WHERE key=? AND shared=? AND updated_at=?`) instead of a blind upsert:
// a single UPDATE statement is atomic at the database row level, so of two
// concurrent writers racing on the same row, at most one's WHERE clause can
// still match (Postgres serializes the two UPDATEs; the loser's `updated_at`
// predicate is re-evaluated against the row the winner just changed, and no
// longer matches) — a real compare-and-swap, not a client-side timestamp
// comparison. Omitting `ifMatch` keeps every existing caller's original
// "just upsert it" behavior byte-for-byte unchanged — this is additive, not
// a behavior change for the 25+ other call sites that never pass it.
async function set(key, value, shared = false, { ifMatch } = {}) {
  if (ifMatch !== undefined && ifMatch !== null) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key)
      .eq("shared", shared)
      .eq("updated_at", ifMatch)
      .select("updated_at");
    if (error) throw error;
    if (!data || data.length === 0) throw new StaleWriteError(key);
    return { key, value, shared, updatedAt: data[0].updated_at };
  }
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ key, shared, value, updated_at: new Date().toISOString() }, { onConflict: "key,shared" })
    .select("updated_at");
  if (error) throw error;
  return { key, value, shared, updatedAt: data?.[0]?.updated_at };
}

async function del(key, shared = false) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("key", key)
    .eq("shared", shared)
    .select("key");
  if (error) throw error;
  return { key, deleted: (data?.length ?? 0) > 0, shared };
}

async function list(prefix = "", shared = false) {
  let query = supabase.from(TABLE).select("key").eq("shared", shared);
  if (prefix) query = query.like("key", `${prefix}%`);
  const { data, error } = await query;
  if (error) throw error;
  return { keys: (data ?? []).map((row) => row.key), prefix, shared };
}

// Phase 5c egress fix — the bulk sibling of list()+get(): one query
// returning every matching row's key AND value, instead of a `list()` for
// keys followed by an individual `get()` per key (an N+1 pattern —
// playerDatabase.js's fetchAllPlayers() was its one caller, at 330
// requests for 330 players). Same prefix/shared filtering as list(), same
// "no guaranteed row order" caveat (neither this nor list()/get() ever
// added an ORDER BY, so this preserves that exactly rather than
// introducing a new implicit guarantee).
async function listWithValues(prefix = "", shared = false) {
  let query = supabase.from(TABLE).select("key, value").eq("shared", shared);
  if (prefix) query = query.like("key", `${prefix}%`);
  const { data, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []).map((row) => ({ key: row.key, value: row.value })), prefix, shared };
}

// Adaptive Ranking Rotation — bulk keyed lookup: ONE query returning the
// rows for an explicit list of keys (`key IN (...)`), instead of one get()
// per key (an N+1 pattern). Missing keys are simply absent from the result
// (unlike get(), which throws for a missing key). Chunked at 100 keys per
// query purely to keep the request URL bounded — a session's registered
// players (typically < 100) is exactly one query.
async function getMany(keys = [], shared = false) {
  const unique = [...new Set(keys)];
  const rows = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await supabase
      .from(TABLE)
      .select("key, value")
      .eq("shared", shared)
      .in("key", chunk);
    if (error) throw error;
    (data ?? []).forEach((row) => rows.push({ key: row.key, value: row.value }));
  }
  return { rows, shared };
}

// Subscribes to Postgres changes (insert/update/delete) for a single key so
// callers can react the moment another device writes to it, instead of
// polling. Returns an unsubscribe function.
//
// `onResync` (optional, additive — existing 3-arg callers are completely
// unaffected) fires once per genuine RECONNECT after a disconnected gap,
// never on the initial subscribe (see lib/realtimeStorageEvents.js's
// header for why that distinction matters: Realtime does not replay
// events missed while disconnected, so only a reconnect needs a real
// re-fetch). Passing it lets a caller apply `onChange`'s payload directly
// for ordinary INSERT/UPDATE/DELETE — see PROJECT.md's egress notes —
// while still getting a correct one-time nudge to re-fetch after a drop.
function subscribeToKey(key, shared, onChange, onResync) {
  const channel = supabase
    .channel(`opl_kv:${shared ? "shared" : "local"}:${key}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `key=eq.${key}` },
      (payload) => onChange(payload)
    )
    .subscribe(createResyncStatusHandler(onResync));
  return () => {
    supabase.removeChannel(channel);
  };
}

const storage = { get, set, delete: del, list, listWithValues, getMany, subscribeToKey };

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
