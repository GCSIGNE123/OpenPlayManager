export const STORAGE_PREFIX = "opl-session-";
export const ACCESS_PREFIX = "opl-access-";
export const SCORER_PIN = "1234"; // demo-only gate — a real deploy would use real umpire accounts
export const ADMIN_PIN = "918273"; // demo-only gate — the organizer's PIN for generating access codes
export const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — easy to read aloud

export const emptyCourt = (number) => ({
  number,
  status: "open", // 'open' | 'live' | 'finished'
  teamA: [],
  teamB: [],
  scoreA: 0,
  scoreB: 0,
  awaitingPair: false, // Winner Pool Rotation only — true once this court's finished but its paired court hasn't, see winnerPoolRound.js
});

// which matchmaking strategy builds the next matches — see src/engines/ and
// PROJECT.md for how these plug in. "continuous": the default; every court
// draws independently from one shared waiting queue (BalancedRotationEngine).
// "winnerPool": courts pair up (1&2, 3&4, ...); when both finish, their
// winners pool together for a new match and their losers pool together for
// another, going back on the pair's lower/higher court respectively (see
// src/lib/winnerPoolRound.js).
export const ROTATION_MODES = [
  { value: "continuous", label: "Continuous queue" },
  { value: "winnerPool", label: "Winner Pool Rotation" },
  { value: "progressiveSkill", label: "Progressive Skill Rotation" },
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
  rotationMode: "continuous", // see ROTATION_MODES
  expectedGamesPerPlayer: 6, // Progressive Skill Rotation only — organizer-configurable, drives session-progress/phase calc, see lib/progressiveSkillPhase.js
  updatedAt: 0,
};
