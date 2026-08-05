import { AlertTriangle, Check, FileJson, FileSpreadsheet, Printer, X } from "lucide-react";
import { styles } from "../styles.js";
import SectionLabel from "./SectionLabel.jsx";
import { ExportService } from "../engines/ExportService.js";
import { buildSessionReportExportTable } from "../lib/sessionReportExport.js";

// Session Report Export (Sprint 4C) — reuses ExportService exactly as
// Tournament Reports already does (see TournamentReportsView.jsx): CSV via
// its generic {title,columns,rows} shape (buildSessionReportExportTable
// flattens the report into that shape, no new CSV-writing code), JSON via
// its new exportJSON method, and PDF via the same browser-native
// window.print() + @media print convention (no PDF library dependency).
const exportService = new ExportService();

// Session Analytics Engine (Sprint 4A / V1) — see PROJECT.md/FEATURES.md.
// Pure presentation: every number here comes straight from
// lib/sessionAnalytics.js's computeSessionAnalyticsReport — this
// component never computes a metric itself, it only renders the shape
// that module returns. Shown full-screen (not the smaller 420px dialog
// pattern) since this is data-heavy, reusing the same dialogOverlay
// backdrop every other dialog in the app already uses.
//
// Two ways this renders (Sprint 4B): pass onConfirm/onCancel for the End
// Session review flow (Confirm actually ends the session; Cancel dismisses
// and the session continues); pass only onClose to reopen an already-saved
// report from Session History — read-only, no Confirm/Cancel, since the
// session those numbers came from is long over. Never both at once.
export default function SessionAnalyticsReport({ report, onConfirm, onCancel, onClose }) {
  if (!report) return null;
  const { sessionSummary, participation, waiting, diversity, adaptive, playersNeedingAttention, payment, paymentDetails, finalStandings, grade } = report;
  const isReopened = Boolean(onClose);
  const exportTitle = report.sessionSummary.venue
    ? `${report.sessionSummary.venue} — Session Analytics Report`
    : "Session Analytics Report";

  return (
    <div style={styles.dialogOverlay}>
      <div style={styles.analyticsReportCard}>
        {/* Print/PDF share one mechanism (same as TournamentReportsView.jsx):
            this rule hides everything on the page except the print area
            below, so window.print() always prints exactly the report, not
            the whole dialog overlay/buttons around it. */}
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #session-report-print-area, #session-report-print-area * { visibility: visible; }
            #session-report-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          }
        `}</style>

        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>Session Analytics & Fairness Report</h2>
          <button style={styles.iconBtn} onClick={isReopened ? onClose : onCancel} aria-label="Close report">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div style={styles.analyticsExportRow}>
          <button style={styles.secondaryBtn} onClick={() => exportService.exportPDF()}>
            <Printer size={13} strokeWidth={2.5} />
            Print / PDF
          </button>
          <button
            style={styles.secondaryBtn}
            onClick={() => exportService.exportCSV(buildSessionReportExportTable(report))}
          >
            <FileSpreadsheet size={13} strokeWidth={2.5} />
            Export CSV
          </button>
          <button style={styles.secondaryBtn} onClick={() => exportService.exportJSON(report, exportTitle)}>
            <FileJson size={13} strokeWidth={2.5} />
            Export JSON
          </button>
        </div>

        <div id="session-report-print-area">
        <div style={styles.analyticsGradeRow}>
          <span style={styles.analyticsGradeScore(grade.score)}>{grade.score}</span>
          <div>
            <div style={styles.analyticsGradeLabel}>{grade.label}</div>
            <div style={styles.analyticsGradeSub}>Session Grade — based on games, waiting, and diversity fairness together</div>
          </div>
        </div>

        <div style={styles.analyticsSection}>
          <SectionLabel>Session Summary</SectionLabel>
          <div style={styles.analyticsStatGrid}>
            <Stat label="Session" value={sessionSummary.venue || "—"} />
            <Stat label="Rotation Mode" value={sessionSummary.rotationModeLabel} />
            <Stat label="Duration" value={sessionSummary.durationLabel} />
            <Stat label="Courts" value={sessionSummary.courtsCount} />
            <Stat label="Players" value={sessionSummary.playersCount} />
          </div>
        </div>

        <div style={styles.analyticsSection}>
          <SectionLabel>Participation</SectionLabel>
          <div style={styles.analyticsStatGrid}>
            <Stat label="Average Games Played" value={participation.averageGames} />
            <Stat label="Highest Games Played" value={participation.highestGames} />
            <Stat label="Lowest Games Played" value={participation.lowestGames} />
            <Stat label="Standard Deviation" value={participation.stdDevGames} />
            <Stat label="Games Fairness Score" value={`${participation.gamesFairnessScore} / 100`} />
          </div>
        </div>

        <div style={styles.analyticsSection}>
          <SectionLabel>Waiting Analysis</SectionLabel>
          <div style={styles.analyticsStatGrid}>
            <Stat label="Average Waiting Time" value={`${waiting.averageWaitMinutes} min`} />
            <Stat label="Longest Waiting Time" value={`${waiting.longestWaitMinutes} min`} />
            <Stat label="Avg Time Between Games" value={`${waiting.averageTimeBetweenGamesMinutes} min`} />
          </div>
        </div>

        <div style={styles.analyticsSection}>
          <SectionLabel>Diversity Analysis</SectionLabel>
          <div style={styles.analyticsStatGrid}>
            <Stat label="Avg Unique Partners" value={diversity.averageUniquePartners} />
            <Stat label="Avg Unique Opponents" value={diversity.averageUniqueOpponents} />
          </div>
        </div>

        {adaptive && (
          <div style={styles.analyticsSection}>
            <SectionLabel>Adaptive Skill Analysis</SectionLabel>
            <div style={styles.analyticsStatGrid}>
              <Stat label="Promotions" value={adaptive.promotions} />
              <Stat label="Relegations" value={adaptive.relegations} />
              <Stat label="Manual Skill Changes" value={adaptive.manualChanges} />
              <Stat label="Automatic Skill Changes" value={adaptive.automaticChanges} />
            </div>
          </div>
        )}

        {payment && (
          <div style={styles.analyticsSection}>
            <SectionLabel>Payment Summary</SectionLabel>
            <div style={styles.analyticsStatGrid}>
              <Stat label="Total Players" value={payment.totalPlayers} />
              <Stat label="Paid" value={payment.paid} />
              <Stat label="Unpaid" value={payment.unpaid} />
              <Stat label="Cash" value={payment.cash} />
              <Stat label="GCash" value={payment.gcash} />
            </div>
            {/* Session Review Improvements — see PROJECT.md/FEATURES.md.
                Read-only: who paid, who's still unpaid, and by which
                method — reopenable from Session History after a session
                has ended, alongside the aggregate counts above. */}
            {paymentDetails && paymentDetails.length > 0 && (
              <div style={styles.analyticsPaymentList}>
                {paymentDetails.map((p) => (
                  <div key={p.playerId} style={styles.analyticsPaymentRow}>
                    <span style={styles.analyticsPaymentName}>{p.playerName}</span>
                    <span style={styles.paymentTag(p.paymentStatus === "paid")}>
                      {p.paymentStatus === "paid" ? (p.paymentMethod === "gcash" ? "P-GC" : "P-C") : "UP"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {finalStandings && finalStandings.length > 0 && (
          <div style={styles.analyticsSection}>
            <SectionLabel>Final Standings</SectionLabel>
            <div style={styles.standingsTable}>
              <div style={styles.standingsHeadRow}>
                <span style={styles.standingsRankCol}>#</span>
                <span style={styles.standingsNameCol}>Player</span>
                <span style={styles.standingsStatCol}>GP</span>
                <span style={styles.standingsStatCol}>W</span>
                <span style={styles.standingsStatCol}>L</span>
                <span style={styles.standingsStatCol}>+/-</span>
                <span style={styles.standingsRatingCol}>RTG</span>
              </div>
              {finalStandings.map((p, i) => (
                <div key={p.playerId} style={styles.standingsRow}>
                  <span style={styles.standingsRankCol}>{i + 1}</span>
                  <span style={styles.standingsNameCol}>
                    <span style={styles.standingsName}>{p.playerName}</span>
                  </span>
                  <span style={styles.standingsStatCol}>{p.gp}</span>
                  <span style={styles.standingsStatCol}>{p.wins}</span>
                  <span style={styles.standingsStatCol}>{p.losses}</span>
                  <span
                    style={{
                      ...styles.standingsStatCol,
                      color: p.diff > 0 ? "var(--color-success)" : p.diff < 0 ? "var(--color-error)" : "var(--color-text-faint)",
                      fontWeight: 700,
                    }}
                  >
                    {p.diff > 0 ? `+${p.diff}` : p.diff}
                  </span>
                  <span style={styles.standingsRatingCol}>
                    <span style={styles.ratingBadge(p.rating)}>{p.rating === null ? "—" : p.rating}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.analyticsSection}>
          <SectionLabel>Players Needing Attention</SectionLabel>
          {playersNeedingAttention.length === 0 ? (
            <p style={styles.analyticsEmptyNote}>No player experienced unusually poor fairness this session.</p>
          ) : (
            <div style={styles.analyticsAttentionList}>
              {playersNeedingAttention.map((p) => (
                <div key={p.playerId} style={styles.analyticsAttentionCard}>
                  <div style={styles.analyticsAttentionName}>
                    <AlertTriangle size={12} strokeWidth={2.5} style={{ verticalAlign: "-1px", marginRight: 5 }} />
                    {p.playerName}
                  </div>
                  <div style={styles.analyticsAttentionReason}>{p.reasons.join(" · ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        <div style={styles.dialogActions}>
          {isReopened ? (
            <button style={styles.secondaryBtn} onClick={onClose}>
              Close
            </button>
          ) : (
            <>
              <button style={styles.secondaryBtn} onClick={onCancel}>
                Cancel
              </button>
              <button style={styles.dangerBtn} onClick={onConfirm}>
                <Check size={14} strokeWidth={2.5} />
                Confirm end session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.analyticsStatItem}>
      <span style={styles.analyticsStatLabel}>{label}</span>
      <span style={styles.analyticsStatValue}>{value}</span>
    </div>
  );
}
