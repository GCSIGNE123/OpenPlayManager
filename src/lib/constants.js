export const STORAGE_PREFIX = "opl-session-";
export const ACTIVE_SESSION_STORAGE_KEY = "opl-active-session-code"; // Session Persistence Across Refresh — see PROJECT.md/FEATURES.md. localStorage (not sessionStorage — see bug fix note below): survives an F5/refresh, a mobile pull-to-refresh, and the browser tab/process being backgrounded or killed by the OS and reopened later — sessionStorage does NOT reliably survive that last one on mobile (iOS/Android can discard a backgrounded tab's sessionStorage when reclaiming memory, which was reported as "refreshing on phone drops back to the login page"), so it was the wrong choice for a facilitator's actual usage pattern. Holds just the plain session code string, nothing else. The original staleness concern (a device silently auto-resuming a days-old session) is now covered by Auto-End Aged Sessions (SESSION_AUTO_END_AGE_MS, lib/sessionIndexModel.js's sweepAgedSessions) instead — a session left open 3+ days gets ended server-side regardless of what any one device's local storage remembers, and "switch session" (leaveSession) still clears this immediately for an intentional exit.
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
export const QUALIFICATION_AUDIT_PREFIX = "opl-qualaudit-"; // one KV record per tournament holding its full Manual Qualification Override audit trail array — see lib/qualificationAuditModel.js
export const COURT_PREFIX = "opl-court-"; // one KV record per physical club Court, shared — see lib/courtDatabase.js. The first PERSISTENT Court entity in this app: Open Play's state.courts and Tournament's tournament.courts are both still freshly-generated, numbered-only, container-scoped arrays with no identity beyond that one session/tournament — this is deliberately a separate, new registry (Court Booking & Reservations' "master" court list), not a rename/migration of either.
export const BOOKING_PREFIX = "opl-booking-"; // one KV record per court reservation, shared — see lib/bookingModel.js
export const VENUE_PREFIX = "opl-venue-"; // one KV record per Venue (a physical pickleball facility), shared — see lib/venueModel.js. Phase 0: Multi-Tenant Foundation — the new top-level entity every other module is being prepared to hang off of (via a venueId field), but nothing is backfilled/migrated onto it yet.
export const SESSION_REPORT_PREFIX = "opl-session-report-"; // one KV record per saved Session Analytics & Fairness Report, shared — see lib/sessionReportModel.js. Sprint 4B — deliberately its own registry, independent of STORAGE_PREFIX (the LIVE session record, deleted on End Session), so a report survives the session it was generated from.
export const SESSION_INDEX_PREFIX = "opl-session-index-"; // one KV record per session EVER created (keyed by sessionCode itself, not a random id) — see lib/sessionIndexModel.js. All Sessions — unlike SESSION_REPORT_PREFIX (only written once a report is generated at End Session) or STORAGE_PREFIX (deleted at End Session), this index entry is written the moment a session is created and never deleted, so a session that's still running, was manually ended, or was auto-ended for inactivity all remain visible in one list with their opened/closed timestamps.
export const SESSION_AUTO_END_AGE_MS = 3 * 24 * 60 * 60 * 1000; // All Sessions — a still-"active" session whose sessionStartedAt is at least this old gets automatically ended (report saved, live record deleted) the next time the All Sessions screen runs its sweep — see lib/sessionIndexModel.js's sweepAgedSessions.
export const ORGANIZATION_PREFIX = "opl-organization-"; // one KV record per Organization (Pickleball Club / Coach / Academy / Corporate Group / Tournament Organizer), shared — see lib/organizationModel.js. RESERVED ARCHITECTURE ONLY this phase: no screen reads or writes these yet, per explicit direction not to build Organization Management.

