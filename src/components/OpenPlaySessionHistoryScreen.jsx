import { useEffect, useState } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import { styles } from "../styles.js";
import { STORAGE_PREFIX } from "../lib/constants.js";
import { fetchAllSessionReports } from "../lib/sessionReportModel.js";
import { fetchAllSessionIndexEntries, sweepAgedSessions, endSessionAndRecord } from "../lib/sessionIndexModel.js";
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
  // End Session from All Sessions — see PROJECT.md. `endTarget` holds
  // { entry, report } while the confirmation dialog (the SAME
  // SessionAnalyticsReport component/pattern PickleballOpenPlay.jsx's own
  // manual End Session already uses, in its onConfirm/onCancel mode) is
  // open; `report` is only ever used to DISPLAY the dialog — the actual
  // end operation re-reads the live session fresh at confirm time (see
  // confirmEndFromHistory), never acting on a possibly-stale snapshot.
  const [endTarget, setEndTarget] = useState(null);
  const [endBusy, setEndBusy] = useState(false);
  const [endError, setEndError] = useState("");

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

  // End Session — see PROJECT.md/FEATURES.md. Only ever offered for
  // entry.status === "active" (enforced by the card's own render below,
  // not just here) — an already-ended session, or one of a session type
  // the canonical flow doesn't apply to, is never reachable this way.
  // Shows the exact same Session Analytics & Fairness Report review
  // PickleballOpenPlay.jsx's own manual End Session already shows before
  // ending, reusing computeSessionAnalyticsReport exactly as openEntry
  // above already does for viewing an active session — no second report
  // implementation.
  const startEndSession = async (entry) => {
    setEndError("");
    try {
      const res = await window.storage.get(`${STORAGE_PREFIX}${entry.sessionCode}`, true);
      if (!res?.value) {
        setEndError("This session's live data is no longer available.");
        return;
      }
      const liveState = JSON.parse(res.value);
      setEndTarget({ entry, report: computeSessionAnalyticsReport(liveState) });
    } catch (e) {
      setEndError("Couldn't load this session's live data right now.");
    }
  };

  const cancelEndFromHistory = () => {
    if (endBusy) return; // the dialog's own Cancel/close buttons already disable while busy; this is belt-and-suspenders
    setEndTarget(null);
  };

  // Confirm — invokes the SAME canonical endSessionAndRecord sequence
  // (save report -> delete live opl-session-* row -> mark the index entry
  // ended) that both the automatic 3-day/24-hour sweep and the server-side
  // sweep Edge Function already use — never a second/parallel
  // implementation of "end a session". Re-reads the live session fresh
  // right here (not the possibly-several-seconds-stale `endTarget.report`
  // snapshot) before ending it, same race-safety precedent
  // sweepAgedSessions itself already follows.
  const confirmEndFromHistory = async () => {
    if (!endTarget || endBusy) return; // re-entrancy guard — a double-click/duplicate event can't end the same session twice
    const { entry } = endTarget;
    setEndBusy(true);
    setEndError("");
    try {
      const res = await window.storage.get(`${STORAGE_PREFIX}${entry.sessionCode}`, true);
      const liveState = res?.value ? JSON.parse(res.value) : null;
      if (!liveState) {
        setEndError("This session's live data is no longer available — it may have already ended.");
        return;
      }
      await endSessionAndRecord(entry, liveState, "Ended by facilitator");
      const list = await fetchAllSessionIndexEntries();
      setEntries(list);
      setEndTarget(null);
    } catch (e) {
      // Never pretend the session ended — endTarget stays set (still
      // showing "active" in `entries`, untouched) and the dialog stays
      // open so the organizer can see the error and retry.
      setEndError("Couldn't end this session right now. Please try again.");
    } finally {
      setEndBusy(false);
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
      {endError && !endTarget && <p style={styles.editWarning}>{endError}</p>}

      {loading ? (
        <p style={styles.editHint}>Loading…</p>
      ) : entries.length === 0 ? (
        <div style={styles.placeholderCard}>No sessions created yet.</div>
      ) : (
        entries.map((entry) => (
          <div key={entry.sessionCode} style={styles.landingCard}>
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
            <div style={styles.sessionCardActions}>
              {/* secondaryBtn's own `margin: "0 auto"` is meant for a
                  single centered button elsewhere in the app — overridden
                  here so two buttons sit side by side without the huge gap
                  auto-centering would otherwise produce in this row. */}
              <button style={{ ...styles.secondaryBtn, margin: 0 }} onClick={() => openEntry(entry)}>
                Open Session
              </button>
              {/* End Session — active sessions only, enforced here (never
                  rendered at all for an ended/historical card) as well as
                  inside startEndSession itself. */}
              {entry.status === "active" && (
                <button style={styles.sessionCardEndBtn} onClick={() => startEndSession(entry)}>
                  <LogOut size={13} strokeWidth={2.5} />
                  End Session
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {selected && <SessionAnalyticsReport report={selected} onClose={() => setSelected(null)} />}

      {endTarget && (
        <SessionAnalyticsReport
          report={endTarget.report}
          onConfirm={confirmEndFromHistory}
          onCancel={cancelEndFromHistory}
          confirmBusy={endBusy}
          confirmError={endError}
        />
      )}
    </div>
  );
}
