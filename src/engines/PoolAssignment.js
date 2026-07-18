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

// The seam future assignment methods plug into: manual (organizer drags
// entrants into pools by hand), snakeSeeding (rank-ordered, alternating
// pool direction), duprRating / skillLevel (rank-ordered by that metric,
// distributed round-robin across pools for balance). None are implemented
// yet — only "random" has a real function behind it.
export const POOL_ASSIGNMENT_METHODS = {
  random: randomAssignment,
};

export function assignPools(entrants, poolCount, method = "random") {
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
