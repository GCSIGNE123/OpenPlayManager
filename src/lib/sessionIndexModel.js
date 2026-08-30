// All Sessions — see PROJECT.md/FEATURES.md. A persistent index of every
// session ever created (keyed by its own sessionCode, one record apiece),
// independent of both the live session record (STORAGE_PREFIX, deleted at
// End Session) and the saved analytics report (SESSION_REPORT_PREFIX, only
// written once a report exists). This is the one place an organizer can
// find EVERY session — still running, manually ended, or auto-ended for
// inactivity — with when it opened and when it closed, regardless of
// which of those states it's in right now.
import { STORAGE_PREFIX, SESSION_INDEX_PREFIX, SESSION_AUTO_END_AGE_MS, SESSION_INACTIVITY_AGE_MS } from "./constants.js";
import { computeSessionAnalyticsReport } from "./sessionAnalytics.js";
import { saveSessionReport } from "./sessionReportModel.js";
import { expirationReason } from "./openPlaySessionLifecycle.js";

// The one canonical "end a session" sequence — used identically whether the
// end is a scheduled 3-day/24-hour auto-close (sweepAgedSessions below) or a
// server-side Edge Function sweep (supabase/functions/sweep-open-play-
// sessions) reusing this same module. Never a second/parallel implementation
// of "generate report -> delete live record -> mark index ended".
async function endExpiredSession(entry, liveState, reason) {
  try {
    const report = computeSessionAnalyticsReport(liveState);
    await saveSessionReport(report, entry.sessionCode);
  } catch (e) {
    // report generation/save failing shouldn't block ending the session
  }
  try {
    await window.storage.delete(`${STORAGE_PREFIX}${entry.sessionCode}`, true);
  } catch (e) {
    // deletion failure shouldn't block marking the index entry ended
  }
  await recordSessionEnded(entry.sessionCode, { reason });
}

// Written once, at the moment a session is created (see PickleballOpenPlay.jsx's
// startSession) — never touched again except by recordSessionEnded below.
export async function recordSessionCreated({ sessionCode, venue, rotationMode, sessionType, createdAt }) {
  const entry = {
    sessionCode,
    venue,
    rotationMode,
    sessionType,
    createdAt,
    endedAt: null,
    status: "active",
    endReason: null,
  };
  await window.storage.set(`${SESSION_INDEX_PREFIX}${sessionCode}`, JSON.stringify(entry), true);
  return entry;
}

// Marks a session's index entry ended — called both by a facilitator's own
// manual End Session (confirmEndSession, PickleballOpenPlay.jsx) and by the
// automatic 3-day sweep below. Writes a fresh minimal entry (rather than
// silently no-op'ing) if the index record is somehow missing — e.g. a
// session created before this feature existed — so it still shows up in
// All Sessions from this point forward instead of vanishing invisibly.
export async function recordSessionEnded(sessionCode, { endedAt = Date.now(), reason = "Ended by facilitator", venue, rotationMode, sessionType } = {}) {
  const key = `${SESSION_INDEX_PREFIX}${sessionCode}`;
  let entry;
  try {
    const res = await window.storage.get(key, true);
    entry = res?.value ? JSON.parse(res.value) : null;
  } catch (e) {
    entry = null;
  }
  const next = {
    sessionCode,
    venue: entry?.venue ?? venue ?? "",
    rotationMode: entry?.rotationMode ?? rotationMode ?? null,
    sessionType: entry?.sessionType ?? sessionType ?? "openPlay",
    createdAt: entry?.createdAt ?? null,
    endedAt,
    status: "ended",
    endReason: reason,
  };
  await window.storage.set(key, JSON.stringify(next), true);
  return next;
}

export async function fetchAllSessionIndexEntries() {
  const { keys } = await window.storage.list(SESSION_INDEX_PREFIX, true);
  const records = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null;
      }
    })
  );
  // newest-created first — same convention as fetchAllSessionReports
  return records.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Auto-End Aged Sessions + 24-Hour Inactivity Auto-Close — see PROJECT.md/
// FEATURES.md. Run whenever the All Sessions screen mounts (client-
// triggered, same as always) AND, independently, on a schedule by
// supabase/functions/sweep-open-play-sessions (see that function's own
// header — the real "genuinely automatic, doesn't depend on anyone opening
// a screen" mechanism). Both callers share this exact function.
//
// An index entry still "active" is ended (via endExpiredSession above —
// the one canonical end sequence) when EITHER:
//   - its session has been running SESSION_AUTO_END_AGE_MS (3 days) or
//     more since sessionStartedAt (the original rule, unchanged), OR
//   - it has had no MEANINGFUL activity (see lib/openPlaySessionLifecycle.js
//     and PickleballOpenPlay.jsx's save()) for SESSION_INACTIVITY_AGE_MS
//     (24 hours) — a NEW, separate rule; a session can fail this one while
//     comfortably under the 3-day ceiling.
// A session whose live record is already gone (deleted some other way,
// without its index entry being updated) is simply marked ended here too,
// rather than being swept every single time this runs.
export async function sweepAgedSessions(maxAgeMs = SESSION_AUTO_END_AGE_MS, maxInactivityMs = SESSION_INACTIVITY_AGE_MS) {
  const entries = await fetchAllSessionIndexEntries();
  const activeEntries = entries.filter((e) => e.status === "active");
  const endedCodes = [];
  for (const entry of activeEntries) {
    let liveState = null;
    try {
      const res = await window.storage.get(`${STORAGE_PREFIX}${entry.sessionCode}`, true);
      liveState = res?.value ? JSON.parse(res.value) : null;
    } catch (e) {
      liveState = null;
    }
    if (!liveState) {
      // orphaned index entry — the live session is already gone some other
      // way; mark it ended so the sweep doesn't re-check it forever
      await recordSessionEnded(entry.sessionCode, { reason: "Session data no longer available" });
      endedCodes.push(entry.sessionCode);
      continue;
    }
    // Race safety (Idempotency / Race Safety — see the approved design):
    // re-read liveState fresh above (never a cached/stale copy), and
    // re-evaluate expirationReason against THAT read, right before ending
    // it — so a session that received meaningful activity between this
    // sweep starting and this specific iteration running is correctly
    // seen as current (its freshly-read lastActivityAt already reflects
    // that activity) and is left alone, never incorrectly ended.
    const reason = expirationReason(liveState, Date.now(), { maxAgeMs, maxInactivityMs });
    if (!reason || reason === "missing-session-data") continue; // current, or malformed data — never guessed expired
    const endReason = reason === "age" ? "Auto-ended — inactive 3+ days" : "Auto-ended — inactive 24h";
    await endExpiredSession(entry, liveState, endReason);
    endedCodes.push(entry.sessionCode);
  }
  return endedCodes;
}
