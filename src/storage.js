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

const TABLE = "opl_kv";

async function get(key, shared = false) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("value")
    .eq("key", key)
    .eq("shared", shared)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // matches the real API: accessing a missing key throws rather than
    // returning null
    throw new Error(`storage.get: key not found: ${key}`);
  }
  return { key, value: data.value, shared };
}

async function set(key, value, shared = false) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, shared, value, updated_at: new Date().toISOString() }, { onConflict: "key,shared" });
  if (error) throw error;
  return { key, value, shared };
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

// Subscribes to Postgres changes (insert/update/delete) for a single key so
// callers can react the moment another device writes to it, instead of
// polling. Returns an unsubscribe function.
function subscribeToKey(key, shared, onChange) {
  const channel = supabase
    .channel(`opl_kv:${shared ? "shared" : "local"}:${key}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `key=eq.${key}` },
      (payload) => onChange(payload)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

const storage = { get, set, delete: del, list, subscribeToKey };

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
