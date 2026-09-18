// Phase 5a egress fix — turns one Supabase Realtime `postgres_changes`
// payload for an opl_kv row into { value } / { deleted: true } / null, so a
// read-only display consumer (TournamentDisplayView.jsx,
// OpenPlayTVModePage.jsx, PlayerPortalScreen.jsx) no longer needs to
// discard the payload and re-fetch the full row on every single change —
// the exact same confirmed pattern already proven in
// pickleking-player/src/lib/realtimeSessionEvents.js (Phase 2), ported
// here for Pro's own equivalent read-only screens. See PROJECT.md/
// EGRESS.md's Phase 5a note.
//
// Why the payload can be trusted directly for INSERT/UPDATE: Postgres
// logical replication always sends the COMPLETE new row for INSERT/UPDATE
// (REPLICA IDENTITY only ever restricts what's included in the OLD row of
// an UPDATE/DELETE, never the NEW row) — opl_kv has no schema change here
// and needs none. payload.new.value is therefore byte-for-byte the same
// value a fresh `select("value")` would return for that same commit.
//
// Why DELETE never needs the row's content: every one of these five call
// sites already treats "the row is gone" as its own distinct case (an
// error message, or simply leaving the last-known state alone) — no field
// of the deleted row is ever read to make that decision.
//
// No supabaseClient.js import — directly unit-testable under plain
// `node scripts/verify-*.mjs`, same precedent as every other pure-logic
// module in this codebase.

// Returns { value } for INSERT/UPDATE (value already JSON.parse'd from
// payload.new.value), { deleted: true } for DELETE, or null if the
// payload can't be trusted (missing/malformed new.value) — callers should
// treat null the same as "nothing usable arrived," never guess a value.
export function parseStorageChangePayload(payload) {
  if (payload?.eventType === "DELETE") return { deleted: true };
  const raw = payload?.new?.value;
  if (typeof raw !== "string") return null;
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return null;
  }
}

// Tracks a Realtime channel's status transitions to distinguish the
// initial connect from a genuine reconnect after a disconnected gap.
// Returns a function meant to be handed directly to Supabase's own
// `.subscribe((status) => ...)` callback; it calls `onResync` exactly
// once per SUBSEQUENT "SUBSCRIBED" — never the first, since the caller
// already has fresh state from its own mount-time fetch at that point.
// storage.js's subscribeToKey uses this directly, so its resync behavior
// is exercised here under plain Node rather than only inside a real
// Supabase Realtime connection.
export function createResyncStatusHandler(onResync) {
  let hasConnectedBefore = false;
  return (status) => {
    if (status === "SUBSCRIBED" && hasConnectedBefore) onResync?.();
    if (status === "SUBSCRIBED") hasConnectedBefore = true;
  };
}

// Phase 5b egress fix — combines parseStorageChangePayload with an
// updatedAt staleness guard, for a caller (PickleballOpenPlay.jsx's
// organizer dashboard) that ALSO writes to this same row locally and must
// never let a slightly-stale Realtime echo of its own recent save()
// clobber newer local state. Pure — takes the current row's own
// updatedAt, never reads React state directly, so it's testable exactly
// like every other function here.
//
// Returns one of:
//   { action: "apply", value }  — a genuinely newer-or-equal row; apply it
//   { action: "stale" }         — a real row, but not newer than
//                                 currentUpdatedAt; the caller's own more
//                                 recent local state wins, nothing to do
//   { action: "deleted" }       — the row is gone; the caller decides what
//                                 that means (PickleballOpenPlay.jsx's own
//                                 load() has always left state untouched
//                                 for a missing row — this preserves that)
//   { action: "refetch" }       — the payload couldn't be trusted
//                                 (malformed/missing new.value); the
//                                 caller should fall back to a real,
//                                 guarded fetch, the same robustness the
//                                 old discard-and-refetch always had
export function resolveRealtimeUpdate(payload, currentUpdatedAt) {
  const event = parseStorageChangePayload(payload);
  if (!event) return { action: "refetch" };
  if (event.deleted) return { action: "deleted" };
  if (event.value.updatedAt >= (currentUpdatedAt || 0)) return { action: "apply", value: event.value };
  return { action: "stale" };
}
