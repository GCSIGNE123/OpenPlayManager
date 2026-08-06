// All Sessions — see PROJECT.md/FEATURES.md. A persistent index of every
// session ever created (keyed by its own sessionCode, one record apiece),
// independent of both the live session record (STORAGE_PREFIX, deleted at
// End Session) and the saved analytics report (SESSION_REPORT_PREFIX, only
// written once a report exists). This is the one place an organizer can
// find EVERY session — still running, manually ended, or auto-ended for
// inactivity — with when it opened and when it closed, regardless of
// which of those states it's in right now.
import { STORAGE_PREFIX, SESSION_INDEX_PREFIX, SESSION_AUTO_END_AGE_MS } from "./constants.js";
import { computeSessionAnalyticsReport } from "./sessionAnalytics.js";
import { saveSessionReport } from "./sessionReportModel.js";

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

// Auto-End Aged Sessions — see PROJECT.md/FEATURES.md. Run once whenever
// the All Sessions screen mounts (this app has no server-side cron; a
// facilitator/organizer viewing that screen is what triggers the check —
// documented limitation, not a background job). Any index entry still
// "active" whose underlying session has been running for
// SESSION_AUTO_END_AGE_MS (3 days) or more is ended exactly the way a
// manual End Session would: a report is generated and saved (so its final
// standings/payment status are preserved, reviewable from All Sessions
// exactly like any other ended session), then the live record is deleted.
// A session whose live record is already gone (deleted some other way,
// without its index entry being updated) is simply marked ended here too,
// rather than being swept every single time this runs.
export async function sweepAgedSessions(maxAgeMs = SESSION_AUTO_END_AGE_MS) {
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
    const startedAt = liveState.sessionStartedAt || entry.createdAt || 0;
    if (Date.now() - startedAt < maxAgeMs) continue;
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
    await recordSessionEnded(entry.sessionCode, { reason: "Auto-ended — inactive 3+ days" });
    endedCodes.push(entry.sessionCode);
  }
  return endedCodes;
}
