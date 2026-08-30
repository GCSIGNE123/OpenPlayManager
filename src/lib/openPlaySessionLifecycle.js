// 24-Hour Inactivity Auto-Close + existing 3-Day Max Age — the single,
// canonical definition of "is this Open Play session still current," shared
// by:
//   - lib/sessionIndexModel.js's sweepAgedSessions (the real ending path)
//   - any Pro-side defensive read path that wants to treat a stale session
//     as already-expired before the next scheduled sweep runs (see
//     PickleKing Player's analogous src/lib/liveSessionLifecycle.js, which
//     this deliberately mirrors in shape/naming)
//   - supabase/functions/sweep-open-play-sessions (a Deno-runtime copy of
//     this same logic — see that function's own header comment for why a
//     cross-runtime import isn't used, and its parity test)
//
// Pure, zero dependencies (no window.storage, no Supabase client, no React)
// so it can be unit-tested directly and reused verbatim from a server-side
// Edge Function.
import { SESSION_AUTO_END_AGE_MS, SESSION_INACTIVITY_AGE_MS } from "./constants.js";

// A session is current only if BOTH hold:
//   (now - sessionStartedAt) < SESSION_AUTO_END_AGE_MS        (3-day ceiling, existing rule)
//   (now - lastActivityAt)   < SESSION_INACTIVITY_AGE_MS      (24h inactivity, new rule)
// lastActivityAt falls back to sessionStartedAt for a session record saved
// before this field existed (never guessed "fresh" — a missing timestamp on
// either side means NOT current, same fail-closed precedent as every other
// lifecycle check in this app).
export function isSessionCurrent(state, now = Date.now(), { maxAgeMs = SESSION_AUTO_END_AGE_MS, maxInactivityMs = SESSION_INACTIVITY_AGE_MS } = {}) {
  if (!state || typeof state !== "object") return false;
  const startedAt = state.sessionStartedAt;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return false;
  const lastActivityAt = typeof state.lastActivityAt === "number" && Number.isFinite(state.lastActivityAt) ? state.lastActivityAt : startedAt;
  const age = now - startedAt;
  const inactivity = now - lastActivityAt;
  if (age < 0 || inactivity < 0) return false; // future-dated timestamp — never treated as "fresh"
  return age < maxAgeMs && inactivity < maxInactivityMs;
}

// Which existing constant a NOT-current session actually failed — used only
// to choose the correct end reason string; never changes the current/expired
// verdict itself. Checked in the order a facilitator would expect: the 3-day
// ceiling is the more severe/older-standing rule, so it's reported first when
// a session happens to fail both at once.
export function expirationReason(state, now = Date.now(), { maxAgeMs = SESSION_AUTO_END_AGE_MS, maxInactivityMs = SESSION_INACTIVITY_AGE_MS } = {}) {
  if (!state || typeof state !== "object") return "missing-session-data";
  const startedAt = state.sessionStartedAt;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return "missing-session-data";
  const lastActivityAt = typeof state.lastActivityAt === "number" && Number.isFinite(state.lastActivityAt) ? state.lastActivityAt : startedAt;
  const age = now - startedAt;
  const inactivity = now - lastActivityAt;
  if (age >= maxAgeMs) return "age";
  if (inactivity >= maxInactivityMs) return "inactivity";
  return null; // current — not expired by either rule
}

export { SESSION_AUTO_END_AGE_MS, SESSION_INACTIVITY_AGE_MS };
