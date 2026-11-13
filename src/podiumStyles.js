// Running Podium styles — one factory, two palettes: the app's light
// surfaces (Live Board, Standings tab, Session Analytics report) and TV
// Mode's dark broadcast screen. Kept beside the component rather than in
// styles.js / tvOpenPlayStyles.js because the same panel renders on both,
// and the two palettes must stay in step with each other.
const RANK_COLOR = {
  1: { accent: "#F5C842", tint: "rgba(245,200,66,0.14)", border: "rgba(184,134,11,0.45)" },
  2: { accent: "#C9D2DB", tint: "rgba(201,210,219,0.16)", border: "rgba(138,150,163,0.45)" },
  3: { accent: "#D08A4B", tint: "rgba(208,138,75,0.14)", border: "rgba(138,74,28,0.45)" },
};

export function podiumStyles(dark = false) {
  const text = dark ? "#F9FAFB" : "var(--color-text)";
  const muted = dark ? "#9CA3AF" : "var(--color-text-muted)";
  const faint = dark ? "#6B7280" : "var(--color-text-faint)";
  const surface = dark ? "#1F2937" : "var(--color-surface)";
  const border = dark ? "#374151" : "var(--color-border)";
  const scale = dark ? 1.25 : 1;

  return {
    wrap: {
      display: "flex",
      flexDirection: "column",
      gap: 8 * scale,
      marginBottom: 14 * scale,
    },
    headRow: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
    },
    title: {
      fontFamily: "'Anton', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      fontSize: 15 * scale,
      color: dark ? "#9CA3AF" : "var(--color-primary)",
      margin: 0,
    },
    status: {
      fontSize: 12.5 * scale,
      color: muted,
      margin: 0,
    },
    // Division podiums (PodiumBoard): Beginner | Intermediate side by side
    // when there is room, stacked on narrow screens / TV Mode's 30% column.
    boardGrid: {
      display: "grid",
      gridTemplateColumns: `repeat(auto-fit, minmax(${dark ? 380 : 300}px, 1fr))`,
      gap: 14 * scale,
      alignItems: "start",
    },
    divisionTitle: {
      fontFamily: "'Anton', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      fontSize: 13 * scale,
      color: text,
      margin: 0,
      padding: `${2 * scale}px ${10 * scale}px`,
      borderLeft: `3px solid ${dark ? "#F7941D" : "var(--color-secondary)"}`,
      background: dark ? "rgba(255,255,255,0.04)" : "var(--color-bg)",
      borderRadius: "0 8px 8px 0",
    },
    // locked / empty state — a slim banner with three faded medals
    lockedBanner: {
      display: "flex",
      alignItems: "center",
      gap: 12 * scale,
      padding: `${10 * scale}px ${14 * scale}px`,
      borderRadius: 12,
      border: `1px dashed ${border}`,
      background: dark ? "rgba(255,255,255,0.03)" : "var(--color-bg)",
      color: muted,
      fontSize: 13.5 * scale,
    },
    lockedMedals: {
      display: "flex",
      alignItems: "flex-end",
      gap: 2,
      opacity: 0.45,
      filter: "grayscale(0.35)",
      flexShrink: 0,
    },
    lockedCountdown: {
      fontFamily: "'Space Mono', monospace",
      fontWeight: 700,
      fontSize: 13.5 * scale,
      color: text,
      whiteSpace: "nowrap",
    },
    // the three cards: runner-up | champion | third
    cards: {
      display: "grid",
      gridTemplateColumns: "1fr 1.15fr 1fr",
      gap: 10 * scale,
      alignItems: "end",
    },
    card: (rank) => ({
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4 * scale,
      padding: `${44 * scale}px ${8 * scale}px ${10 * scale}px`,
      borderRadius: 14,
      border: `1px solid ${RANK_COLOR[rank].border}`,
      background: `linear-gradient(180deg, ${RANK_COLOR[rank].tint} 0%, ${surface} 70%)`,
      boxShadow: dark ? "0 6px 18px rgba(0,0,0,0.35)" : "0 4px 14px rgba(22,53,94,0.08)",
      minWidth: 0,
      // champion stands taller
      marginTop: rank === 1 ? 0 : 14 * scale,
    }),
    medalSlot: {
      position: "absolute",
      top: -22 * scale,
      left: "50%",
      transform: "translateX(-50%)",
    },
    avatarRing: (rank) => ({
      borderRadius: "50%",
      padding: 3,
      background: RANK_COLOR[rank].accent,
      display: "flex",
      marginTop: 22 * scale,
    }),
    nameRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      maxWidth: "100%",
      minWidth: 0,
    },
    name: {
      fontSize: 15 * scale,
      fontWeight: 800,
      color: text,
      textAlign: "center",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      lineHeight: 1.2,
    },
    record: {
      fontFamily: "'Space Mono', monospace",
      fontWeight: 700,
      fontSize: 15 * scale,
      color: text,
      lineHeight: 1.1,
    },
    detail: {
      fontSize: 12 * scale,
      color: muted,
      whiteSpace: "nowrap",
    },
    placeLabel: (rank) => ({
      marginTop: 4 * scale,
      fontFamily: "'Space Mono', monospace",
      fontWeight: 700,
      fontSize: 10.5 * scale,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: dark ? RANK_COLOR[rank].accent : "var(--color-text-muted)",
      padding: `${2 * scale}px ${8 * scale}px`,
      borderRadius: 999,
      border: `1px solid ${RANK_COLOR[rank].border}`,
      background: RANK_COLOR[rank].tint,
      whiteSpace: "nowrap",
    }),
    outTag: {
      flexShrink: 0,
      fontSize: 10 * scale,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: dark ? "#FCA5A5" : "var(--color-error)",
      border: `1px solid ${dark ? "rgba(252,165,165,0.5)" : "rgba(214,69,69,0.4)"}`,
      background: dark ? "rgba(252,165,165,0.12)" : "rgba(214,69,69,0.08)",
      borderRadius: 999,
      padding: "1px 6px",
    },
    emptySlot: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 90 * scale,
      borderRadius: 14,
      border: `1px dashed ${border}`,
      color: faint,
      fontSize: 12.5 * scale,
      marginTop: 14 * scale,
    },
    congrats: {
      textAlign: "center",
      fontFamily: "'Anton', sans-serif",
      fontWeight: 400,
      letterSpacing: "0.04em",
      fontSize: 18 * scale,
      color: dark ? "#F5C842" : "var(--color-secondary-text)",
      margin: `0 0 ${4 * scale}px`,
    },
  };
}
