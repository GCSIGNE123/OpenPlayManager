// Pool assignment — splits a flat list of Tournament Participants into
// `poolCount` groups. A small registry (Strategy pattern, same role
// getTournamentEngine plays for formats) keyed by method name; only
// "random" is implemented this milestone. Future methods (manual seeding,
// snake seeding, DUPR rating, skill level) register here without touching
// distributeEvenly or any caller — see assignPools below.
import { uid, shuffle } from "../lib/random.js";

// Splits `n` items into `poolCount` groups as evenly as possible, with any
// remainder going to the earliest pools one at a time — matches the task
// spec exactly: 18 players / 3 pools -> 6/6/6; 22 players / 4 pools ->
// 6/6/5/5. Returns an array of group sizes, e.g. [6, 6, 5, 5].
export function distributeEvenly(n, poolCount) {
  const base = Math.floor(n / poolCount);
  const remainder = n % poolCount;
  return Array.from({ length: poolCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

// entrants: Participant[] -> Participant[][], one array per pool, sized per
// distributeEvenly. The only implemented method this milestone.
function randomAssignment(entrants, poolCount) {
  const shuffled = shuffle(entrants);
  const sizes = distributeEvenly(shuffled.length, poolCount);
  const groups = [];
  let cursor = 0;
  for (const size of sizes) {
    groups.push(shuffled.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}

// Stable key for a Participant across renders/reloads — entrant.id is a
// fresh uid every time buildEntrants runs (Team Setup builds a *preview*
// entrant list before Generate Schedule ever saves anything), so Manual
// Pool Assignment can't key its {team -> pool} map by entrant.id. Keying by
// the entrant's sorted playerIds is stable for as long as the underlying
// team (singles: one player; doubles: one fixed-partner pair) doesn't
// change, which is exactly the assumption Team Setup already makes.
export function entrantKey(entrant) {
  return [...entrant.playerIds].sort().join("|");
}

// Manual Pool Assignment — the organizer explicitly decides every entrant's
// pool instead of a random shuffle. `assignments` is a plain object,
// { [entrantKey(entrant)]: poolIndex }, built by the Pool Assignment UI.
// Every entrant must appear exactly once, pointing at a pool 0..poolCount-1
// — this is the belt to the UI's own "Confirm Pools" suspenders (mirrors
// how buildAndSaveRoundRobinTournament re-validates advancesPerPool itself
// rather than trusting the form that already blocked it). Group order
// follows entrant order within the pool (stable, deterministic schedule).
export function manualAssignment(entrants, poolCount, assignments) {
  if (!assignments || typeof assignments !== "object") {
    throw new Error("Manual pool assignment needs an explicit {team -> pool} mapping.");
  }
  const groups = Array.from({ length: poolCount }, () => []);
  const seen = new Set();
  for (const entrant of entrants) {
    const key = entrantKey(entrant);
    if (!(key in assignments)) {
      throw new Error(`"${entrant.label}" hasn't been assigned to a pool yet.`);
    }
    const poolIndex = assignments[key];
    if (!Number.isInteger(poolIndex) || poolIndex < 0 || poolIndex >= poolCount) {
      throw new Error(`"${entrant.label}" is assigned to an invalid pool.`);
    }
    seen.add(key);
    groups[poolIndex].push(entrant);
  }
  // Any assignment entry that doesn't match a current entrant (stale from a
  // team that no longer exists, or a plain typo) is a real error, not a
  // silent no-op — the UI's own validation should have caught it first.
  const unknown = Object.keys(assignments).filter((k) => !seen.has(k));
  if (unknown.length > 0) {
    throw new Error(`Pool assignment refers to ${unknown.length} team(s) that no longer exist.`);
  }
  return groups;
}

// The seam future assignment methods plug into: manual (implemented above —
// organizer assigns entrants into pools by hand), snakeSeeding (rank-
// ordered, alternating pool direction), duprRating / skillLevel (rank-
// ordered by that metric, distributed round-robin across pools for
// balance). Only "random" and "manual" have real functions behind them.
export const POOL_ASSIGNMENT_METHODS = {
  random: randomAssignment,
  manual: manualAssignment,
};

// `context` is only read by "manual" (the {team -> pool} mapping); every
// other method ignores it completely, same as an engine that doesn't read
// an optional context field elsewhere in this codebase.
export function assignPools(entrants, poolCount, method = "random", context = null) {
  if (method === "manual") return manualAssignment(entrants, poolCount, context);
  const assign = POOL_ASSIGNMENT_METHODS[method] || randomAssignment;
  return assign(entrants, poolCount);
}

// "Pool A", "Pool B", ... "Pool Z", then "Pool AA" etc. (won't realistically
// be hit — Custom pool count is organizer-typed, not expected past single
// digits — but doesn't break rather than silently mislabeling).
export function poolLabel(index) {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Pool ${label}`;
}

export function makePoolId() {
  return uid();
}
