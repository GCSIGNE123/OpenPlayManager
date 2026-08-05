// Session Report Export (Sprint 4C) — see PROJECT.md/FEATURES.md. Pure
// derivation, same "logic lives outside the component" precedent as
// sessionAnalytics.js itself: flattens the report computeSessionAnalyticsReport
// already returns into the generic { title, columns, rows } shape
// ExportService.exportCSV already knows how to turn into a CSV download —
// no new CSV-writing code, no new export mechanism invented.
export function buildSessionReportExportTable(report) {
  const { sessionSummary, participation, waiting, diversity, adaptive, playersNeedingAttention, payment, paymentDetails, finalStandings, grade } = report;
  const rows = [
    ["Session", sessionSummary.venue || ""],
    ["Rotation Mode", sessionSummary.rotationModeLabel],
    ["Duration", sessionSummary.durationLabel],
    ["Courts", sessionSummary.courtsCount],
    ["Players", sessionSummary.playersCount],
    ["Average Games Played", participation.averageGames],
    ["Highest Games Played", participation.highestGames],
    ["Lowest Games Played", participation.lowestGames],
    ["Standard Deviation", participation.stdDevGames],
    ["Games Fairness Score", `${participation.gamesFairnessScore} / 100`],
    ["Average Waiting Time (min)", waiting.averageWaitMinutes],
    ["Longest Waiting Time (min)", waiting.longestWaitMinutes],
    ["Avg Time Between Games (min)", waiting.averageTimeBetweenGamesMinutes],
    ["Avg Unique Partners", diversity.averageUniquePartners],
    ["Avg Unique Opponents", diversity.averageUniqueOpponents],
  ];
  if (adaptive) {
    rows.push(
      ["Promotions", adaptive.promotions],
      ["Relegations", adaptive.relegations],
      ["Manual Skill Changes", adaptive.manualChanges],
      ["Automatic Skill Changes", adaptive.automaticChanges]
    );
  }
  if (payment) {
    rows.push(
      ["Payment — Total Players", payment.totalPlayers],
      ["Payment — Paid", payment.paid],
      ["Payment — Unpaid", payment.unpaid],
      ["Payment — Cash", payment.cash],
      ["Payment — GCash", payment.gcash]
    );
  }
  rows.push(["Session Grade", `${grade.score} / 100 (${grade.label})`]);
  playersNeedingAttention.forEach((p) => {
    rows.push([`Player Needing Attention: ${p.playerName}`, p.reasons.join("; ")]);
  });
  if (paymentDetails) {
    paymentDetails.forEach((p) => {
      const methodLabel = p.paymentStatus === "paid" ? (p.paymentMethod === "gcash" ? "Paid (GCash)" : "Paid (Cash)") : "Unpaid";
      rows.push([`Payment: ${p.playerName}`, methodLabel]);
    });
  }
  if (finalStandings) {
    finalStandings.forEach((p, i) => {
      rows.push([`Standing #${i + 1}: ${p.playerName}`, `GP ${p.gp}, W ${p.wins}, L ${p.losses}, +/- ${p.diff}, RTG ${p.rating ?? "—"}`]);
    });
  }

  return {
    title: sessionSummary.venue ? `${sessionSummary.venue} — Session Analytics Report` : "Session Analytics Report",
    columns: ["Metric", "Value"],
    rows: rows.map(([metric, value]) => [metric, value]),
  };
}
