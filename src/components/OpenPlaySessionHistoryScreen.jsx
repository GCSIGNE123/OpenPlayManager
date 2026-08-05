import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllSessionReports } from "../lib/sessionReportModel.js";
import SessionAnalyticsReport from "./SessionAnalyticsReport.jsx";
import SectionLabel from "./SectionLabel.jsx";

function formatDate(ts) {
  return ts ? new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

// Session History (Sprint 4B) — a thin, read-only list over
// fetchAllSessionReports(); opening one reuses SessionAnalyticsReport
// exactly as-is (onClose only, no onConfirm/onCancel) so "reopen a saved
// report" and "review before ending a session" are guaranteed to show the
// identical shape, never two slightly-different renderings of the same
// data. Nothing here mutates a saved report.
export default function OpenPlaySessionHistoryScreen({ onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchAllSessionReports()
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Session History</SectionLabel>

      {loading ? (
        <p style={styles.editHint}>Loading…</p>
      ) : reports.length === 0 ? (
        <div style={styles.placeholderCard}>No saved session reports yet — reports are saved when a facilitator confirms End Session.</div>
      ) : (
        reports.map((r) => (
          <button
            key={r.id}
            style={{ ...styles.landingCard, textAlign: "left", width: "100%", cursor: "pointer" }}
            onClick={() => setSelected(r)}
          >
            <h2 style={styles.landingCardTitle}>{r.sessionSummary?.venue || "Untitled session"}</h2>
            <p style={styles.landingCardText}>
              {r.sessionSummary?.rotationModeLabel} · {formatDate(r.savedAt)} · Grade {r.grade?.score} ({r.grade?.label})
            </p>
          </button>
        ))
      )}

      {selected && <SessionAnalyticsReport report={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
