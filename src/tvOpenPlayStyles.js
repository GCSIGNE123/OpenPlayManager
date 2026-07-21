// Styles for Open Play TV Mode — see PROJECT.md's Open Play TV Mode
// section. A sibling of displayStyles.js (Tournament Display Mode), not a
// reuse of it: that file's palette/sizing was tuned for its own spec long
// before this one existed, and this feature's own spec calls for a
// distinct "professional sports broadcast" palette and a fixed 70/30
// Live Courts / Standings split that displayStyles.js's single-column
// layout doesn't have. The structural pattern IS reused —
// position:fixed;inset:0 to escape index.css's #root{max-width:900px} cap,
// fluid clamp() typography, a permanent dark background regardless of the
// organizer app's own light/dark mode — see displayStyles.js's own header
// comment for why that pattern exists.
const BG = "#111827";
const CARD = "#1F2937";
const CARD_BORDER = "#374151";
const TEXT = "#F9FAFB";
const TEXT_FAINT = "#9CA3AF";
const ACCENT = "#2563EB";
const LIVE = "#22C55E";
const WAITING = "#F59E0B";
const FINISHED = "#6B7280";
const GOLD = "#FBBF24";
const SILVER = "#CBD5E1";
const BRONZE = "#D97706";

const STATUS_COLOR = { live: LIVE, waiting: WAITING, finished: FINISHED };

// Global keyframes + the score-pulse/winner-banner animation classes —
// injected once by OpenPlayTVModePage via <style>{tvKeyframes}</style>,
// the same "raw <style> tag rendered once" pattern PickleballOpenPlay.jsx
// already uses for styles.js's fontImport. Kept self-contained here rather
// than added to styles.js/displayStyles.js's own keyframe blocks, since
// this page is the only consumer.
export const tvKeyframes = `
@keyframes tvScorePulse {
  0% { transform: scale(1); }
  30% { transform: scale(1.18); color: ${ACCENT}; }
  100% { transform: scale(1); }
}
@keyframes tvScoreHighlight {
  0% { background: rgba(37, 99, 235, 0.35); }
  100% { background: transparent; }
}
@keyframes tvWinnerPop {
  0% { transform: scale(0.85); opacity: 0; }
  60% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes tvRankPop {
  0% { transform: scale(0.96); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}
.tv-score-pulse { animation: tvScorePulse 500ms ease; }
.tv-score-highlight { animation: tvScoreHighlight 900ms ease; border-radius: 8px; }
.tv-winner-pop { animation: tvWinnerPop 350ms ease; }
.tv-rank-pop { animation: tvRankPop 500ms ease; }
`;

// Adaptive Live Courts grid — see PROJECT.md. Column/row counts follow the
// organizer's own breakpoint table exactly (1-2 courts -> a single row of
// large cards, 3-4 -> 2x2, 5-6 -> 3x2, 7-8 -> 4x2), with a documented
// fallback for 9+ courts (keeps growing at 4 columns wide) so the layout
// never breaks even though no facility in this app's current scope runs
// that many courts. `count` is the number of courts actually in
// tournament.courts/state.courts — an empty session (0 courts) still gets
// a sane 1x1 shape rather than a division-by-zero grid.
export function courtGridDimensions(count) {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count <= 2) return { columns: 2, rows: 1 };
  if (count <= 4) return { columns: 2, rows: 2 };
  if (count <= 6) return { columns: 3, rows: 2 };
  if (count <= 8) return { columns: 4, rows: 2 };
  return { columns: 4, rows: Math.ceil(count / 4) };
}

// Card/score/team typography scales INVERSELY with column count — fewer
// courts means each card gets much more of the 70% panel's real estate, so
// it should read as genuinely oversized rather than leaving dead space at
// the same font size a crowded 8-court grid would use. Four tiers, keyed
// off columns rather than raw count (2 courts and 4 courts both want
// "spacious" sizing relative to how many columns they actually occupy).
// `photo` is the pixel diameter passed straight to Avatar's own `size`
// prop (see Player Photos & Broadcast Experience in PROJECT.md) — no
// existing Avatar usage anywhere in the app goes above 26px, so these are
// a genuinely new "TV-large" tier, not an extension of an existing one.
export function courtSizeTier(columns) {
  if (columns <= 1) return { court: "clamp(22px, 2.6vw, 34px)", score: "clamp(72px, 9vw, 140px)", team: "clamp(26px, 3vw, 44px)", badge: "clamp(14px, 1.4vw, 20px)", photo: 110 };
  if (columns === 2) return { court: "clamp(18px, 2.1vw, 27px)", score: "clamp(54px, 6.8vw, 100px)", team: "clamp(21px, 2.3vw, 32px)", badge: "clamp(12px, 1.2vw, 17px)", photo: 84 };
  if (columns === 3) return { court: "clamp(15px, 1.7vw, 22px)", score: "clamp(38px, 5vw, 70px)", team: "clamp(17px, 1.8vw, 24px)", badge: "clamp(11px, 1vw, 14px)", photo: 62 };
  return { court: "clamp(13px, 1.4vw, 18px)", score: "clamp(28px, 3.6vw, 50px)", team: "clamp(14px, 1.4vw, 19px)", badge: "clamp(10px, 0.85vw, 12px)", photo: 46 };
}

