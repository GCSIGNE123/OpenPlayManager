// Session Report persistence (Sprint 4B) — see PROJECT.md/FEATURES.md.
// Same shape as every other shared-KV list in this app (leagueModel.js,
// courtDatabase.js, bookingModel.js, Role.js, TournamentTemplateService.js,
// tournamentModel.js): one record per id under a shared string prefix,
// listed via window.storage.list(PREFIX). Deliberately its own registry
// (SESSION_REPORT_PREFIX), independent of the live session's own
// STORAGE_PREFIX record — a saved report must survive End Session
// deleting that record.
//
// Stores exactly what Sprint 4A's computeSessionAnalyticsReport already
// returns (see lib/sessionAnalytics.js), plus an id/sessionCode/savedAt —
// never the raw player roster/matchHistory. Reopening a report only ever
// reads it back; nothing here mutates a saved report once written.
import { SESSION_REPORT_PREFIX } from "./constants.js";
import { uid } from "./random.js";

export async function fetchAllSessionReports() {
  const { keys } = await window.storage.list(SESSION_REPORT_PREFIX, true);
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
  // newest first — matches every other history-style list in this app
  return records.filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export async function fetchSessionReportById(id) {
  try {
    const res = await window.storage.get(`${SESSION_REPORT_PREFIX}${id}`, true);
    return res?.value ? JSON.parse(res.value) : null;
  } catch (e) {
    return null;
  }
}

// `report` is the plain object computeSessionAnalyticsReport returned —
// `sessionCode` is passed separately since the report itself never reads
// or stores it (sessionAnalytics.js is intentionally session-code-agnostic,
// see its own header comment).
export async function saveSessionReport(report, sessionCode) {
  const stamped = { id: uid(), sessionCode, savedAt: Date.now(), ...report };
  await window.storage.set(`${SESSION_REPORT_PREFIX}${stamped.id}`, JSON.stringify(stamped), true);
  return stamped;
}
