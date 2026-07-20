export const STORAGE_PREFIX = "opl-session-";
export const ACCESS_PREFIX = "opl-access-";
export const PLAYER_DB_PREFIX = "opl-player-"; // one KV record per player, shared across every session — see lib/playerDatabase.js
export const TOURNAMENT_PREFIX = "opl-tournament-"; // one KV record per tournament, independent of the Open Play session's own state shape — see lib/tournamentModel.js
export const TEMPLATE_PREFIX = "opl-template-"; // one KV record per custom tournament template, shared — see engines/TournamentTemplateService.js. Built-in templates are NOT stored here (static in-memory presets, always available, can't be edited/deleted)
export const TEMPLATE_DEFAULT_KEY = "opl-template-default"; // singleton record holding just { templateId } — lets a non-persisted built-in template be marked default without becoming a mutable DB row
export const USER_PREFIX = "opl-user-"; // one KV record per RBAC user, shared — see lib/userDatabase.js
export const ROLE_PREFIX = "opl-role-"; // one KV record per CUSTOM role, shared — see engines/Role.js. Built-in roles are NOT stored here (static in-memory, always available, can't be edited/deleted), same precedent as TEMPLATE_PREFIX
export const LEAGUE_PREFIX = "opl-league-"; // one KV record per League (the recurring club-level container, not a specific season), shared — see lib/leagueModel.js
export const LEAGUE_SEASON_PREFIX = "opl-league-season-"; // one KV record per LeagueSeason — internally Tournament-shaped (pools/courts/status) so existing tournament engines/services work on it unmodified, see lib/leagueModel.js's header comment
export const MEMBERSHIP_PLAN_PREFIX = "opl-membership-plan-"; // one KV record per CUSTOM membership plan, shared — see lib/membershipPlans.js. Built-in plans (Daily Pass/Monthly/Quarterly/Annual/Lifetime) are NOT stored here, same built-in/custom precedent as TEMPLATE_PREFIX/ROLE_PREFIX
export const RATING_PREFIX = "opl-playerrating-"; // one KV record per player's PlayerRating, shared — see lib/ratingModel.js. Keyed by Player Database id, not session player id — a rating requires a persistent club identity. Deliberately NOT a prefix of RATING_HISTORY_PREFIX below (nor vice versa) — window.storage.list matches by literal string prefix, so "opl-rating-" would incorrectly also match "opl-rating-history-*" keys
export const RATING_HISTORY_PREFIX = "opl-ratinghistory-"; // one KV record per player holding their full RatingHistory array, shared — see lib/ratingModel.js
export const ACHIEVEMENT_PREFIX = "opl-achievement-"; // one KV record per player holding their earned Achievement array, shared — see engines/AchievementService.js

export const SKILL_DIVISIONS = ["Beginner", "Intermediate", "Advanced", "Open"]; // default suggested division names — a League Season can use any of these or a custom name; "future divisions configurable" just means any label works, not a separate catalog to maintain
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
  // Tournament Templates — set at Create Session if the organizer picked
  // "Use Template" instead of "Start From Scratch" (see
  // CreateSessionScreen.jsx/TournamentTemplateService.js). Read once by
  // TournamentScheduleView.jsx to pre-fill its Singles/Doubles, Number of
  // Pools, Pool Assignment Method, and Teams Advancing Per Pool defaults
  // the first time it renders — never read again after that, and never
  // itself generates a schedule. null for every Open Play session and for
  // any tournament session created via "Start From Scratch".
  pendingTournamentTemplate: null,
  rotationMode: "continuous", // see ROTATION_MODES — Open Play only; labeled "Rotation Strategy" in the UI
  expectedGamesPerPlayer: 6, // Open Play only — organizer-configurable, drives Progressive Skill Rotation's session-progress/phase calc, see lib/progressiveSkillPhase.js
  progressiveSkillThresholds: { mentorshipMax: 30, transitionMax: 60 }, // Progressive Skill Rotation only — organizer-configurable phase boundaries (%), see lib/progressiveSkillPhase.js
  updatedAt: 0,
};
