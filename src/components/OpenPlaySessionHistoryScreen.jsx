import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { styles } from "../styles.js";
import { STORAGE_PREFIX } from "../lib/constants.js";
import { fetchAllSessionReports } from "../lib/sessionReportModel.js";
import { fetchAllSessionIndexEntries, sweepAgedSessions } from "../lib/sessionIndexModel.js";
import { computeSessionAnalyticsReport } from "../lib/sessionAnalytics.js";
import SessionAnalyticsReport from "./SessionAnalyticsReport.jsx";
import SectionLabel from "./SectionLabel.jsx";

function formatDateTime(ts) {
  return ts
    ? new Date(ts).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}

// All Sessions — see PROJECT.md/FEATURES.md. Every session ever created
// (lib/sessionIndexModel.js's index, one entry per sessionCode, never
// deleted) — still running, manually ended, or auto-ended for 3+ days of
// inactivity — in one reviewable list, each showing when it opened and
// when it closed. Opening an ENDED session reuses its saved Session
// Analytics & Fairness Report (fetchAllSessionReports, matched by
// sessionCode) exactly as Session History always has; opening a STILL-
// ACTIVE session computes a fresh, live, read-only snapshot on the fly
// from its current data (computeSessionAnalyticsReport) — same component,
// same shape, nothing mutated either way. On mount, this screen also runs
// the automatic 3-day sweep (sweepAgedSessions) — the one place that check
// happens, since this app has no server-side cron; an organizer opening
// this screen is what triggers it.
export default function OpenPlaySessionHistoryScreen({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [openError, setOpenError] = useState("");
  const [autoEndedCount, setAutoEndedCount] = useState(0);

  useEffect(() => {
    (async () => {
      let ended = [];
      try {
        ended = await sweepAgedSessions();
      } catch (e) {
        // sweep failure shouldn't block viewing whatever the list already has
      }
      setAutoEndedCount(ended.length);
      try {
        const list = await fetchAllSessionIndexEntries();
        setEntries(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openEntry = async (entry) => {
    setOpenError("");
    if (entry.status === "active") {
      try {
        const res = await window.storage.get(`${STORAGE_PREFIX}${entry.sessionCode}`, true);
        if (!res?.value) {
          setOpenError("This session's live data is no longer available.");
          return;
        }
        const liveState = JSON.parse(res.value);
        setSelected(computeSessionAnalyticsReport(liveState));
      } catch (e) {
        setOpenError("Couldn't load this session's live data right now.");
      }
      return;
    }
    try {
      const reports = await fetchAllSessionReports();
      const match = reports.find((r) => r.sessionCode === entry.sessionCode);
      if (!match) {
        setOpenError("No saved report was found for this session.");
        return;
      }
      setSelected(match);
    } catch (e) {
      setOpenError("Couldn't load this session's report right now.");
    }
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>All Sessions</SectionLabel>

      {autoEndedCount > 0 && (
        <p style={styles.editHint}>
          {autoEndedCount} session{autoEndedCount === 1 ? "" : "s"} inactive for 3+ days {autoEndedCount === 1 ? "was" : "were"} just
          automatically ended.
        </p>
      )}
      {openError && <p style={styles.editWarning}>{openError}</p>}

      {loading ? (
        <p style={styles.editHint}>Loading…</p>
      ) : entries.length === 0 ? (
        <div style={styles.placeholderCard}>No sessions created yet.</div>
      ) : (
        entries.map((entry) => (
          <button
            key={entry.sessionCode}
            style={{ ...styles.landingCard, textAlign: "left", width: "100%", cursor: "pointer" }}
            onClick={() => openEntry(entry)}
          >
            <h2 style={styles.landingCardTitle}>{entry.venue || "Untitled session"}</h2>
            <p style={styles.landingCardText}>
              <span style={styles.statusTag(entry.status === "active" ? "live" : "finished")}>
                {entry.status === "active" ? "ACTIVE" : "ENDED"}
              </span>{" "}
              · Code {entry.sessionCode}
              <br />
              Opened: {formatDateTime(entry.createdAt)}
              <br />
              Closed: {entry.status === "active" ? "still running" : formatDateTime(entry.endedAt)}
              {entry.endReason && entry.status !== "active" && (
                <>
                  <br />
                  {entry.endReason}
                </>
              )}
            </p>
          </button>
        ))
      )}

      {selected && <SessionAnalyticsReport report={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