// Prepared future roles — see PROJECT.md's Multi-Tenant Foundation section.
// A plain descriptive catalog, NOT wired into any authorization check —
// this app's existing PIN-based gates (SCORER_PIN/ADMIN_PIN) are the only
// real auth today and are completely unchanged by this list. Reserved so a
// future real auth system has an agreed vocabulary to implement against.
export const PLATFORM_ROLES = [
  { value: "platformOwner", label: "Platform Owner" },
  { value: "venueOwner", label: "Venue Owner" },
  { value: "venueManager", label: "Venue Manager" },
  { value: "receptionStaff", label: "Reception Staff" },
  { value: "coach", label: "Coach" },
  { value: "organizationAdmin", label: "Organization Admin" },
  { value: "player", label: "Player" },
];

export const SKILL_DIVISIONS = ["Beginner", "Intermediate", "Advanced", "Open"]; // default suggested division names — a League Season can use any of these or a custom name; "future divisions configurable" just means any label works, not a separate catalog to maintain
export const SCORER_PIN = "1234"; // demo-only gate — a real deploy would use real umpire accounts
export const ADMIN_PIN = "918273"; // demo-only gate — the organizer's PIN for generating access codes
export const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — easy to read aloud
export const DEV_ACCESS_CODE = "GUILSIGN"; // permanent, never-expiring, reusable access code for the developer's own testing — see submitAccessCode in PickleballOpenPlay.jsx. Bypasses Supabase entirely (no lookup, no usedAt bookkeeping), unlike every real organizer-issued code from generateAccessCode

export const emptyCourt = (number) => ({
  number,
  name: null, // Court Renaming — see PROJECT.md/FEATURES.md. Display-only label, editable by the facilitator (renameCourt, lib/utils.js); `number` itself remains the court's real identifier everywhere (matchHistory, Court Booking reservations, dispatch, matchmaking) and never changes. `null` (the default) falls back to "Court {number}" — see courtDisplayName.
  status: "open", // 'open' | 'dispatching' | 'live' | 'finished' — 'dispatching' is Smart Court Dispatch's own transient state (see lib/courtDispatch.js): teamA/teamB are already assigned and the court reads "Calling Players..." on screen, but scoring hasn't started yet. Moves to 'live' either automatically (Auto Start Match ON, once the voice announcement finishes/the announcement delay elapses) or only when the facilitator clicks "Start Match" (Auto Start Match OFF) — see confirmCourtLive.
  teamA: [],
  teamB: [],
  scoreA: 0,
  scoreB: 0,
  awaitingPair: false, // Winner Pool Rotation only — true once this court's finished but its paired court hasn't, see winnerPoolRound.js
  assignmentMode: "automatic", // "automatic" | "manual" — Manual Court Assignment, see PROJECT.md. While "manual" and status is "open", teamA/teamB hold the organizer's in-progress draft picks (still &lt;2 each is normal, not yet locked)
  manualLocked: false, // true once the organizer locks a manual court's 4 picks in (status becomes "live"); resets to false/"automatic" when the match ends, same as every other court
  dispatchedAt: null, // Smart Court Dispatch only — set when this court entered 'dispatching', see lib/courtDispatch.js's dispatchAvailableCourts
});

// Court Renaming — bug fix, see PROJECT.md/FEATURES.md. Every place a
// finished match used to reset a court back to its "open" defaults via a
// plain `emptyCourt(court.number)` was silently wiping out a custom court
// name too, since emptyCourt always starts `name` at null — the court
// would work fine, dispatch fine, and display its custom name right up
// until the first match on it ended, then quietly revert to "Court N".
// This is the one place that reset happens now: same fresh defaults as
// emptyCourt, but carries the court's current `name` forward untouched, so
// a custom name is authoritative for the entire session until the
// organizer explicitly renames it again (renameCourt, lib/utils.js).
export function resetCourtForNextMatch(court) {
  return { ...emptyCourt(court.number), name: court.name };
}

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
  { value: "adaptiveSkill", label: "Adaptive Skill Rotation" },
];

