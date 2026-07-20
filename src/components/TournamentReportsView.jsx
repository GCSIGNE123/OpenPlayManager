import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { styles } from "../styles.js";
import { TournamentReportService } from "../engines/TournamentReportService.js";
import { ExportService } from "../engines/ExportService.js";
import SectionLabel from "./SectionLabel.jsx";

const reportService = new TournamentReportService();
const exportService = new ExportService();

const REPORT_TYPES = [
  { id: "summary", label: "Tournament Summary" },
  { id: "standings", label: "Standings" },
  { id: "matches", label: "Match Results" },
  { id: "playoffs", label: "Playoff Results" },
  { id: "playerStats", label: "Player Statistics" },
  { id: "courts", label: "Court Usage" },
  { id: "pools", label: "Pools" },
  { id: "timeline", label: "Timeline" },
];

// Every report type resolves to one-or-more { title, columns, rows } tables
// — pools is the only one that's naturally more than one (one per pool).
// Kept as an array uniformly so the render/export code below doesn't need a
// special case for "the pools report is different."
function buildTables(reportType, tournament) {
  if (reportType === "summary") return [reportService.generateTournamentSummary(tournament)];
  if (reportType === "standings") return [reportService.generateStandingsReport(tournament)];
  if (reportType === "matches") return [reportService.generateMatchReport(tournament)];
  if (reportType === "playoffs") return [reportService.generatePlayoffReport(tournament)];
  if (reportType === "playerStats") return [reportService.generatePlayerStatistics(tournament)];
  if (reportType === "courts") return [reportService.generateCourtUtilizationReport(tournament)];
  if (reportType === "timeline") return [reportService.generateTournamentTimeline(tournament)];
  return reportService.generatePoolReport(tournament);
}

// Flattens multiple tables (only ever happens for Pools) into the single
// table CSV export needs — same columns, each row tagged with which pool it
// came from, rather than exporting several tiny CSV files.
function flattenForExport(tables) {
  if (tables.length === 1) return tables[0];
  const columns = [...tables[0].columns, "Pool"];
  const rows = tables.flatMap((t) => t.rows.map((r) => [...r, t.poolLabel]));
  return { title: "Pool Report", columns, rows };
}

function ReportTable({ table }) {
  return (
    <div style={styles.tournamentStandingsScroll}>
      {table.poolLabel && <h3 style={styles.poolHeading}>{table.title}</h3>}
      <table style={styles.tournamentStandingsTable}>
        <thead>
          <tr style={styles.tournamentStandingsHeadRow}>
            {table.columns.map((c) => (
              <th key={c} style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.length === 0 ? (
            <tr>
              <td style={styles.tournamentStandingsCell} colSpan={table.columns.length}>
                No data yet.
              </td>
            </tr>
          ) : (
            table.rows.map((row, i) => (
              <tr key={i} style={styles.tournamentStandingsRow(99)}>
                {row.map((cell, j) => (
                  <td key={j} style={j === 0 ? styles.tournamentStandingsNameCell : styles.tournamentStandingsCell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// A dedicated Reports tab on the Tournament Dashboard — see PROJECT.md's
// Tournament Reports section. All five report types are pure derivations of
// the same `tournament` object the rest of the Dashboard already holds (see
// TournamentReportService), so this needs no data-fetching of its own.
//
// Print/PDF share one mechanism: the @media print rule below hides
// everything on the page except #tournament-report-print-area, so
// window.print() (triggered by either the Print or the Export PDF button —
// they're the same underlying action, just labeled per the spec's separate
// UI buttons) always prints exactly the current report, not the whole
// dashboard chrome around it.
export default function TournamentReportsView({ tournament, loading }) {
  const [reportType, setReportType] = useState("summary");
  const [exportError, setExportError] = useState("");

  const tables = useMemo(() => {
    if (!tournament) return [];
    return buildTables(reportType, tournament);
  }, [reportType, tournament]);

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see reports here.</div>;
  }

  const activeLabel = REPORT_TYPES.find((r) => r.id === reportType).label;

  // Sprint 5 Validation — "Prevent exporting incomplete tournaments as final
  // reports." TournamentReportService.assertExportable is the actual rule;
  // this just surfaces its message instead of letting window.print()/the CSV
  // download fire on a report that's still mid-tournament.
  const runExport = (fn) => {
    try {
      reportService.assertExportable(tournament);
      setExportError("");
      fn();
    } catch (e) {
      setExportError(e.message);
    }
  };

  return (
    <div>
      <SectionLabel>Reports</SectionLabel>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #tournament-report-print-area, #tournament-report-print-area * { visibility: visible; }
          #tournament-report-print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>

      <div style={styles.dashboardTabRow}>
        {REPORT_TYPES.map((r) => (
          <button
            key={r.id}
            type="button"
            style={styles.dashboardTabBtn(reportType === r.id)}
            onClick={() => setReportType(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={() => runExport(() => exportService.exportPDF())}>
          <Printer size={13} strokeWidth={2.5} />
          Print
        </button>
        <button type="button" style={styles.secondaryBtn} onClick={() => runExport(() => exportService.exportPDF())}>
          <Download size={13} strokeWidth={2.5} />
          Export PDF
        </button>
        <button
          type="button"
          style={styles.secondaryBtn}
          onClick={() => runExport(() => exportService.exportCSV(flattenForExport(tables)))}
        >
          <Download size={13} strokeWidth={2.5} />
          Export CSV
        </button>
      </div>
      {exportError && <p style={styles.editWarning}>{exportError}</p>}

      <div id="tournament-report-print-area">
        <h2 style={{ ...styles.poolHeading, fontSize: 18 }}>{activeLabel}</h2>
        {tables.map((table, i) => (
          <ReportTable key={i} table={table} />
        ))}
      </div>
    </div>
  );
}
