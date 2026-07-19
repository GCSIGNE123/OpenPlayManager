// Styles for Tournament Display Mode ("TV Mode") — see PROJECT.md's
// Tournament Display Mode section. Deliberately its own stylesheet, not a
// reuse/extension of styles.js: the organizer UI is designed for a phone or
// laptop held close-up (compact, dense, small type), while a TV/projector
// is viewed from across a room — everything here uses much larger type and
// higher contrast, and layouts are fluid (CSS grid with minmax, relative
// units) rather than tuned to one fixed viewport, so the same page reads
// well at 1920x1080, on a landscape tablet, and in a browser's native
// full-screen. A fixed dark background is used unconditionally (not
// light/dark-mode aware like the rest of the app) since a bright white
// screen is genuinely hard to look at across a dark venue — this is a
// deliberate, permanent choice for this one screen, not an oversight.
const INK = "#0b1220";
const PANEL = "#131c2e";
const LINE = "#26314a";
const CHALK = "#f4f6fb";
const FAINT = "#8a94ab";
const COURT = "#2f6fed";
const SUCCESS = "#2fbf71";
const GOLD = "#e6b200";

export const displayStyles = {
  // position: fixed + inset: 0 deliberately breaks this screen out of
  // index.css's #root { max-width: 900px } — that cap is tuned for the
  // organizer's phone/laptop UI (every other screen in the app), and isn't
  // touched globally since it needs to stay in place for those. A
  // fixed-position element is sized against the viewport, not against its
  // constrained ancestor, which is exactly what a TV/projector display
  // needs: the full 1920x1080 (or whatever the screen actually is), not a
  // 900px column centered in a sea of background.
  screen: {
    position: "fixed",
    inset: 0,
    overflowY: "auto",
    background: INK,
    color: CHALK,
    fontFamily: "'Inter', sans-serif",
    padding: "clamp(16px, 2vw, 40px)",
    boxSizing: "border-box",
  },
  centeredMessage: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    fontSize: "clamp(20px, 2.2vw, 32px)",
    color: FAINT,
    textAlign: "center",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: "clamp(16px, 2vw, 28px)",
  },
  kicker: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(11px, 1vw, 14px)",
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: COURT,
    marginBottom: 4,
  },
  title: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(28px, 3.6vw, 56px)",
    margin: 0,
    lineHeight: 1.05,
  },
  topBarActions: {
    display: "flex",
    gap: 10,
  },
  exitBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 8,
    border: `1.5px solid ${LINE}`,
    background: PANEL,
    color: CHALK,
    fontSize: "clamp(13px, 1vw, 16px)",
    fontWeight: 700,
    cursor: "pointer",
  },
  overviewRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "clamp(10px, 1.2vw, 20px)",
    marginBottom: "clamp(16px, 2vw, 28px)",
  },
  overviewStat: {
    background: PANEL,
    border: `1.5px solid ${LINE}`,
    borderRadius: 12,
    padding: "clamp(14px, 1.4vw, 24px)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  overviewLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(11px, 0.9vw, 14px)",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: FAINT,
  },
  overviewValue: {
    fontSize: "clamp(22px, 2.4vw, 38px)",
    fontWeight: 800,
  },
  panel: {
    background: PANEL,
    border: `1.5px solid ${LINE}`,
    borderRadius: 14,
    padding: "clamp(14px, 1.6vw, 26px)",
    marginBottom: "clamp(16px, 2vw, 28px)",
  },
  panelTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(18px, 1.8vw, 28px)",
    margin: "0 0 14px 0",
  },
  courtsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "clamp(10px, 1.2vw, 18px)",
  },
  courtCard: (derivedStatus) => ({
    background: INK,
    border: `2px solid ${derivedStatus === "occupied" ? COURT : LINE}`,
    borderRadius: 10,
    padding: "clamp(12px, 1.2vw, 18px)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }),
  courtCardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  courtName: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(14px, 1.3vw, 20px)",
  },
  courtStatusBadge: (derivedStatus) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(9px, 0.8vw, 12px)",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "3px 8px",
    borderRadius: 5,
    color: derivedStatus === "occupied" ? INK : CHALK,
    background: derivedStatus === "occupied" ? COURT : derivedStatus === "maintenance" ? GOLD : LINE,
  }),
  courtMatchup: {
    fontSize: "clamp(15px, 1.4vw, 22px)",
    fontWeight: 700,
  },
  courtMatchStatus: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(10px, 0.9vw, 13px)",
    color: FAINT,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  courtEmpty: {
    fontSize: "clamp(12px, 1vw, 15px)",
    fontStyle: "italic",
    color: FAINT,
  },
  queueGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "clamp(8px, 1vw, 14px)",
  },
  queueCard: {
    background: INK,
    border: `1.5px solid ${LINE}`,
    borderRadius: 8,
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  queueCourtTag: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(9px, 0.8vw, 12px)",
    color: FAINT,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  queueMatchup: {
    fontSize: "clamp(14px, 1.2vw, 19px)",
    fontWeight: 700,
  },
  queueSource: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(10px, 0.85vw, 13px)",
    color: FAINT,
  },
  emptyNote: {
    color: FAINT,
    fontStyle: "italic",
    fontSize: "clamp(13px, 1vw, 16px)",
  },
  poolsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "clamp(12px, 1.4vw, 22px)",
  },
  standingsCard: {
    background: INK,
    border: `1.5px solid ${LINE}`,
    borderRadius: 10,
    padding: "clamp(10px, 1.2vw, 16px)",
  },
  standingsPoolLabel: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(14px, 1.2vw, 19px)",
    margin: "0 0 8px 0",
  },
  standingsTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "clamp(13px, 1.1vw, 18px)",
  },
  standingsHeadCell: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(10px, 0.85vw, 13px)",
    color: FAINT,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `2px solid ${LINE}`,
    padding: "6px 4px",
    textAlign: "center",
  },
  standingsCell: {
    padding: "6px 4px",
    textAlign: "center",
    borderBottom: `1px solid ${LINE}`,
  },
  bracketScroll: {
    display: "flex",
    gap: "clamp(10px, 1.4vw, 22px)",
    overflowX: "auto",
    paddingBottom: 6,
  },
  bracketColumn: {
    flex: "0 0 clamp(200px, 18vw, 280px)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  bracketRoundName: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(13px, 1.1vw, 18px)",
    margin: 0,
  },
  bracketMatchCard: (completed) => ({
    background: INK,
    border: `1.5px solid ${completed ? SUCCESS : LINE}`,
    borderRadius: 8,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  }),
  bracketTeamLine: {
    fontSize: "clamp(13px, 1.1vw, 17px)",
    fontWeight: 700,
  },
  bracketSeed: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(10px, 0.85vw, 13px)",
    color: FAINT,
    marginRight: 6,
  },
  bracketTbd: {
    fontStyle: "italic",
    color: FAINT,
    fontWeight: 400,
  },
  championBanner: {
    marginTop: 16,
    padding: "clamp(12px, 1.4vw, 20px)",
    borderRadius: 10,
    background: "rgba(230,178,0,0.12)",
    border: `2px solid ${GOLD}`,
    fontSize: "clamp(18px, 2vw, 30px)",
    fontWeight: 800,
    textAlign: "center",
  },
  championVs: {
    fontSize: "clamp(12px, 1vw, 16px)",
    fontWeight: 400,
    color: FAINT,
    margin: "0 8px",
  },
};
