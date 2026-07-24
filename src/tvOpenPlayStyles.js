// Styles for Open Play TV Mode 2.0 (Broadcast Display) — see PROJECT.md's
// TV Mode 2.0 and TV Mode Layout Optimization (Sprint 3.1) sections. A
// sibling of displayStyles.js (Tournament Display Mode), not a reuse of
// it — this feature's own spec calls for a distinct "professional sports
// broadcast" palette and a fixed 45% / 35% / 20% three-column layout
// (Live Courts / Up Next / Standings) that displayStyles.js's
// single-column layout doesn't have. The structural pattern IS reused —
// position:fixed;inset:0 to escape index.css's #root{max-width:900px}
// cap, fluid clamp() typography, a permanent dark background regardless
// of the organizer app's own light/dark mode — see displayStyles.js's own
// header comment for why that pattern exists.
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
@keyframes tvNextGlow {
  0% { box-shadow: 0 0 0px rgba(37, 99, 235, 0.5); }
  50% { box-shadow: 0 0 22px rgba(37, 99, 235, 0.55); }
  100% { box-shadow: 0 0 0px rgba(37, 99, 235, 0.5); }
}
.tv-score-pulse { animation: tvScorePulse 500ms ease; }
.tv-score-highlight { animation: tvScoreHighlight 900ms ease; border-radius: 8px; }
.tv-winner-pop { animation: tvWinnerPop 350ms ease; }
.tv-rank-pop { animation: tvRankPop 500ms ease; }
.tv-next-glow { animation: tvNextGlow 2.6s ease-in-out infinite; }
`;

// Adaptive Live Courts grid — see PROJECT.md. Column/row counts follow
// the organizer's own breakpoint table exactly (1-2 -> a single row of
// large cards, 3-4 -> 2x2, 5-6 -> 3x2, 7-8 -> 4x2), with a documented
// fallback for 9+ so the layout never breaks. `count` is the number of
// courts CURRENTLY LIVE (not every court in the session) — this column
// only ever renders active matches, per TV Mode 2.0's spec.
export function courtGridDimensions(count) {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count <= 2) return { columns: 2, rows: 1 };
  if (count <= 4) return { columns: 2, rows: 2 };
  if (count <= 6) return { columns: 3, rows: 2 };
  if (count <= 8) return { columns: 4, rows: 2 };
  return { columns: 4, rows: Math.ceil(count / 4) };
}

// Adaptive Layout presets — see PROJECT.md's TV Mode Layout Optimization
// section. "standard" (45/20/35, rebalanced from 45/35/20 — TV Mode
// Layout Rebalancing sprint, giving Standings more room and Up Next less)
// is the default and only preset actually USED this sprint — a small/
// 2-court venue has more players waiting than playing, so a future
// "compact" preset flips more space to Up Next. Neither
// OpenPlayTVModePage.jsx nor anything else calls selectLayoutPreset yet
// (explicit direction: prepare the seam, don't wire dynamic switching
// on). Keyed off ACTIVE court count (how many courts currently have a
// live match), not total courts or venue size/court capacity — a
// 6-court venue running only 2 live matches right now is the same "more
// waiting than playing" situation a genuine 2-court venue is in.
export const TV_LAYOUT_PRESETS = {
  standard: { liveCourts: 45, upNext: 20, standings: 35 }, // 3+ active courts — more simultaneous matches happening
  compact: { liveCourts: 35, upNext: 45, standings: 20 }, // <=2 active courts — more players waiting than playing
};

// Not called anywhere yet — see TV_LAYOUT_PRESETS above. When dynamic
// layout switching is enabled later, this is the one function that needs
// to actually get called (from OpenPlayTVModePage.jsx, in place of the
// hardcoded TV_LAYOUT_PRESETS.standard it uses today); the selection
// logic itself is already correct and ready.
export function selectLayoutPreset(activeCourtCount) {
  return activeCourtCount <= 2 ? TV_LAYOUT_PRESETS.compact : TV_LAYOUT_PRESETS.standard;
}

// Card/score/team typography for the Live Courts column — originally
// calibrated for TV Mode 2.0's 40%-wide column (the vw-based clamp()
// coefficients scaled down from the old 70%-wide layout's by roughly
// 40/70 so a "full width" element read the same physical size on screen).
// Sprint 3.1 widened the column to 45% without touching these numbers —
// slightly MORE breathing room than they were tuned for, never less, so
// nothing here needed re-tuning.
// `score` is deliberately pushed much larger relative to `team` than the
// old tiers used — "live scores significantly larger than player names,"
// per explicit direction — roughly a 3.5-4x ratio at every tier, not ~2.7x.
export function courtSizeTier(columns) {
  if (columns <= 1) return { court: "clamp(18px, 1.7vw, 28px)", score: "clamp(84px, 8.2vw, 150px)", team: "clamp(18px, 1.6vw, 26px)", badge: "clamp(12px, 0.9vw, 16px)", photo: 92 };
  if (columns === 2) return { court: "clamp(15px, 1.3vw, 21px)", score: "clamp(58px, 5.6vw, 100px)", team: "clamp(15px, 1.2vw, 20px)", badge: "clamp(11px, 0.75vw, 14px)", photo: 68 };
  if (columns === 3) return { court: "clamp(13px, 1.1vw, 17px)", score: "clamp(42px, 4vw, 68px)", team: "clamp(13px, 1vw, 16px)", badge: "clamp(10px, 0.65vw, 12px)", photo: 50 };
  return { court: "clamp(11px, 0.9vw, 14px)", score: "clamp(30px, 2.8vw, 46px)", team: "clamp(11px, 0.85vw, 13px)", badge: "clamp(9px, 0.55vw, 10.5px)", photo: 38 };
}

// Up Next card sizing — TV Mode Layout Optimization (Sprint 3.1): cards
// compressed to a single horizontal row per team (see TeamInline in
// OpenPlayTVModePage.jsx) instead of the old stacked photo-over-name
// block, specifically so 4-5 cards fit in the column on a 1080p display
// without scrolling — real-world field-testing feedback that the old
// cards were "too tall with unnecessary empty space." Still scales with
// how many of the (max 4) upcoming matches are queued, and the
// first/highlighted card still renders one notch larger.
// TV Mode Layout Rebalancing: the column shrank from 35% to 20% width
// (a ~0.57x ratio), so the vw-based mid/max sizing here is scaled down by
// the same ratio to keep font/photo size proportionate to the narrower
// column instead of relying on `teamInlineNames`'s ellipsis truncation to
// paper over an oversized layout. The px floors are left alone — they're
// a legibility minimum, not a width-proportional value.
// Up Next Card Optimization: photo sizes trimmed ~12% (avatars are
// decorative next to the name, per this sprint's "prioritize player names"
// direction) and the team name floor/ceiling both dropped ~1px so a
// couple more characters fit before `teamInlineNames`'s ellipsis kicks in
// — still well above a legible minimum for cross-venue viewing, just no
// longer sized as if the column were still 35% wide.
export function upNextSizeTier(count, isNext) {
  const bump = isNext ? 1 : 0;
  const tiers = [
    { team: "clamp(12px, 0.56vw, 14px)", photo: 26 },
    { team: "clamp(11px, 0.5vw, 13px)", photo: 23 },
    { team: "clamp(10px, 0.44vw, 11px)", photo: 19 },
  ];
  const base = count <= 1 ? 0 : count <= 2 ? 1 : 2;
  return tiers[Math.max(0, base - bump)];
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
    padding: "clamp(12px, 1.4vw, 24px)",
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
  // Header — Session Name is the large PRIMARY element; Venue Name +
  // (future) logo are secondary, smaller, above it — see PROJECT.md.
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: "clamp(8px, 1vw, 16px)",
    marginBottom: "clamp(8px, 1vw, 16px)",
    borderBottom: `2px solid ${CARD_BORDER}`,
    flexShrink: 0,
  },
  headerVenueRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  // Reserved venue-branding slot — see Future Compatibility in PROJECT.md.
  // Renders the real venue logo once a session is linked to a Venue
  // record with one set; otherwise a subtle placeholder ring, never an
  // empty gap, so the header layout doesn't shift once branding lands.
  headerVenueLogo: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
    border: `1px solid ${CARD_BORDER}`,
  },
  headerVenueLogoPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    flexShrink: 0,
    border: `1px dashed ${CARD_BORDER}`,
  },
  headerVenueName: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(11px, 0.85vw, 14px)",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: TEXT_FAINT,
  },
  headerTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(24px, 3vw, 42px)",
    margin: 0,
    lineHeight: 1.05,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "clamp(14px, 1.8vw, 32px)",
  },
  headerStat: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
  },
  headerStatLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(9px, 0.72vw, 12px)",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: TEXT_FAINT,
  },
  headerStatValue: {
    fontSize: "clamp(15px, 1.5vw, 24px)",
    fontWeight: 800,
  },
  // Compact Session Progress readout — see PROJECT.md. Derived purely
  // from existing fields (average completed games among active players
  // ÷ expectedGamesPerPlayer, the same organizer-configured target
  // Progressive Skill Rotation's own phase calc already reads) — no new
  // session field added for this. A thin bar under the numeric %, kept
  // small since it's a secondary header stat, not a focal point.
  progressStat: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    minWidth: 70,
  },
  progressBarTrack: {
    width: 70,
    height: 5,
    borderRadius: 999,
    background: CARD_BORDER,
    overflow: "hidden",
  },
  progressBarFill: (pct) => ({
    width: `${pct}%`,
    height: "100%",
    background: ACCENT,
    transition: "width 600ms ease",
  }),
  exitBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 8,
    border: `1.5px solid ${CARD_BORDER}`,
    background: CARD,
    color: TEXT,
    fontSize: "clamp(12px, 0.9vw, 15px)",
    fontWeight: 700,
    cursor: "pointer",
  },
  // The three-column split — driven by a layout preset (see
  // TV_LAYOUT_PRESETS/selectLayoutPreset above), defaulting to
  // TV_LAYOUT_PRESETS.standard (45% Live Courts / 20% Up Next / 35%
  // Standings) — adaptive sizing changes what's INSIDE each column, never
  // the split itself, per the spec's explicit layout.
  body: (preset = TV_LAYOUT_PRESETS.standard) => ({
    display: "grid",
    gridTemplateColumns: `${preset.liveCourts}% ${preset.upNext}% ${preset.standings}%`,
    gap: "clamp(10px, 1.2vw, 20px)",
    flex: 1,
    minHeight: 0,
  }),
  column: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  columnTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(14px, 1.15vw, 19px)",
    margin: "0 0 8px 0",
    color: TEXT_FAINT,
    letterSpacing: "0.05em",
    flexShrink: 0,
  },
  // ---- Live Courts (left, 45%) ----
  courtsGrid: (columns, rows) => ({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: "clamp(8px, 1vw, 16px)",
    flex: 1,
    minHeight: 0,
  }),
  courtCard: (status, columns) => ({
    position: "relative",
    background: CARD,
    border: `3px solid ${STATUS_COLOR[status] ?? CARD_BORDER}`,
    borderRadius: 16,
    padding: columns <= 1 ? "clamp(16px, 2vw, 30px)" : "clamp(10px, 1.1vw, 18px)",
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
  matchupBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "clamp(4px, 0.6vw, 10px)",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  playerPhotoRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: "clamp(6px, 1vw, 18px)",
    flexWrap: "wrap",
  },
  playerCard: (leading) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    opacity: leading === false ? 0.55 : 1,
    transition: "opacity 400ms ease",
  }),
  playerPhotoRing: (leading) => ({
    borderRadius: "50%",
    padding: 3,
    background: leading ? ACCENT : "transparent",
    transition: "background 400ms ease",
  }),
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
    gap: "clamp(6px, 0.8vw, 14px)",
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
  winnerOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(17, 24, 39, 0.96)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(8px, 1.1vw, 18px)",
    borderRadius: 13,
    zIndex: 2,
  },
  winnerText: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(18px, 2.4vw, 36px)",
    color: GOLD,
    letterSpacing: "0.08em",
  },
  // Empty state — shared shape for all three columns (Live Courts / Up
  // Next / Standings), per PROJECT.md's exact copy for each.
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    color: TEXT_FAINT,
    textAlign: "center",
    padding: "clamp(16px, 2vw, 32px)",
  },
  emptyStateTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    fontSize: "clamp(16px, 1.4vw, 22px)",
    letterSpacing: "0.03em",
  },
  emptyStateBody: {
    fontSize: "clamp(12px, 1vw, 15px)",
    fontStyle: "italic",
  },
  // ---- Up Next (center, 20%) ----
  // TV Mode Layout Optimization (Sprint 3.1): compressed from the old
  // stacked-team-photo-rows card to a compact 2-row card (position/badge
  // header + one horizontal line per team via TeamInline in
  // OpenPlayTVModePage.jsx) so 4-5 cards fit in the column on a 1080p
  // display without scrolling, per real-world field-testing feedback.
  // TV Mode Layout Rebalancing: column narrowed 35% -> 20%, so the vw
  // coefficients below (gap/padding) are scaled down ~0.57x alongside
  // upNextSizeTier, keeping spacing proportionate to the new width.
  // Up Next Card Optimization: non-first cards get their own, tighter
  // padding — player names are the priority at this width, so the
  // highlighted card keeps its full padding/emphasis while the rest
  // shrink further (less empty padding = more of the 20% column actually
  // used for information).
  upNextList: {
    display: "flex",
    flexDirection: "column",
    gap: "clamp(5px, 0.3vw, 7px)",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  upNextCard: (isNext) => ({
    position: "relative",
    background: isNext ? "rgba(37, 99, 235, 0.14)" : CARD,
    border: `2px solid ${isNext ? ACCENT : CARD_BORDER}`,
    borderRadius: 12,
    padding: isNext ? "clamp(6px, 0.46vw, 10px) clamp(8px, 0.57vw, 12px)" : "clamp(4px, 0.3vw, 7px) clamp(6px, 0.44vw, 9px)",
    display: "flex",
    flexDirection: "column",
    gap: "clamp(2px, 0.16vw, 3px)",
    flexShrink: 0,
  }),
  upNextHeadRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 6,
  },
  // Decorative position marker ("#1") — kept small and faint per this
  // sprint's "prioritize player names over decorative elements" direction.
  upNextPosition: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(9px, 0.38vw, 10px)",
    fontWeight: 700,
    color: TEXT_FAINT,
    letterSpacing: "0.05em",
    flexShrink: 0,
  },
  // "⭐ NEXT ON COURT" badge — the visual-emphasis mechanism the spec asks
  // for (accent border already handled by upNextCard itself; this badge
  // is the second, explicit cue). Up Next Card Optimization: shrunk
  // (smaller font/padding) so it reads as a secondary cue next to the
  // teams, not the dominant element in the card.
  nextBadge: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(8px, 0.34vw, 9px)",
    fontWeight: 800,
    letterSpacing: "0.05em",
    color: BG,
    background: ACCENT,
    padding: "2px 6px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  // Court Assignment line — only ever rendered by the caller once a real
  // assignment exists (never this sprint, since upcoming matchups don't
  // carry a pre-assigned court yet) — no "Court TBD" clutter per explicit
  // direction. Style kept ready for when that data exists.
  upNextCourt: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(9px, 0.44vw, 11px)",
    color: ACCENT,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    flexShrink: 0,
  },
  // One team, one line: a small overlapping photo pair + "John / Mike" —
  // replaces the old stacked photo-above-name-per-player block, per
  // explicit direction to compress team display to a single line.
  // Up Next Card Optimization: avatar-to-name gap tightened (8 -> 5) —
  // names are the priority, the avatars just need to stay legible, not
  // spaced out.
  teamInlineRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  teamInlinePhotos: {
    display: "flex",
    flexShrink: 0,
  },
  // Each photo after the first overlaps the previous one — a compact
  // "stacked avatar pair" instead of two full-width photos side by side.
  // Up Next Card Optimization: overlap deepened (-10 -> -8, proportionate
  // to the ~12% smaller avatars) to reclaim a little more width for names.
  teamInlinePhotoWrap: (index) => ({
    marginLeft: index === 0 ? 0 : -8,
    border: `2px solid ${CARD}`,
    borderRadius: "50%",
    lineHeight: 0,
  }),
  teamInlineNames: (fontSize) => ({
    fontSize,
    fontWeight: 700,
    color: TEXT,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  }),
  upNextVs: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(8px, 0.36vw, 9px)",
    color: TEXT_FAINT,
    padding: "0 1px",
    lineHeight: 1,
  },
  // ---- Standings (right, 35%) ----
  // TV Mode Layout Optimization (Sprint 3.1): simplified further — Rank,
  // Photo, Name, and SPR only (the previous "W-L · SPR" readout dropped
  // the W-L half). Per explicit direction: "avoid displaying too many
  // statistics... this panel is intended to provide awareness, not
  // detailed analytics."
  // TV Mode Layout Rebalancing: column widened 20% -> 35% — font sizes are
  // left unchanged (still calibrated for cross-venue legibility), but the
  // extra width now goes straight to standingsName's flex:1 space, so
  // names truncate (via its existing ellipsis) far less often than before.
  standingsList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  standingsRow: (rank) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 6px",
    borderRadius: 8,
    borderLeft: `4px solid ${rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : "transparent"}`,
    background: rank <= 3 ? "rgba(255,255,255,0.05)" : "transparent",
    transition: "transform 400ms ease, background 400ms ease",
  }),
  standingsRank: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 800,
    fontSize: "clamp(12px, 0.95vw, 15px)",
    width: "1.6em",
    flexShrink: 0,
  },
  standingsPhotoRing: (rank) => ({
    borderRadius: "50%",
    padding: 2,
    background: rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : "transparent",
    display: "flex",
    flexShrink: 0,
  }),
  standingsName: {
    fontSize: "clamp(12px, 1vw, 15px)",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
    minWidth: 0,
  },
  // Compact "62 SPR" trailing readout — a single number, not a grid of
  // separate stat columns, to stay legible at 35% width from across a venue.
  standingsCompactStat: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "clamp(10px, 0.82vw, 13px)",
    color: TEXT_FAINT,
    textAlign: "right",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  // ---- Footer ----
  // Reserved ticker/announcement strip — see Future Compatibility in
  // PROJECT.md ("Now Calling" banner, sponsor ads, venue announcements).
  // Intentionally empty this sprint: a thin, visually-present bar so the
  // space is reserved in the layout and a later feature doesn't have to
  // resize everything above it, but renders no content of its own.
  footer: {
    flexShrink: 0,
    height: "clamp(20px, 2.2vw, 32px)",
    marginTop: "clamp(8px, 1vw, 16px)",
    borderTop: `1px solid ${CARD_BORDER}`,
  },
};
