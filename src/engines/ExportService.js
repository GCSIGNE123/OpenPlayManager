// Print/PDF/CSV export for any report shaped { title, columns, rows: string[][] }
// — see TournamentReportService.js, which is the only current producer of
// that shape, and PROJECT.md's Tournament Reports section for why the shape
// is deliberately generic. Being format-agnostic (it never looks at
// "tournament" or "pool" at all, only at title/columns/rows) is what makes
// this reusable later for Open Play's own reports (HistoryView.jsx today
// has its own bespoke CSV export; a future task could point it at this
// instead without rewriting it) and what leaves room for an Excel export
// method to be added here later without touching any report generator.
//
// CSV export mirrors HistoryView.jsx's exportHistoryCsv exactly (same
// Blob -> object URL -> anchor.click() download pattern) rather than
// reinventing it — there's now one shared downloadFile helper both could
// use, but HistoryView's own copy is left untouched since it's already
// shipped and this task is scoped to Tournament Manager only.
//
// PDF export deliberately does not use a PDF-generation library — none is
// installed in this project (see package.json), and adding one would be a
// first-of-its-kind new dependency for a "do not implement Excel export"
// -scoped task. Browser-native print-to-PDF (a print-optimized view +
// window.print(), letting the organizer choose "Save as PDF" in the OS
// print dialog) covers the same need with zero new dependencies.
function downloadFile(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export class ExportService {
  exportCSV(report) {
    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [report.columns, ...report.rows].map((r) => r.map(escape).join(",")).join("\r\n");
    downloadFile(csv, "text/csv;charset=utf-8", `${slugify(report.title)}.csv`);
  }

  // JSON export — Session Analytics & Fairness Report (Sprint 4C) is the
  // first caller: downloads the exact data object a report was built from,
  // for a facilitator who wants the raw numbers rather than a CSV/PDF.
  // Same Blob -> object URL -> anchor.click() download mechanism as
  // exportCSV/HistoryView's own copy, not a new one.
  exportJSON(data, title) {
    downloadFile(JSON.stringify(data, null, 2), "application/json;charset=utf-8", `${slugify(title)}.json`);
  }

  // The caller (TournamentReportsView) is responsible for having the
  // print-optimized DOM already rendered before calling this — exportPDF
  // itself just triggers the browser's print dialog. Kept as a real method
  // on the service (rather than inlining window.print() in the component)
  // so the "Architecture: exportPDF()" method the spec asks for actually
  // exists as a callable, testable unit.
  exportPDF() {
    window.print();
  }
}