// Session Matchmaking Priority — see PROJECT.md/FEATURES.md. NOT a rotation
// mode: a reusable, optional candidate-ORDERING policy that works alongside
// any of the ROTATION_MODES above. `null` (the default) means "no explicit
// priority" — every existing session (and every new one that never touches
// this setting) keeps its exact current tie-break behavior, unchanged. Only
// once an organizer explicitly picks one of these does
// lib/utils.js's sortMatchupsByPriority start reordering the already-fully-
// formed matchups an engine produced — see that function's own comment for
// why this never touches partner/opponent diversity, Winner-vs-Winner,
// promotion/relegation, or division separation.
export const MATCHMAKING_PRIORITIES = [
  { value: "longestWaiting", label: "Longest Waiting Time" },
  { value: "newlyCheckedIn", label: "Newly Checked-In" },
  { value: "leastGamesPlayed", label: "Least Games Played" },
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

// Player Checkout During Open Play — see PROJECT.md. A session player's
// participation status, separate from `held` (a temporary, reversible
// exclusion from matchmaking — see lib/queueManagement.js's holdPlayer).
// CHECKED_OUT is permanent for the rest of the session: the player is
// excluded from all future match generation, but their record/stats/
// history are never touched or deleted. Deliberately a plain array (not
// hardcoded string literals scattered around) so a future status
// (AWAY/INJURED/SUSPENDED) is one more entry here, never a data migration
// — this sprint only implements ACTIVE and CHECKED_OUT, per explicit scope.
export const PLAYER_STATUSES = ["ACTIVE", "CHECKED_OUT"];

// Smart Queue Management — see PROJECT.md/FEATURES.md. The canonical set of
// display statuses a checked-in player can be in, computed (never stored)
// by lib/utils.js's getPlayerQueueStatus — reusable throughout the app
// (Waiting Players panel, Standings, any future Player Details screen)
// rather than each screen deriving its own ad hoc label from raw fields.
export const QUEUE_STATUSES = {
  PLAYING: "Playing",
  UPCOMING: "Upcoming",
  WAITING: "Waiting",
  HELD: "Held",
  CHECKED_OUT: "Checked Out",
};

// id -> {
//   id, name, photo, skill ('beginner' | 'intermediate'), checkedIn, skipped,
//   status ('ACTIVE' | 'CHECKED_OUT' — see PLAYER_STATUSES above),
//   checkedOutAt (ms epoch | null — set once, when status becomes
//   CHECKED_OUT; never cleared, there is no un-checkout this sprint),
//   games, wins, losses, streak, lastResult, pointsFor, pointsAgainst,
//   partnerCounts ({ id: count }), recentPartnerIds ([id, id] most-recent-first),
//   opponentCounts ({ id: count }), lastOpponentIds ([id, id]), recentOpponentIds ([id...]),
//   courtCounts ({ courtNumber: count }), lastCourt,
// }
export const defaultState = {
  venue: "", // the session's own display TITLE (e.g. "Ormoc City Saturday Open Play") — unrelated to the Venue entity below despite the name; kept exactly as-is for backwards compatibility
  venueId: null, // Phase 0: Multi-Tenant Foundation — nullable link to a Venue record (lib/venueModel.js). Architecture-only: null for every session created before or during this phase, and nothing yet reads it to change behavior
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
  sessionStartedAt: null, // Session Analytics Engine — set once at session creation (startSession), never touched again; the Session Summary's Duration is computed from this vs. the report's generatedAt
  rotationMode: "continuous", // see ROTATION_MODES — Open Play only; labeled "Rotation Strategy" in the UI
  expectedGamesPerPlayer: 6, // Open Play only — organizer-configurable, drives Progressive Skill Rotation's session-progress/phase calc, see lib/progressiveSkillPhase.js
  progressiveSkillThresholds: { mentorshipMax: 30, transitionMax: 60 }, // Progressive Skill Rotation only — organizer-configurable phase boundaries (%), see lib/progressiveSkillPhase.js
  adaptiveSkillThresholds: { promotionWins: 3, relegationLosses: 3 }, // Adaptive Skill Rotation only — organizer-configurable consecutive win/loss counts that trigger automatic promotion/relegation, see PickleballOpenPlay.jsx's endMatch
  skillChangeLog: [], // Adaptive Skill Rotation only — append-only activity log of every promotion/relegation/manual override: { id, playerId, playerName, previousSkill, newSkill, reason, timestamp }, see lib/utils.js's changePlayerSkill and PickleballOpenPlay.jsx's endMatch
  queueActivityLog: [], // Smart Queue Management / Smart Court Dispatch — one shared append-only activity log, entries tagged by `kind` ("heldMatchDissolved", "courtDispatched", "announcementCompleted", "announcementRepeated", "announcementMuted", "announcementSkipped", "heldPlayerReminder"): { id, kind, matchupId?, courtNumber?, teamA (names), teamB (names), reason, affectedPlayer?, timestamp } — captured at the moment of the event, never reconstructed afterward, see lib/queueManagement.js's noteDissolvedHeldMatchups/markHeldReminderShown and lib/courtDispatch.js's logDispatchEvent
  heldPlayerReminderSettings: {
    // Held Player Reminder — see PROJECT.md/FEATURES.md. A facilitator
    // safeguard only — purely reminds, never affects matchmaking/player
    // priority (see lib/queueManagement.js's getPlayersNeedingHeldReminder,
    // the only reader of these thresholds). Whichever threshold a held
    // player reaches first (minutes OR rounds) triggers the reminder.
    thresholdMinutes: 20,
    thresholdRounds: 3,
    repeatIntervalMinutes: 10, // how long a dismissed ("Keep Held") reminder stays quiet before it can fire again for the same player
  },
  courtDispatchSettings: {
    // Smart Court Dispatch — see PROJECT.md/FEATURES.md. Rotation-mode-
    // agnostic session settings, editable in Session Settings regardless
    // of which rotation mode is active.
    autoFillCourts: true, // OFF stops automatic dispatch entirely — facilitators keep using manual "Assign match"/"Fill all open courts", everything else (Hold/Resume/regeneration/etc.) keeps working normally
    autoStartMatch: true, // OFF: a dispatched court stays "Calling Players..." until the facilitator clicks "Start Match" — the announcement/timer still run, only the dispatching->live transition becomes manual
    voiceEnabled: true, // ON/OFF for the Web Speech API announcement itself
    volume: 1, // 0-1, SpeechSynthesisUtterance.volume
    rate: 1, // SpeechSynthesisUtterance.rate (speed)
    voiceURI: null, // null = browser default voice; otherwise matched against window.speechSynthesis.getVoices() at announce time
    announcementDelayMs: 2000, // Immediate=0 / 2s (default) / 5s / 10s — delay before the announcement starts speaking, and also the fallback wait before auto-starting the match when voice is muted
  },
  matchmakingPriority: null, // Session Matchmaking Priority — see MATCHMAKING_PRIORITIES above. null = no explicit priority (existing behavior, unaffected)
  queueingStopped: false, // Stop Queueing — see PROJECT.md/FEATURES.md. While true: save() skips generating any NEW matchups and skips automatic dispatch; existing live matches and existing nextMatchups entries are completely unaffected, and the facilitator can still manually dispatch (Assign match / Fill all open courts) from whatever's already queued. Resume Queueing (flip back to false) restores normal automatic behavior instantly, next save().
  pendingCourtRemovals: 0, // Dynamic Court Count — see PROJECT.md/FEATURES.md. Incremented by requestRemoveCourt (lib/queueManagement.js) when the organizer removes a court that isn't idle right now; applyPendingCourtRemovals (run every save(), same "reacts on every save" precedent as Smart Court Dispatch) removes the last court and decrements this the moment that specific court is actually open, never losing a live match and never dropping below 1 court total.
  updatedAt: 0,
};
