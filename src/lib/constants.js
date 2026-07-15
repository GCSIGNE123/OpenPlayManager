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
});

export const defaultState = {
  venue: "",
  courts: [],
  players: {}, // id -> { id, name, photo, checkedIn, games, wins, losses, streak, lastResult, lastPartnerId, pointsFor, pointsAgainst }
  queueIds: [],
  updatedAt: 0,
};
