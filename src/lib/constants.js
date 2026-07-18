export const STORAGE_PREFIX = "opl-session-";
export const ACCESS_PREFIX = "opl-access-";
export const PLAYER_DB_PREFIX = "opl-player-"; // one KV record per player, shared across every session — see lib/playerDatabase.js
export const SCORER_PIN = "1234"; // demo-only gate — a real deploy would use real umpire accounts
export const ADMIN_PIN = "918273"; // demo-only gate — the organizer's PIN for generating access codes
export const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — easy to read aloud
export const DEV_ACCESS_CODE = "GUILSIGN"; // permanent, never-expiring, reusable access code for the developer's own testing — see submitAccessCode in PickleballOpenPlay.jsx. Bypasses Supabase entirely (no lookup, no usedAt bookkeeping), unlike every real organizer-issued code from generateAccessCode

export const emptyCourt = (number) => ({
  number,
  status: "open", // 'open' | 'live' | 'finished'
  teamA: [],
  teamB: [],
  scoreA: 0,
  scoreB: 0,
  awaitingPair: false, // Winner Pool Rotation only — true once this court's finished but its paired court hasn't, see winnerPoolRound.js
  assignmentMode: "automatic", // "automatic" | "manual" — Manual Court Assignment, see PROJECT.md. While "manual" and status is "open", teamA/teamB hold the organizer's in-progress draft picks (still &lt;2 each is normal, not yet locked)
  manualLocked: false, // true once the organizer locks a manual court's 4 picks in (status becomes "live"); resets to false/"automatic" when the match ends, same as every other court
});

// which matchmaking strategy builds the next matches — see src/engines/ and
// PROJECT.md for how these plug in. "continuous": the default; every court
// draws independently from one shared waiting queue (BalancedRotationEngine).
// "winnerPool": courts pair up (1&2, 3&4, ...); when both finish, their
// winners pool together for a new match and their losers pool together for
// another, going back on the pair's lower/higher court respectively (see
// src/lib/winnerPoolRound.js).
//
// UI-labeled "Rotation Strategy" (Open Play sessions only — see
// SESSION_TYPES/CreateSessionScreen.jsx) but the stored field and every
// internal reference is still `rotationMode`, unchanged, so existing
// rotation engines, Scorer, the simulation engine, and every already-stored
// session record keep working exactly as before. This is a deliberate
// choice, not an oversight: renaming the field itself would mean old
// session records (which only have `rotationMode`) silently lose their
// rotation setting on load, and would require touching every rotation
// engine call site for a purely cosmetic rename. See PROJECT.md's Session
// Type Architecture section for the full reasoning.
export const ROTATION_MODES = [
  { value: "continuous", label: "Continuous queue" },
  { value: "winnerPool", label: "Winner Pool Rotation" },
  { value: "progressiveSkill", label: "Progressive Skill Rotation" },
];

// chosen once at Create Session — see CreateSessionScreen.jsx. Gates which
// selector shows next: "openPlay" shows Rotation Strategy (ROTATION_MODES,
// stored as rotationMode); "tournament" hides it and shows Tournament
// Format (TOURNAMENT_FORMATS) instead. "tournament" is architecture-only
// for now: it stores a tournamentFormat but no bracket/standings/seeding
// logic exists yet, so a tournament session today still just runs as a
// normal continuous-queue Open Play session under the hood. Sessions
// created before this field existed simply have no sessionType at all —
// nothing downstream reads it yet, so old records keep working unchanged.
export const SESSION_TYPES = [
  { value: "openPlay", label: "Open Play" },
  { value: "tournament", label: "Tournament" },
];

// placeholder options only — no bracket generation, round-robin scheduling,
// or elimination logic reads this field yet. Selecting one just records the
// organizer's intent on the session for a future tournament-mode feature.
export const TOURNAMENT_FORMATS = [
  { value: "roundRobin", label: "Round Robin" },
  { value: "singleElimination", label: "Single Elimination" },
  { value: "doubleElimination", label: "Double Elimination" },
];

// id -> {
//   id, name, photo, skill ('beginner' | 'intermediate'), checkedIn, skipped,
//   games, wins, losses, streak, lastResult, pointsFor, pointsAgainst,
//   partnerCounts ({ id: count }), recentPartnerIds ([id, id] most-recent-first),
//   opponentCounts ({ id: count }), lastOpponentIds ([id, id]), recentOpponentIds ([id...]),
//   courtCounts ({ courtNumber: count }), lastCourt,
// }
export const defaultState = {
  venue: "",
  courts: [],
  players: {},
  queueIds: [],
  nextMatchups: [], // [{ id, teamA: [id, id], teamB: [id, id], locked? }] — pre-built upcoming matches, editable in Scorer before they're assigned to a court
  matchHistory: [], // [{ round, court, teamA, teamB, winner, scoreA, scoreB, endedAt }] — one entry per completed match
  sessionType: "openPlay", // see SESSION_TYPES
  tournamentFormat: null, // see TOURNAMENT_FORMATS — only set when sessionType is "tournament"; architecture-only, no tournament logic reads this yet
  rotationMode: "continuous", // see ROTATION_MODES — Open Play only; labeled "Rotation Strategy" in the UI
  expectedGamesPerPlayer: 6, // Open Play only — organizer-configurable, drives Progressive Skill Rotation's session-progress/phase calc, see lib/progressiveSkillPhase.js
  progressiveSkillThresholds: { mentorshipMax: 30, transitionMax: 60 }, // Progressive Skill Rotation only — organizer-configurable phase boundaries (%), see lib/progressiveSkillPhase.js
  updatedAt: 0,
};
