export const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
:root {
  /* ---------------------------------------------------------------------
   * CONNECT.PH brand palette — single source of truth for every color in
   * the app. Extracted from the CONNECT.PH logo: navy wordmark (Primary),
   * orange "C"/plug mark (Secondary), with a lighter orange tint (Accent)
   * and the usual semantic roles (Success/Warning/Error) chosen to stay
   * clearly distinct from Primary/Secondary at a glance. Every color used
   * anywhere in styles.js should trace back to one of these — see the
   * legacy aliases below for how the rest of this file (which still
   * references the old --ink/--court/... names) picks these up without
   * needing every style object rewritten.
   * ------------------------------------------------------------------- */
  --color-primary: #16355E; /* Navy — logo wordmark */
  --color-primary-dark: #0E2540;
  --color-secondary: #F7941D; /* Orange — logo "C" / plug */
  /* the vibrant brand orange above is ~2.4:1 against white/--color-bg —
     well under WCAG AA's 4.5:1 for text. Use it for fills/badges/icons
     (paired with dark text on top of it), and use this darkened variant
     (~4.8:1) any time orange itself needs to BE the text/foreground color
     on a light background. */
  --color-secondary-text: #B85C00;
  --color-accent: #FFB25C; /* lighter orange — hover/accent states */
  --color-success: #1F8A57;
  --color-warning: #E8A33D;
  --color-error: #D64545;
  --color-bg: #F5F7FA;
  --color-surface: #FFFFFF;
  --color-border: #D8DEE4;
  --color-text: #1B2A3A;
  --color-text-muted: #5B6B7A;
  --color-text-faint: #93A1AC;
  --color-on-primary: #FFFFFF;

  /* per-phase colors for Progressive Skill Rotation (see
     ProgressiveSkillPanel) — Mentorship/Competitive reuse Secondary/Primary
     so the phase badge and progress bar stay inside the same palette;
     Transition reuses Warning (amber) since it's already a distinct third
     hue, rather than inventing an unrelated fourth color. The "-tint"
     variants are pale versions used for a zone's *inactive* state on the
     progress bar. */
  --color-phase-mentorship: var(--color-secondary);
  --color-phase-mentorship-tint: #FDE7CB;
  --color-phase-transition: var(--color-warning);
  --color-phase-transition-tint: #FBECD3;
  --color-phase-competitive: var(--color-primary);
  --color-phase-competitive-tint: #D7DEE7;

  /* rotating avatar-background palette (lib/utils.js's colorForName hashes
     a player's name to one of these) — needs several distinct hues to
     actually distinguish players at a glance, so it's more than just
     Primary/Secondary, but still centralized here rather than hardcoded
     in JS */
  --color-avatar-1: var(--color-primary);
  --color-avatar-2: var(--color-secondary);
  --color-avatar-3: #3E6B8A;
  --color-avatar-4: #7A4C8A;
  --color-avatar-5: var(--color-success);
  --color-avatar-6: #8A6D3B;

  /* legacy aliases — every existing var(--ink)/var(--court)/... reference
     throughout styles.js resolves through these, so the whole app picks up
     the CONNECT.PH palette without rewriting each style object individually */
  --ink: var(--color-text);
  --court: var(--color-primary);
  --court-dark: var(--color-primary-dark);
  --chalk: var(--color-bg);
  --ball: var(--color-secondary);
  --coral: var(--color-error);
  --line: var(--color-border);
}
@keyframes phasePop {
  0% { transform: scale(0.82); opacity: 0.3; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes progressMarkerPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(22, 53, 94, 0.45); }
  50% { box-shadow: 0 0 0 5px rgba(22, 53, 94, 0); }
}
@keyframes settingsSlideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