export const tvStyles = {
  screen: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    background: BG,
    color: TEXT,
    fontFamily: "'Inter', sans-serif",
    display: "flex",
    flexDirection: "column",
    padding: "clamp(14px, 1.6vw, 28px)",
    boxSizing: "border-box",
  },
  centeredMessage: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    fontSize: "clamp(20px, 2.2vw, 32px)",
    color: TEXT_FAINT,
    textAlign: "center",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: "clamp(10px, 1.2vw, 20px)",
    marginBottom: "clamp(10px, 1.2vw, 20px)",
    borderBottom: `2px solid ${CARD_BORDER}`,
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(22px, 2.8vw, 40px)",
    margin: 0,
    lineHeight: 1.1,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "clamp(16px, 2.2vw, 40px)",
  },
  headerStat: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
  },
  headerStatLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(10px, 0.8vw, 13px)",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: TEXT_FAINT,
  },
  headerStatValue: {
    fontSize: "clamp(16px, 1.6vw, 26px)",
    fontWeight: 800,
  },
  exitBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 8,
    border: `1.5px solid ${CARD_BORDER}`,
    background: CARD,
    color: TEXT,
    fontSize: "clamp(12px, 0.95vw, 15px)",
    fontWeight: 700,
    cursor: "pointer",
  },
  // The fixed 70/30 split — maintained regardless of court count (the
  // adaptive grid changes what's INSIDE the 70% panel, never the split
  // itself, per the spec's own "maintain the 70/30 split" requirement).
  body: {
    display: "grid",
    gridTemplateColumns: "70% 30%",
    gap: "clamp(12px, 1.4vw, 24px)",
    flex: 1,
    minHeight: 0,
  },
  courtsPanel: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  courtsGrid: (columns, rows) => ({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: "clamp(10px, 1.2vw, 20px)",
    flex: 1,
    minHeight: 0,
  }),
  courtCard: (status, columns) => ({
    position: "relative",
    background: CARD,
    border: `3px solid ${STATUS_COLOR[status] ?? CARD_BORDER}`,
    borderRadius: 16,
    padding: columns <= 1 ? "clamp(20px, 2.4vw, 36px)" : "clamp(12px, 1.4vw, 22px)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 0,
    overflow: "hidden",
    transition: "border-color 500ms ease, background 500ms ease",
  }),
  courtHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  courtName: (columns) => ({
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: courtSizeTier(columns).court,
    letterSpacing: "0.02em",
  }),
  statusBadge: (status, columns) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: courtSizeTier(columns).badge,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "4px 12px",
    borderRadius: 999,
    color: BG,
    background: STATUS_COLOR[status] ?? CARD_BORDER,
    transition: "background 500ms ease",
  }),
  // Photo-first layout — see Player Photos & Broadcast Experience in
  // PROJECT.md. "Player identity first, score second": each team renders
  // as a row of large circular photos (playerPhotoRow/playerCard), with
  // the score reduced to a single centered line BETWEEN the two team
  // rows, rather than the old side-by-side name+score-on-the-right layout.
  matchupBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "clamp(6px, 0.8vw, 14px)",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  playerPhotoRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: "clamp(8px, 1.2vw, 22px)",
    flexWrap: "wrap",
  },
  playerCard: (leading) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    opacity: leading === false ? 0.55 : 1,
    transition: "opacity 400ms ease",
  }),
  playerPhotoRing: (leading) => ({
    borderRadius: "50%",
    padding: 3,
    background: leading ? ACCENT : "transparent",
    transition: "background 400ms ease",
  }),
  // fontSize/maxWidth passed explicitly rather than derived from `columns`
  // — TeamPhotoRow (OpenPlayTVModePage.jsx) is reused across several
  // panels (court cards, Next Match, winner celebration) that each want a
  // different name size independent of the court grid's column count.
  playerName: (fontSize, photoSize, leading) => ({
    fontSize,
    fontWeight: leading ? 800 : 600,
    color: leading ? TEXT : TEXT_FAINT,
    textAlign: "center",
    maxWidth: photoSize * 1.7,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  scoreRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(8px, 1vw, 18px)",
  },
  scoreValue: (columns) => ({
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: courtSizeTier(columns).score,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  }),
  vsLabel: (columns) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: courtSizeTier(columns).badge,
    color: TEXT_FAINT,
    letterSpacing: "0.15em",
  }),
  emptyCourtText: (columns) => ({
    fontSize: courtSizeTier(columns).team,
    color: TEXT_FAINT,
    fontStyle: "italic",
    textAlign: "center",
  }),
  winnerOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(17, 24, 39, 0.96)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(10px, 1.4vw, 22px)",
    borderRadius: 13,
    zIndex: 2,
  },
  winnerText: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(22px, 3vw, 44px)",
    color: GOLD,
    letterSpacing: "0.08em",
  },
  winnerPhotoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(10px, 1.4vw, 24px)",
  },
  winnerPhotoRing: {
    borderRadius: "50%",
    padding: 4,
    background: `linear-gradient(135deg, ${GOLD}, ${ACCENT})`,
  },
  // Right panel — Standings on top, Next Match + Queue stacked below,
  // scrollable as a unit if content overflows a shorter TV viewport.
  sidePanel: {
    display: "flex",
    flexDirection: "column",
    gap: "clamp(10px, 1.2vw, 18px)",
    minHeight: 0,
    overflowY: "auto",
  },
  panelCard: {
    background: CARD,
    border: `1.5px solid ${CARD_BORDER}`,
    borderRadius: 14,
    padding: "clamp(12px, 1.3vw, 20px)",
  },
  panelTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(15px, 1.3vw, 21px)",
    margin: "0 0 10px 0",
    color: TEXT_FAINT,
    letterSpacing: "0.04em",
  },
  // A "professional leaderboard rather than a spreadsheet" — see Player
  // Photos & Broadcast Experience in PROJECT.md. Photo column added
  // between rank and name; medal-colored ring reuses the same rank<=3
  // gold/silver/bronze the row's own left border already established.
  standingsRow: (rank) => ({
    display: "grid",
    gridTemplateColumns: "auto auto 1fr auto auto auto",
    alignItems: "center",
    gap: 10,
    padding: "8px 6px",
    borderRadius: 8,
    borderLeft: `4px solid ${rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : "transparent"}`,
    background: rank <= 3 ? "rgba(255,255,255,0.04)" : "transparent",
    transition: "transform 400ms ease, background 400ms ease",
  }),
  standingsRank: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 800,
    fontSize: "clamp(13px, 1vw, 16px)",
    width: "1.6em",
  },
  standingsPhotoRing: (rank) => ({
    borderRadius: "50%",
    padding: 2,
    background: rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : "transparent",
    display: "flex",
  }),
  standingsName: {
    fontSize: "clamp(13px, 1.05vw, 17px)",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  standingsStat: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(11px, 0.9vw, 14px)",
    color: TEXT_FAINT,
    textAlign: "right",
    minWidth: "2.2em",
  },
  standingsHeadRow: {
    display: "grid",
    gridTemplateColumns: "auto auto 1fr auto auto auto",
    gap: 10,
    padding: "0 6px 6px 6px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(9px, 0.75vw, 11px)",
    color: TEXT_FAINT,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${CARD_BORDER}`,
    marginBottom: 4,
  },
  emptyNote: {
    color: TEXT_FAINT,
    fontStyle: "italic",
    fontSize: "clamp(12px, 1vw, 15px)",
  },
  nextMatchCourt: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(11px, 0.9vw, 14px)",
    color: ACCENT,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  nextMatchVs: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(10px, 0.85vw, 13px)",
    color: TEXT_FAINT,
    textAlign: "center",
    margin: "2px 0",
  },
  queueRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 4px",
    fontSize: "clamp(12px, 1vw, 15px)",
  },
  queuePosition: {
    fontFamily: "'Space Mono', monospace",
    color: TEXT_FAINT,
    fontWeight: 700,
    width: "1.6em",
  },
  // Future Compatibility — see PROJECT.md. One clearly-labeled, empty
  // extension slot (sponsor ads / club announcements / QR code / weather /
  // countdown / club branding all listed in the spec's Future
  // Compatibility section) so a later feature has an obvious place to plug
  // into without restructuring this page. Renders nothing on its own.
  widgetSlot: {
    minHeight: 0,
  },
};