export const styles = {
  app: {
    fontFamily: "'Inter', sans-serif",
    background: "var(--chalk)",
    color: "var(--ink)",
    minHeight: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  landingWrap: {
    padding: "40px 24px",
    maxWidth: 640,
    margin: "0 auto",
  },
  landingHero: {
    textAlign: "center",
    marginBottom: 28,
  },
  landingTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: "clamp(26px, 5vw, 38px)",
    textTransform: "uppercase",
    margin: "6px 0 10px 0",
    color: "var(--court)",
    lineHeight: 1.05,
  },
  landingSub: {
    fontSize: 14,
    color: "var(--color-text-muted)",
    maxWidth: 420,
    margin: "0 auto",
  },
  landingCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },
  landingCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 12,
    padding: 20,
  },
  landingCardTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: 17,
    textTransform: "uppercase",
    margin: "0 0 6px 0",
  },
  landingCardText: {
    fontSize: 12.5,
    color: "var(--color-text-muted)",
    margin: "0 0 14px 0",
    lineHeight: 1.5,
  },
  codeInput: {
    fontFamily: "'Space Mono', monospace",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    textAlign: "center",
  },
  adminLink: {
    display: "block",
    margin: "26px auto 0 auto",
    background: "none",
    border: "none",
    color: "var(--color-text-faint)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
  },
  adminCode: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.05em",
  },
  createWrap: {
    padding: "22px 24px 30px 24px",
    maxWidth: 520,
    margin: "0 auto",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    color: "var(--color-text-muted)",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
    marginBottom: 18,
  },
  courtStepper: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  courtStepperCount: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 22,
    fontWeight: 700,
    minWidth: 20,
    textAlign: "center",
  },
  rosterList: {
    listStyle: "none",
    padding: 0,
    margin: "4px 0 4px 0",
    maxWidth: 480,
  },
  rosterItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 13.5,
  },
  rosterRemoveBtn: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "var(--chalk)",
    color: "var(--color-text-faint)",
    border: "1px solid var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    marginLeft: "auto",
    padding: 0,
  },
  checkInTapBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    background: "var(--court)",
    color: "var(--chalk)",
    border: "none",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  skipToggleBtn: (skipped) => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: skipped ? "var(--coral)" : "var(--chalk)",
    color: skipped ? "var(--color-surface)" : "var(--color-text-muted)",
    border: `1px solid ${skipped ? "var(--coral)" : "var(--line)"}`,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  }),
  // Adaptive Skill Rotation manual override — see WaitingPlayersPanel.jsx/
  // StandingsView.jsx. Same shape/sizing as skipToggleBtn, just a neutral
  // (not skipped-red) palette since this isn't a warning state. Named
  // distinctly from the pre-existing `skillToggleBtn(active)` function
  // (used pervasively elsewhere for Singles/Doubles-style two-way toggles)
  // — reusing that name here previously caused this object to be silently
  // shadowed by the later function definition in this same file, which
  // made the Adaptive Skill Rotation override button crash on render
  // (a function passed as a `style` prop instead of a plain object).
  skillOverrideBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "var(--chalk)",
    color: "var(--color-text-muted)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  // Partner Requests — see PROJECT.md/FEATURES.md. Compact partner
  // picker, always shown in the Waiting Players panel. See WaitingPlayersPanel.jsx.
  partnerSelect: {
    background: "var(--chalk)",
    color: "var(--color-text-muted)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "5px 6px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
    maxWidth: 110,
  },
  startBtn: {
    width: "100%",
    justifyContent: "center",
    marginTop: 22,
    padding: "13px 0",
    fontSize: 14,
  },
  header: {
    background: "var(--court)",
    color: "var(--chalk)",
    padding: "20px 24px 0 24px",
  },
  headerInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 16,
  },
  // light-background usage (Landing/Access screens) — the darker,
  // accessible orange variant, since the vibrant brand orange fails
  // WCAG AA contrast as text on a light background
  kicker: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.14em",
    color: "var(--color-secondary-text)",
    marginBottom: 6,
    fontWeight: 700,
  },
  // dark-background usage (the session header, navy) — the vibrant brand
  // orange reads clearly here and has good contrast against navy
  kickerOnDark: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.14em",
    color: "var(--color-secondary)",
    marginBottom: 6,
    fontWeight: 700,
  },
  title: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: "clamp(22px, 4vw, 32px)",
    letterSpacing: "0.01em",
    margin: 0,
    lineHeight: 1.05,
    textTransform: "uppercase",
  },
  headerStats: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  statPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(243,241,228,0.12)",
    border: "1px solid rgba(243,241,228,0.25)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
  },
  codePill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--ball)",
    color: "var(--ink)",
    border: "none",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: "'Space Mono', monospace",
    cursor: "pointer",
    letterSpacing: "0.04em",
  },
  leaveBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "rgba(243,241,228,0.12)",
    border: "1px solid rgba(243,241,228,0.25)",
    color: "var(--chalk)",
    cursor: "pointer",
  },
  dot: (active) => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: active ? "var(--ball)" : "var(--coral)",
    display: "inline-block",
  }),
  nav: {
    display: "flex",
    gap: 4,
  },
  navBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(243,241,228,0.65)",
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.03em",
    cursor: "pointer",
    borderBottom: "3px solid transparent",
    fontFamily: "'Inter', sans-serif",
  },
  navBtnActive: {
    color: "var(--chalk)",
    borderBottom: "3px solid var(--ball)",
  },
  kitchenLine: {
    height: 0,
    borderTop: "2px dashed var(--line)",
    background: "var(--chalk)",
  },
  main: {
    padding: "22px 24px 8px 24px",
    minHeight: 320,
  },
  loading: {
    padding: 40,
    textAlign: "center",
    color: "var(--color-text-muted)",
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "var(--color-text-muted)",
    margin: "22px 0 10px 0",
    textTransform: "uppercase",
  },
  // One Court Per Row (Operational Layout) — each court now spans the full
  // page width, stacked vertically, instead of a multi-column card grid —
  // see PROJECT.md/FEATURES.md. Facilitators run 20-40+ player sessions and
  // need every court's names/score/actions readable without squinting.
  courtGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  courtOpenRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  courtLiveRow: {
    display: "flex",
    alignItems: "stretch",
    gap: 20,
    flexWrap: "wrap",
  },
  courtTeamHalf: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: "1 1 360px",
    minWidth: 300,
  },
  courtTeamBadge: {
    flexShrink: 0,
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--color-text-faint)",
    background: "var(--color-bg)",
    border: "1px solid var(--line)",
    borderRadius: 5,
    padding: "3px 6px",
  },
  courtVerticalDivider: {
    width: 1,
    background: "var(--line)",
    flexShrink: 0,
  },
  courtActionsInline: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  courtCard: (status) => ({
    background: "var(--color-surface)",
    border: `1.5px solid ${status === "finished" ? "var(--coral)" : status === "dispatching" ? "var(--color-secondary)" : "var(--line)"}`,
    borderRadius: 10,
    padding: 16,
    position: "relative",
  }),
  courtHeadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  courtBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.06em",
    background: "var(--ink)",
    color: "var(--chalk)",
    padding: "3px 8px",
    borderRadius: 4,
  },
  // Court Renaming — see PROJECT.md/FEATURES.md. Small pencil button
  // embedded in courtBadge; only rendered when the caller passes onRename
  // (currently the Scorer tab only — read-only board/TV views omit it).
  courtRenameBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "var(--chalk)",
    opacity: 0.75,
    padding: 0,
    cursor: "pointer",
    flexShrink: 0,
  },
  courtRenameRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  courtRenameInput: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 6px",
    borderRadius: 4,
    border: "1.5px solid var(--line)",
    width: 130,
  },
  statusTag: (status) => ({
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.08em",
    color:
      status === "open"
        ? "var(--color-text-muted)"
        : status === "finished"
          ? "var(--coral)"
          : status === "dispatching"
            ? "var(--color-secondary-text)"
            : "var(--court)",
  }),
  openCourtText: {
    color: "var(--color-text-faint)",
    fontSize: 13,
    margin: 0,
  },
  assignmentToggleRow: {
    display: "flex",
    gap: 4,
    background: "var(--color-bg)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
  },
  assignmentToggleBtn: (active) => ({
    flex: 1,
    padding: "5px 8px",
    borderRadius: 6,
    border: "none",
    background: active ? "var(--color-primary)" : "transparent",
    color: active ? "var(--chalk)" : "var(--color-text-muted)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
    cursor: "pointer",
  }),
  manualBadge: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--ink)",
    background: "var(--ball)",
    borderRadius: 5,
    padding: "3px 7px",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  manualTeamLabel: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.06em",
    color: "var(--color-text-muted)",
    margin: "8px 0 4px 0",
  },
  manualSlotEmpty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1.5px dashed var(--line)",
    background: "var(--color-bg)",
    color: "var(--color-text-faint)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 6,
  },
  manualSlotFilled: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    width: "100%",
    padding: "6px 8px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    marginBottom: 6,
  },
  teamRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    gap: 8,
  },
  teamPlayers: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: "1 1 auto",
  },
  playerChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  subBtn: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "1px solid var(--line)",
    background: "var(--chalk)",
    color: "var(--color-text-faint)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
  },
  moveToQueueBtn: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "1px solid var(--color-secondary)",
    background: "var(--chalk)",
    color: "var(--color-secondary-text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
  },
  subReturnLabel: {
    fontSize: 12,
    color: "var(--color-text-muted)",
    margin: "10px 0 0 0",
  },
  teamName: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--color-text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  avatarImg: {
    borderRadius: "50%",
    objectFit: "cover",
    border: "1.5px solid var(--color-surface)",
    boxShadow: "0 0 0 1px var(--line)",
    flexShrink: 0,
  },
  avatarInitials: {
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-surface)",
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 10,
    flexShrink: 0,
    border: "1.5px solid var(--color-surface)",
    boxShadow: "0 0 0 1px var(--line)",
  },
  photoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  photoPreviewWrap: {
    position: "relative",
    width: 52,
    height: 52,
  },
  photoPreview: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    objectFit: "cover",
    border: "1.5px solid var(--line)",
  },
  photoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "var(--color-surface)",
    border: "1.5px dashed var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  photoClearBtn: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "var(--coral)",
    color: "var(--color-surface)",
    border: "1.5px solid var(--chalk)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  photoLabel: {
    fontSize: 12.5,
    fontWeight: 700,
    color: "var(--court)",
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  declareWinnerBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--court)",
    background: "var(--color-surface)",
    border: "1.5px solid var(--court)",
    borderRadius: 6,
    padding: "4px 8px",
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  scoreControl: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  scoreBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "1.5px solid var(--line)",
    background: "var(--chalk)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink)",
  },
  scoreDigit: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 22,
    minWidth: 28,
    textAlign: "center",
  },
  vsLine: {
    borderTop: "1.5px dashed var(--line)",
    margin: "2px 0",
  },
  courtActionsRow: {
    display: "flex",
    gap: 8,
    marginTop: 14,
  },
  fixTeamsBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "var(--color-surface)",
    color: "var(--color-text-muted)",
    border: "1.5px solid var(--line)",
    borderRadius: 7,
    padding: "9px 12px",
    fontWeight: 700,
    fontSize: 11.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  editHint: {
    fontSize: 12,
    color: "var(--color-text-faint)",
    margin: "0 0 10px 0",
  },
  playerSearchInput: {
    width: "100%",
    marginBottom: 10,
    fontSize: 13,
  },
  editGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  editChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "'Inter', sans-serif",
  },
  editChipA: {
    borderColor: "var(--court)",
    background: "rgba(31,92,67,0.06)",
  },
  editChipB: {
    borderColor: "var(--coral)",
    background: "rgba(232,93,76,0.06)",
  },
  editChipName: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--ink)",
  },
  editChipSide: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-text-faint)",
  },
  pickerGroupLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--color-text-faint)",
    margin: "10px 0 6px 0",
  },
  pickerScheduledTag: {
    display: "block",
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-muted)",
    marginTop: 1,
  },
  editWarning: {
    fontSize: 11.5,
    color: "var(--coral)",
    fontWeight: 600,
    margin: "8px 0 0 0",
  },
  editActions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
  },
  standingsTable: {
    maxWidth: 480,
  },
  standingsHeadRow: {
    display: "flex",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "2px solid var(--ink)",
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    letterSpacing: "0.06em",
  },
  standingsRow: {
    display: "flex",
    alignItems: "center",
    padding: "9px 0",
    borderBottom: "1px solid var(--line)",
  },
  standingsRankCol: {
    width: 24,
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
    color: "var(--color-text-faint)",
  },
  standingsNameCol: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  standingsName: {
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  standingsStatCol: {
    width: 36,
    textAlign: "center",
    fontFamily: "'Space Mono', monospace",
    fontSize: 13,
    fontWeight: 600,
  },
  standingsNote: {
    fontSize: 11.5,
    color: "var(--color-text-faint)",
    marginTop: 14,
  },
  standingsRatingCol: {
    width: 44,
    textAlign: "center",
  },
  standingsSortBtn: (active) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    font: "inherit",
    letterSpacing: "inherit",
    color: active ? "var(--color-primary)" : "inherit",
    cursor: "pointer",
  }),
  standingsSortArrow: {
    fontSize: 8,
    lineHeight: 1,
  },
  ratingBadge: (rating) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
    fontWeight: 700,
    color: rating === null ? "var(--color-text-faint)" : rating >= 60 ? "var(--color-on-primary)" : "var(--ink)",
    background: rating === null ? "transparent" : rating >= 60 ? "var(--color-success)" : "var(--ball)",
    borderRadius: 5,
    padding: rating === null ? 0 : "2px 6px",
    flexShrink: 0,
  }),
  endMatchBtn: {
    flex: 1,
    background: "var(--ball)",
    color: "var(--ink)",
    border: "none",
    borderRadius: 7,
    padding: "9px 0",
    fontWeight: 700,
    fontSize: 12.5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
  },
  checkinWrap: { maxWidth: 480 },
  checkinRow: { display: "flex", gap: 8 },
  historyToolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  historySearchBox: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: "1 1 220px",
    padding: "9px 12px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    color: "var(--color-text-faint)",
  },
  historySearchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--ink)",
    fontSize: 13.5,
    fontFamily: "'Inter', sans-serif",
  },
  historyRoundCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
  },
  historyRoundHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "12px 14px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 13,
    color: "var(--ink)",
  },
  historyRoundCount: {
    marginLeft: "auto",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: 11.5,
    color: "var(--color-text-faint)",
  },
  historyRoundBody: {
    padding: "0 14px 14px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  historyMatchCard: {
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: 12,
    background: "var(--color-bg)",
  },
  historyMatchHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  historyMatchTime: {
    fontSize: 11,
    color: "var(--color-text-faint)",
  },
  historyMatchTeams: {
    display: "flex",
    flexDirection: "column",
  },
  historyTeamLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",
    gap: 8,
  },
  historyPlayerLink: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--ink)",
    fontSize: 13,
    fontWeight: 600,
  },
  historyScore: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 15,
    minWidth: 20,
    textAlign: "center",
    color: "var(--color-text-faint)",
  },
  historyScoreWin: {
    color: "var(--color-success)",
  },
  historyWinnerLine: {
    fontSize: 12,
    color: "var(--color-text-muted)",
    margin: "8px 0 0 0",
  },
  historyPlayerPanel: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--color-primary)",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  historyPlayerPanelHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: "1px solid var(--line)",
  },
  historyPlayerRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px 14px",
    padding: "8px 0",
    borderBottom: "1px dashed var(--line)",
    fontSize: 12.5,
  },
  historyRoundTag: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 11,
    color: "var(--color-text-faint)",
    width: "100%",
  },
  input: {
    flex: 1,
    padding: "11px 14px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    background: "var(--color-surface)",
    color: "var(--ink)",
  },
  primaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--court)",
    color: "var(--chalk)",
    border: "none",
    borderRadius: 8,
    padding: "11px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dangerBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--coral)",
    color: "var(--color-surface)",
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: "0 auto",
    background: "var(--chalk)",
    color: "var(--ink)",
    border: "1.5px solid var(--ink)",
    borderRadius: 7,
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer",
  },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  confirmMsg: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "var(--court)",
    fontSize: 13,
    fontWeight: 600,
    marginTop: 10,
  },
  // Progressive Skill Rotation Fallback — see PROJECT.md. A non-blocking
  // informational banner (not a warning/error — no --coral/warning color),
  // distinct from confirmMsg (a transient one-line confirmation) since this
  // needs to persist and read comfortably as a small paragraph.
  infoBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    background: "var(--color-surface)",
    border: "1.5px solid var(--court)",
    borderLeft: "4px solid var(--court)",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--ink)",
  },
  queueList: { listStyle: "none", padding: 0, margin: 0, maxWidth: 480 },
  queueItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 13.5,
  },
  queueNum: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    color: "var(--color-text-faint)",
    width: 16,
  },
  queueName: { flex: 1, fontWeight: 600 },
  resultTag: (result) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-surface)",
    background: result === "win" ? "var(--color-success)" : "var(--coral)",
    borderRadius: 4,
    padding: "2px 5px",
    flexShrink: 0,
  }),
  skillTag: (skill) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 9.5,
    fontWeight: 700,
    color: skill === "intermediate" ? "var(--chalk)" : "var(--ink)",
    background: skill === "intermediate" ? "var(--court)" : "var(--ball)",
    borderRadius: 4,
    padding: "2px 5px",
    flexShrink: 0,
    letterSpacing: "0.03em",
  }),
  // Pre-Check-In Skill Correction — same look as skillTag above, but a real
  // <button> (border reset + pointer cursor) so a facilitator can flip a
  // registered-not-yet-checked-in player's skill in one tap, right in the
  // Check-In tab's roster list. See CheckinView.jsx.
  skillTagButton: (skill) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 9.5,
    fontWeight: 700,
    color: skill === "intermediate" ? "var(--chalk)" : "var(--ink)",
    background: skill === "intermediate" ? "var(--court)" : "var(--ball)",
    border: "none",
    borderRadius: 4,
    padding: "3px 6px",
    flexShrink: 0,
    letterSpacing: "0.03em",
    cursor: "pointer",
  }),
  // Player Payment Tracking — see PROJECT.md/FEATURES.md. Compact
  // read-only tag ("UP"/"P-C"/"P-GC"), same visual family as skillTag.
  // Green when paid, coral when unpaid, so a facilitator can scan a whole
  // roster at a glance. See PaymentBadge.jsx.
  paymentTag: (paid) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 9.5,
    fontWeight: 700,
    color: paid ? "var(--chalk)" : "var(--ink)",
    background: paid ? "var(--color-success)" : "var(--coral)",
    borderRadius: 4,
    padding: "2px 5px",
    flexShrink: 0,
    letterSpacing: "0.03em",
  }),
  // Same tag, as a real <button> — used only once a player is already
  // Paid, so a facilitator can correct a mistaken method (Cash <-> GCash)
  // in a single tap. See PaymentBadge.jsx.
  paymentTagButton: (paid) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 9.5,
    fontWeight: 700,
    color: paid ? "var(--chalk)" : "var(--ink)",
    background: paid ? "var(--color-success)" : "var(--coral)",
    border: "none",
    borderRadius: 4,
    padding: "3px 6px",
    flexShrink: 0,
    letterSpacing: "0.03em",
    cursor: "pointer",
  }),
  paymentButtonGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  paymentQuickBtn: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 9.5,
    fontWeight: 700,
    color: "var(--ink)",
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 4,
    padding: "2px 5px",
    flexShrink: 0,
    letterSpacing: "0.02em",
    cursor: "pointer",
  },
  // Player Payment Tracking — Scorer tab's facilitator-reference stats
  // panel (Players Paid/Unpaid, Cash/GCash breakdown). Read-only, purely
  // informational — see PickleballOpenPlay.jsx's derivePaymentStats.
  paymentStatsPanel: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 8,
    padding: "8px 12px",
    margin: "10px 0",
    fontSize: 12.5,
  },
  paymentStatsItem: {
    color: "var(--color-text-muted)",
  },
  // Smart Queue Management — see WaitingPlayersPanel.jsx's getPlayerQueueStatus
  // badge. "Held" gets the same warning-coral treatment as the old
  // Skip/"Sitting out" toggle did; everything else is a neutral chip.
  queueStatusTag: (status) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 9.5,
    fontWeight: 700,
    color: status === "Held" ? "var(--color-surface)" : "var(--color-text-muted)",
    background: status === "Held" ? "var(--coral)" : "var(--chalk)",
    border: status === "Held" ? "none" : "1px solid var(--line)",
    borderRadius: 4,
    padding: "2px 5px",
    flexShrink: 0,
    letterSpacing: "0.02em",
  }),
  waitingTimerText: {
    fontSize: 11,
    color: "var(--color-text-faint)",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  // Sprint 2.1 — Queue Activity Log cards (Held Match Removed). Small,
  // scannable cards rather than a single dense line, so a facilitator can
  // recognize the dissolved matchup (which teams, not just who caused it)
  // at a glance during a busy session.
  queueActivityList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 14,
  },
  queueActivityCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderLeft: "4px solid var(--ball)",
    borderRadius: 8,
    padding: "10px 12px",
  },
  // amber/orange badge (not red — this isn't an error, just an
  // attention-worthy event) with a pause icon, so a long log scans fast
  queueActivityTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "var(--color-secondary-text)",
    background: "var(--color-secondary)",
    borderRadius: 5,
    padding: "3px 7px",
    marginBottom: 6,
  },
  queueActivityCourt: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    marginBottom: 3,
  },
  queueActivityTeams: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--ink)",
    flexWrap: "wrap",
  },
  queueActivityVs: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--color-text-faint)",
  },
  queueActivityReasonLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    marginTop: 6,
  },
  queueActivityReason: {
    fontSize: 12.5,
    color: "var(--color-text-muted)",
  },
  queueActivityTime: {
    fontSize: 10.5,
    color: "var(--color-text-faint)",
    marginTop: 6,
  },
  // Scorer Layout — Prioritize Courts sprint. The Queue Activity Log now
  // renders below Courts and defaults to collapsed; this wraps the whole
  // section so it reads as one distinct block regardless of expand state.
  queueActivitySection: {
    marginTop: 18,
  },
  queueActivityToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    color: "var(--ink)",
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
  },
  queueActivityToggleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--color-text-muted)",
  },
  // Collapsed-state compact summary — "Latest: <what happened> <time>",
  // so a facilitator glancing at a collapsed log still sees something
  // happened without expanding the whole list.
  queueActivityLatest: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    padding: "8px 12px 0 12px",
    fontSize: 12.5,
  },
  queueActivityLatestLabel: {
    fontWeight: 700,
    color: "var(--color-text-faint)",
  },
  queueActivityLatestText: {
    fontWeight: 600,
    color: "var(--color-text-muted)",
  },
  // Redesign Scorer Tab for Clarity — compact single-line rows replace the
  // multi-line cards once the log is expanded, matching the target mockup's
  // denser, more scannable list. Same underlying entry data, just laid out
  // on one line instead of stacked.
  queueActivityRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 12.5,
  },
  queueActivityPill: (kind) => ({
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "var(--color-secondary-text)",
    background: "var(--color-secondary)",
    borderRadius: 5,
    padding: "3px 7px",
    whiteSpace: "nowrap",
  }),
  queueActivityRowText: {
    flex: 1,
    minWidth: 0,
    color: "var(--ink)",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  queueActivityRowTime: {
    flexShrink: 0,
    fontSize: 10.5,
    color: "var(--color-text-faint)",
    whiteSpace: "nowrap",
  },
  queueActivityFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px 0 12px",
    fontSize: 11.5,
    color: "var(--color-text-faint)",
  },
  queueActivityViewAllBtn: {
    background: "none",
    border: "none",
    color: "var(--court)",
    fontWeight: 700,
    fontSize: 11.5,
    cursor: "pointer",
    padding: 0,
    fontFamily: "'Inter', sans-serif",
  },
  // Redesign Scorer Tab for Clarity — names-first player display: a plain
  // numbered index replaces the avatar photo wherever hideAvatar is set.
  playerChipIndex: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    minWidth: 14,
    textAlign: "right",
  },
  // Optimize Player Names in the Scorer Tab — see PROJECT.md/FEATURES.md.
  // Overrides teamName's nowrap/ellipsis: names-first Scorer tab rows
  // (court cards) now let a long name wrap onto a second line instead of
  // being cut short with "…", and get a much larger guaranteed minWidth so
  // truncation only happens in the rare case a name genuinely doesn't fit
  // even at full width — not as a matter of course. Static font size
  // (no responsive/clamp scaling) — this alone resolved the readability
  // complaint from a real 32-player session without needing one.
  teamNameProminent: {
    fontSize: 14.5,
    fontWeight: 700,
    flex: "3 1 auto",
    minWidth: 90,
    whiteSpace: "normal",
    overflow: "visible",
    textOverflow: "clip",
    wordBreak: "break-word",
    lineHeight: 1.15,
  },
  skillToggle: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  skillToggleBtn: (active) => ({
    flex: 1,
    padding: "9px 10px",
    borderRadius: 7,
    border: `1.5px solid ${active ? "var(--court)" : "var(--line)"}`,
    background: active ? "var(--court)" : "var(--color-surface)",
    color: active ? "var(--chalk)" : "var(--color-text-muted)",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer",
    textAlign: "center",
    fontFamily: "'Inter', sans-serif",
  }),
  queueGames: { fontSize: 11, color: "var(--color-text-faint)" },
  matchupCard: (isNext) => ({
    background: "var(--color-surface)",
    border: `1.5px solid ${isNext ? "var(--court)" : "var(--line)"}`,
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 10,
  }),
  matchupHeader: (isNext) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: isNext ? "var(--court)" : "var(--color-text-faint)",
    textTransform: "uppercase",
  }),
  matchupHeadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  lockToggleBtn: (locked) => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: locked ? "var(--ball)" : "transparent",
    color: locked ? "var(--ink)" : "var(--color-text-faint)",
    border: `1px solid ${locked ? "var(--ball)" : "var(--line)"}`,
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 10.5,
    fontWeight: 700,
    cursor: "pointer",
  }),
  matchupTeams: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  matchupTeam: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  matchupVs: {
    fontFamily: "'Anton', sans-serif",
    fontSize: 12,
    color: "var(--coral)",
    flexShrink: 0,
  },
  emptyQueue: { color: "var(--color-text-faint)", fontSize: 13.5 },
  loginWrap: {
    maxWidth: 340,
    margin: "20px auto",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  loginTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: 20,
    textTransform: "uppercase",
    margin: "10px 0 2px 0",
  },
  loginSub: { fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px 0" },
  pinInput: {
    width: "100%",
    textAlign: "center",
    letterSpacing: "0.3em",
    fontSize: 18,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    marginBottom: 10,
    fontFamily: "'Space Mono', monospace",
  },
  pinError: { color: "var(--coral)", fontSize: 12.5, marginTop: 8, fontWeight: 600 },
  loginNote: { fontSize: 11.5, color: "var(--color-text-faint)", marginTop: 14 },
  scorerToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 10,
  },
  toolbarText: { fontSize: 13.5, color: "var(--color-text-muted)" },
  rotationRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13.5,
    color: "var(--color-text-muted)",
  },
  rotationSelect: {
    padding: "6px 10px",
    borderRadius: 7,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    color: "var(--ink)",
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
  },
  sessionInfoCard: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 14,
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 16,
  },
  sessionInfoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  sessionInfoLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--color-text-faint)",
  },
  sessionInfoValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--ink)",
  },
  // status: 'pending' | 'inProgress' | 'completed' everywhere this was
  // already used (pool matches, League matches), plus bracket-only
  // additions — 'locked' (waiting on a previous round, distinct from
  // 'pending'/"ready to play"), 'ready' (both participants known, not yet
  // started), and 'paused' (Live Playoff Bracket & Match Operations) — see
  // PlayoffEngine.getMatchState. Every existing call site keeps working
  // unchanged since it never passes those new values.
  matchStatusBadge: (status) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: status === "completed" ? "var(--chalk)" : status === "locked" ? "var(--color-text-faint)" : "var(--ink)",
    background:
      status === "completed"
        ? "var(--court)"
        : status === "inProgress"
          ? "var(--ball)"
          : status === "paused"
            ? "var(--coral)"
            : status === "ready"
              ? "rgba(0,150,80,0.1)"
              : "var(--color-bg)",
    border: status === "pending" || status === "ready" ? "1.5px solid var(--line)" : status === "locked" ? "1.5px dashed var(--line)" : "none",
    borderRadius: 5,
    padding: "3px 7px",
    flexShrink: 0,
    display: "inline-block",
    opacity: status === "locked" ? 0.6 : 1,
  }),
  byeTag: {
    fontSize: 12,
    color: "var(--color-text-faint)",
    fontStyle: "italic",
  },
  tournamentSetupCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 10,
    padding: 16,
    maxWidth: 420,
  },
  dashboardTabRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  dashboardTabBtn: (active) => ({
    padding: "8px 14px",
    borderRadius: 7,
    border: `1.5px solid ${active ? "var(--court)" : "var(--line)"}`,
    background: active ? "var(--court)" : "var(--color-surface)",
    color: active ? "var(--chalk)" : "var(--color-text-muted)",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
  }),
  placeholderCard: {
    background: "var(--color-surface)",
    border: "1.5px dashed var(--line)",
    borderRadius: 10,
    padding: 24,
    textAlign: "center",
    color: "var(--color-text-faint)",
    fontSize: 13.5,
  },
  tournamentProgressTrack: {
    height: 10,
    borderRadius: 6,
    overflow: "hidden",
    border: "1.5px solid var(--line)",
    background: "var(--color-bg)",
    marginTop: 4,
  },
  tournamentProgressFill: (percent) => ({
    height: "100%",
    width: `${percent}%`,
    background: percent >= 100 ? "var(--color-success)" : "var(--court)",
    transition: "width 0.4s ease",
  }),
  matchCompletedCard: {
    borderColor: "var(--color-success)",
    background: "rgba(31,92,67,0.05)",
  },
  poolScheduleBlock: {
    marginBottom: 20,
  },
  poolHeading: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: 15,
    textTransform: "uppercase",
    color: "var(--ink)",
    margin: "0 0 6px 0",
  },
  scoreInputRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "8px 0",
  },
  scoreInputField: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-text-muted)",
    flex: 1,
  },
  winnerSelectRow: {
    display: "flex",
    gap: 8,
    marginBottom: 10,
  },
  winnerSelectBtn: (active) => ({
    flex: 1,
    padding: "8px 10px",
    borderRadius: 7,
    border: `1.5px solid ${active ? "var(--color-success)" : "var(--line)"}`,
    background: active ? "rgba(31,92,67,0.1)" : "var(--color-surface)",
    color: active ? "var(--court)" : "var(--color-text-muted)",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    textAlign: "center",
  }),
  tournamentStandingsScroll: {
    overflowX: "auto",
  },
  tournamentStandingsTable: {
    minWidth: 640,
    borderCollapse: "collapse",
    width: "100%",
  },
  tournamentStandingsHeadRow: {
    borderBottom: "2px solid var(--ink)",
  },
  tournamentStandingsHeadCell: {
    padding: "6px 8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    letterSpacing: "0.05em",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  tournamentStandingsRow: (rank) => ({
    borderBottom: "1px solid var(--line)",
    background: rank <= 3 ? "rgba(230,178,0,0.06)" : "transparent",
  }),
  tournamentStandingsCell: {
    padding: "8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: 12.5,
    fontWeight: 600,
    textAlign: "center",
    color: "var(--ink)",
    whiteSpace: "nowrap",
  },
  tournamentStandingsNameCell: {
    padding: "8px",
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--ink)",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  tournamentStandingsDiffCell: (diff) => ({
    padding: "8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: 12.5,
    fontWeight: 700,
    textAlign: "center",
    whiteSpace: "nowrap",
    color: diff > 0 ? "var(--color-success)" : diff < 0 ? "var(--color-error)" : "var(--color-text-faint)",
  }),
  standingsHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  tournamentCompleteBadge: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--color-success)",
    background: "rgba(0,150,80,0.1)",
    border: "1px solid var(--color-success)",
    borderRadius: 999,
    padding: "3px 10px",
  },
  // status: "qualified" | "eliminated" | "pending" — Pool Qualification
  // Engine's three-state Qualification Status column (🟢/🔴/⏳). Accepts a
  // bare boolean too (legacy true/false = qualified/eliminated) so any
  // older call site that hasn't been touched keeps rendering correctly.
  qualificationTag: (status) => {
    const s = status === true ? "qualified" : status === false ? "eliminated" : status;
    // Advanced Qualification — see PROJECT.md. "wildCard"/"bestThirdPlace"
    // are qualified-by-a-different-method, not eliminated — same green
    // family as "qualified" (not the faint/grey "eliminated" look), so an
    // organizer scanning a pool table can tell "still in it" from "out" at
    // a glance regardless of which method got them there.
    const isQualified = s === "qualified" || s === "wildCard" || s === "bestThirdPlace" || s === "manualOverride";
    const color = isQualified ? "var(--color-success)" : s === "pending" ? "var(--ball)" : "var(--color-text-faint)";
    return {
      fontFamily: "'Space Mono', monospace",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: s === "pending" ? "var(--ink)" : color,
      background: isQualified ? "rgba(0,150,80,0.1)" : s === "pending" ? "rgba(230,178,0,0.12)" : "var(--color-bg)",
      border: `1px solid ${isQualified ? "var(--color-success)" : s === "pending" ? "var(--ball)" : "var(--line)"}`,
      borderRadius: 5,
      padding: "3px 7px",
      display: "inline-block",
    };
  },
  qualifiersList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  qualifiersListItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--ink)",
  },
  qualifiersListPool: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    letterSpacing: "0.03em",
  },
  bracketScroll: {
    display: "flex",
    gap: 16,
    overflowX: "auto",
    paddingBottom: 8,
  },
  bracketRoundColumn: {
    flex: "0 0 240px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  bracketSeedTag: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    marginRight: 6,
  },
  bracketTbdLabel: {
    fontSize: 13,
    fontStyle: "italic",
    color: "var(--color-text-faint)",
  },
  courtCardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  courtCard: (derivedStatus) => ({
    background: "var(--color-surface)",
    border: `1.5px solid ${derivedStatus === "occupied" ? "var(--court)" : "var(--line)"}`,
    borderRadius: 10,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }),
  courtCardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  courtCardName: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: 15,
    textTransform: "uppercase",
    color: "var(--ink)",
  },
  courtStatusBadge: (derivedStatus) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color:
      derivedStatus === "occupied"
        ? "var(--chalk)"
        : derivedStatus === "maintenance"
          ? "var(--ink)"
          : derivedStatus === "disabled"
            ? "var(--color-text-faint)"
            : "var(--color-success)",
    background:
      derivedStatus === "occupied"
        ? "var(--court)"
        : derivedStatus === "maintenance"
          ? "var(--ball)"
          : derivedStatus === "disabled"
            ? "var(--color-bg)"
            : "rgba(0,150,80,0.1)",
    border:
      derivedStatus === "available"
        ? "1px solid var(--color-success)"
        : derivedStatus === "disabled"
          ? "1px solid var(--line)"
          : "none",
    borderRadius: 5,
    padding: "3px 7px",
    flexShrink: 0,
  }),
  queueListItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 8,
    flexWrap: "wrap",
  },
  queueMatchup: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--ink)",
  },
  queueSourceTag: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--color-text-faint)",
    letterSpacing: "0.03em",
    marginLeft: 8,
  },
  // Court Management (Court Booking & Reservations) — a visual management
  // dashboard: responsive card grid, 16:9 hero photo/illustration, large
  // court-number heading, reusable operational-status badge, info/
  // equipment pill rows, and an inline reservation summary. Deliberately
  // separate names from courtGrid/courtCard above (Open Play's live
  // Scorer court cards) — same visual family, different data/props shape,
  // not a shared component. `courtPhotoThumb*` below is still used
  // unchanged by the small upload preview in the Add/Edit court form
  // (CourtPhotoEditor) — the hero card styles are new and separate.
  courtMgmtGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
    gap: 20,
    margin: "16px 0",
  },
  courtMgmtCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 2px 10px rgba(20,30,45,0.06)",
    display: "flex",
    flexDirection: "column",
    transition: "box-shadow 0.15s ease, transform 0.15s ease",
  },
  courtMgmtCardBody: {
    padding: "16px 18px 18px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  // 16:9 hero — photo when present, a professional court illustration
  // (courtHeroIllustration below) otherwise. `aspect-ratio` keeps the
  // proportion at any card width without JS measuring.
  courtHeroWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    background: "var(--color-primary)",
    overflow: "hidden",
  },
  courtHeroImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  courtNumberHeading: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: 26,
    lineHeight: 1.05,
    letterSpacing: "0.01em",
    textTransform: "uppercase",
    color: "var(--ink)",
    margin: 0,
  },
  // The badge row a status badge sits in — deliberately generic (not
  // "courtStatusRow") so future accolade badges (Premium Court,
  // Competition Court, Training Court, Members Only, ...) can be appended
  // here later without any layout change, per Future Compatibility.
  courtBadgeRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  courtInfoPillRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  courtInfoPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--color-text-muted)",
    background: "var(--chalk)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 10px",
  },
  courtEquipmentRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
  },
  courtEquipmentPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10.5,
    fontWeight: 600,
    color: "var(--color-success)",
    background: "rgba(31,138,87,0.09)",
    borderRadius: 6,
    padding: "2.5px 7px",
  },
  courtRateLine: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
    fontFamily: "'Space Mono', monospace",
  },
  courtRateAmount: {
    fontSize: 17,
    fontWeight: 700,
    color: "var(--ink)",
  },
  courtRateUnit: {
    fontSize: 11.5,
    color: "var(--color-text-muted)",
  },
  courtReservationSummary: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--line)",
  },
  courtReservationStat: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  courtReservationLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--color-text-faint)",
  },
  courtReservationValue: {
    fontSize: 14.5,
    fontWeight: 800,
    color: "var(--ink)",
  },
  courtMgmtCardActions: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  courtPhotoThumbWrap: {
    position: "relative",
    width: 56,
    height: 56,
    flexShrink: 0,
  },
  courtPhotoThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    objectFit: "cover",
    border: "1.5px solid var(--line)",
    display: "block",
  },
  courtPhotoThumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    background: "var(--chalk)",
    border: "1.5px dashed var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // The Court Management operational-status badge — 7 states, reusable
  // anywhere in the app a court's live state needs showing (not just this
  // screen). Pure display: CourtBookingScreen.jsx derives which of the 7
  // applies from existing signals only (court.active, court.maintenance,
  // AvailabilityService.getCourtsReservedNow, and a currently-active
  // booking's already-stored bookingSource) — nothing new is persisted,
  // and neither AvailabilityService nor BookingService are touched.
  // Named distinctly from the pre-existing `courtStatusBadge` (used by
  // TournamentCourtsView.jsx for its own, differently-shaped
  // available/occupied/maintenance/disabled status) to avoid colliding
  // with it — the two are unrelated status vocabularies.
  courtOperationalBadge: (kind) => {
    const map = {
      available: "var(--color-success)",
      reserved: "var(--color-avatar-3)",
      openPlay: "var(--color-secondary)",
      tournament: "var(--color-avatar-4)",
      coaching: "var(--color-warning)",
      maintenance: "var(--color-error)",
      inactive: "var(--color-text-faint)",
    };
    return {
      fontFamily: "'Space Mono', monospace",
      fontSize: 10.5,
      fontWeight: 800,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "var(--color-surface)",
      background: map[kind] || map.inactive,
      borderRadius: 999,
      padding: "4px 10px",
      flexShrink: 0,
    };
  },
  // ---- Reservation Calendar (Interactive Reservation Timeline) ----
  // See src/components/ReservationTimeline.jsx. Colors reuse the exact
  // same CSS custom properties as everything else in this app (no new
  // hex values) — status colors kept as-is per explicit direction, not
  // reinvented for this sprint.
  reservationStatusColor: (statusKey) => {
    switch (statusKey) {
      case "confirmed": // Booking.status "reserved" — 🟢
        return { background: "var(--color-success)", color: "var(--color-surface)" };
      case "cancelled": // 🔴
        return { background: "var(--color-error)", color: "var(--color-surface)" };
      case "completed": // ⚪
        return { background: "var(--chalk)", color: "var(--color-text-muted)", border: "1.5px solid var(--line)" };
      case "maintenance": // 🟠 — court-level, not a booking status
        return { background: "var(--color-accent)", color: "var(--ink)" };
      case "noShow":
      default:
        return { background: "var(--color-text-faint)", color: "var(--ink)" };
    }
  },
  reservationScroll: {
    overflowX: "auto",
    paddingBottom: 4,
  },
  timelineHeaderRow: {
    display: "flex",
  },
  timelineHeaderCell: {
    flex: 1,
    minWidth: 46,
    fontSize: 11,
    color: "var(--color-text-faint)",
    fontFamily: "'Space Mono', monospace",
  },
  timelineWeekHeaderCell: (isToday) => ({
    flex: 1,
    minWidth: 92,
    textAlign: "center",
    fontSize: 11.5,
    fontWeight: isToday ? 800 : 600,
    color: isToday ? "var(--court)" : "var(--color-text-muted)",
    fontFamily: "'Space Mono', monospace",
    padding: "2px 4px",
  }),
  timelineRow: {
    display: "flex",
    alignItems: "center",
    marginTop: 8,
  },
  timelineRowLabel: {
    width: 104,
    flexShrink: 0,
    fontWeight: 700,
    fontSize: 13,
    paddingRight: 6,
  },
  timelineGridTrack: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    height: 44,
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 8,
  },
  timelineGridCell: (clickable) => ({
    position: "absolute",
    top: 0,
    height: "100%",
    cursor: clickable ? "pointer" : "not-allowed",
  }),
  timelineNowLine: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 2,
    background: "var(--color-error)",
    zIndex: 2,
    pointerEvents: "none",
  },
  reservationBlock: {
    position: "absolute",
    top: 0,
    height: "100%",
    borderRadius: 6,
    fontSize: 10.5,
    fontWeight: 700,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "0 6px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    cursor: "pointer",
    zIndex: 1,
  },
  reservationBlockTime: {
    fontSize: 9,
    fontWeight: 600,
    opacity: 0.85,
  },
  reservationTooltip: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 6,
    minWidth: 190,
    background: "var(--ink)",
    color: "var(--chalk)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 11.5,
    lineHeight: 1.5,
    zIndex: 10,
    boxShadow: "0 6px 16px rgba(0,0,0,0.22)",
    pointerEvents: "none",
  },
  weekDayCell: {
    position: "relative",
    flex: 1,
    minWidth: 92,
    height: 40,
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 6,
    marginRight: 4,
    cursor: "pointer",
  },
  courtSelect: {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    color: "var(--ink)",
    fontSize: 12.5,
    fontFamily: "'Inter', sans-serif",
  },
  courtNameInput: {
    padding: "8px 10px",
    borderRadius: 7,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    color: "var(--ink)",
    fontSize: 13,
    fontFamily: "'Inter', sans-serif",
    flex: 1,
    minWidth: 140,
  },
  phaseBadge: (phaseKey) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: phaseKey === "competitive" ? "var(--chalk)" : "var(--ink)",
    background:
      phaseKey === "mentorship" ? "var(--ball)" : phaseKey === "transition" ? "var(--color-phase-transition)" : "var(--court)",
    borderRadius: 5,
    padding: "3px 7px",
    flexShrink: 0,
    display: "inline-block",
    animation: "phasePop 0.35s ease",
  }),
  expectedGamesInput: {
    width: 48,
    padding: "4px 6px",
    borderRadius: 6,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    color: "var(--ink)",
    fontSize: 12.5,
    fontFamily: "'Inter', sans-serif",
  },
  progressiveSkillPanel: {
    marginBottom: 16,
  },
  progressBarTrack: {
    position: "relative",
    display: "flex",
    height: 10,
    borderRadius: 6,
    overflow: "hidden",
    border: "1.5px solid var(--line)",
    marginTop: 8,
    marginBottom: 4,
  },
  progressBarZone: (phaseKey, active) => ({
    height: "100%",
    background:
      phaseKey === "mentorship"
        ? active
          ? "var(--ball)"
          : "var(--color-phase-mentorship-tint)"
        : phaseKey === "transition"
        ? active
          ? "var(--color-phase-transition)"
          : "var(--color-phase-transition-tint)"
        : active
        ? "var(--court)"
        : "var(--color-phase-competitive-tint)",
    transition: "background 0.4s ease",
  }),
  progressBarMarker: {
    position: "absolute",
    top: -2,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "var(--court)",
    border: "2px solid var(--chalk)",
    transform: "translateX(-50%)",
    transition: "left 0.5s ease",
    animation: "progressMarkerPulse 1.8s ease infinite",
  },
  progressBarLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "var(--color-text-faint)",
    fontFamily: "'Space Mono', monospace",
    marginBottom: 10,
  },
  settingsToggleBtn: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--court)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  settingsPanel: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 10,
    padding: "10px 12px",
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 8,
    animation: "settingsSlideDown 0.2s ease",
  },
  settingsField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 11.5,
    color: "var(--color-text-muted)",
    fontWeight: 600,
  },
  // Smart Court Dispatch — SessionSettingsDialog.jsx's ON/OFF checkbox
  // rows (Auto-fill Courts, Auto Start Match, Voice Announcements)
  settingsCheckboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--color-text-muted)",
    fontWeight: 600,
    marginTop: 8,
  },
  textareaInput: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    fontSize: 13.5,
    fontFamily: "'Inter', sans-serif",
    background: "var(--color-surface)",
    color: "var(--ink)",
    resize: "vertical",
    minHeight: 56,
  },
  playerDbMeta: {
    fontSize: 10.5,
    color: "var(--color-text-faint)",
    marginLeft: 4,
  },
  statsRow: {
    display: "flex",
    gap: 14,
    marginTop: 10,
    fontSize: 12,
    color: "var(--color-text-muted)",
  },
  sessionInfoHeadRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gridColumn: "1 / -1",
  },
  dialogOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(20,26,38,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 100,
  },
  dialogCard: {
    background: "var(--color-surface)",
    borderRadius: 12,
    border: "1.5px solid var(--line)",
    padding: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  dialogHeadRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  dialogTitle: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 15,
    color: "var(--ink)",
    margin: 0,
  },
  dialogField: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    marginBottom: 14,
  },
  dialogLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.03em",
    color: "var(--color-text-muted)",
    textTransform: "uppercase",
  },
  dialogReadOnlyValue: {
    fontSize: 13.5,
    color: "var(--color-text-faint)",
    padding: "9px 0",
  },
  dialogThresholdRow: {
    display: "flex",
    gap: 10,
  },
  dialogActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 18,
  },
  // Session Analytics Engine (Sprint 4A) — a wider variant of dialogCard
  // for a data-heavy report; reuses dialogOverlay/dialogHeadRow/dialogTitle
  // as-is for the same look-and-feel as every other dialog in the app.
  analyticsReportCard: {
    background: "var(--color-surface)",
    borderRadius: 12,
    border: "1.5px solid var(--line)",
    padding: 24,
    width: "100%",
    maxWidth: 720,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  // Held Player Reminder — a fixed, non-blocking stack (never a modal
  // overlay) so it can never block interaction with the rest of the
  // Scorer tab, and stacks vertically so multiple simultaneous held-player
  // reminders are all visible at once.
  heldReminderStack: {
    position: "fixed",
    bottom: 16,
    right: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    zIndex: 90, // below dialogOverlay (100) so a real dialog always wins if both are somehow open
    maxWidth: 300,
  },
  heldReminderCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--color-secondary)",
    borderRadius: 10,
    padding: "10px 12px",
    boxShadow: "0 4px 16px rgba(20,26,38,0.18)",
  },
  heldReminderHeadRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  heldReminderTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.02em",
    color: "var(--color-secondary-text)",
    textTransform: "uppercase",
  },
  heldReminderBody: {
    fontSize: 13,
    color: "var(--ink)",
    margin: "0 0 4px 0",
  },
  heldReminderSkill: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-secondary-text)",
  },
  heldReminderMeta: {
    fontSize: 12,
    color: "var(--color-text-muted)",
    margin: "0 0 6px 0",
  },
  heldReminderPrompt: {
    fontSize: 12.5,
    fontWeight: 700,
    color: "var(--color-text-muted)",
    margin: "0 0 8px 0",
  },
  heldReminderActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  // Session Report Export (Sprint 4C)
  analyticsExportRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  analyticsGradeRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 10,
    background: "var(--color-bg)",
    border: "1.5px solid var(--line)",
    marginBottom: 18,
  },
  analyticsGradeScore: (score) => ({
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 28,
    color: score >= 90 ? "var(--court)" : score >= 70 ? "var(--color-secondary-text)" : "var(--coral)",
    flexShrink: 0,
  }),
  analyticsGradeLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--ink)",
  },
  analyticsGradeSub: {
    fontSize: 11.5,
    color: "var(--color-text-faint)",
  },
  analyticsSection: {
    marginBottom: 18,
  },
  analyticsStatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  analyticsStatItem: {
    background: "var(--color-bg)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "8px 10px",
  },
  analyticsStatLabel: {
    display: "block",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--color-text-faint)",
    marginBottom: 3,
  },
  analyticsStatValue: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 16,
    color: "var(--ink)",
  },
  analyticsAttentionList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  analyticsAttentionCard: {
    background: "var(--color-bg)",
    border: "1.5px solid var(--line)",
    borderLeft: "4px solid var(--coral)",
    borderRadius: 8,
    padding: "8px 12px",
  },
  analyticsAttentionName: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--ink)",
  },
  analyticsAttentionReason: {
    fontSize: 11.5,
    color: "var(--color-text-muted)",
  },
  analyticsEmptyNote: {
    fontSize: 12.5,
    color: "var(--color-text-faint)",
    fontStyle: "italic",
  },
  // Session Review Improvements — see PROJECT.md/FEATURES.md. Read-only
  // per-player payment detail list inside the Payment Summary section.
  analyticsPaymentList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 10,
  },
  analyticsPaymentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 12.5,
  },
  analyticsPaymentName: {
    color: "var(--ink)",
    fontWeight: 600,
  },
  iconBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 7,
    border: "1.5px solid var(--line)",
    background: "var(--color-surface)",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  },
  statsChip: (phaseKey) => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    color:
      phaseKey === "mentorship" ? "var(--ink)" : phaseKey === "transition" ? "var(--ink)" : "var(--court)",
  }),
  awaitingPairText: {
    fontSize: 12,
    color: "var(--color-text-faint)",
    textAlign: "center",
    margin: "10px 0 0 0",
  },
  syncError: {
    marginTop: 16,
    fontSize: 12,
    color: "var(--coral)",
    fontWeight: 600,
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "var(--color-text-faint)",
    padding: "14px 0 18px 0",
  },

  // ---- Developer / rotation simulator page ----
  devWrap: {
    padding: "22px 24px 30px 24px",
    maxWidth: 720,
    margin: "0 auto",
  },
  devFormCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 12,
    padding: 18,
    marginBottom: 18,
  },
  devFormGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  devCheckboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--color-text-muted)",
    marginBottom: 14,
  },
  devSummaryCard: {
    background: "var(--color-surface)",
    border: "1.5px solid var(--line)",
    borderRadius: 12,
    padding: 18,
    marginBottom: 18,
  },
  devSummaryLine: {
    fontSize: 13,
    color: "var(--ink)",
    margin: "4px 0",
  },
  devFairnessRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  devFairnessScore: (score) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--color-on-primary)",
    background: score >= 85 ? "var(--color-success)" : score >= 60 ? "var(--color-warning)" : "var(--color-error)",
    borderRadius: 8,
    padding: "6px 14px",
  }),
  devSectionGap: {
    marginTop: 22,
  },
};
