// Bracket seeding — turns the flat, pool-grouped qualifier list Playoff
// Qualification produces into a single ordered seed list (seed 1..N). A
// small method registry (Strategy pattern, same shape as PoolAssignment.js
// and getTournamentEngine), with only "standardCrossPool" implemented this
// milestone — Random, Snake, Manual, and DUPR-based seeding are documented
// seams for later, registering here without touching any caller.

// Standard Cross-Pool Seeding: group qualifiers by rank tier (every pool's
// 1st, every pool's 2nd, ...), sort each tier by pool label (A, B, C, ...),
// and concatenate tiers in rank order. The "cross-pool" pairing effect
// (A1 vs D2, B1 vs C2, ...) falls entirely out of the mirror pairing a
// bracket's first round uses (seed 1 vs seed N, seed 2 vs seed N-1, ...) —
// this function itself does no reversing or interleaving, it's a plain
// concatenation. Verified against the task's own examples:
//   2 pools, top 2: seeds = [A1, B1, A2, B2] -> round 1 pairs 1v4, 2v3
//     = A1 vs B2, B1 vs A2 (matches spec exactly)
//   4 pools, top 2: seeds = [A1,B1,C1,D1, A2,B2,C2,D2] -> round 1 pairs
//     1v8, 2v7, 3v6, 4v5 = A1 vs D2, B1 vs C2, C1 vs B2, D1 vs A2 (matches)
export function standardCrossPoolSeeding(qualifiedTeams) {
  const tiers = new Map();
  for (const team of qualifiedTeams) {
    if (!tiers.has(team.rank)) tiers.set(team.rank, []);
    tiers.get(team.rank).push(team);
  }
  const ranks = [...tiers.keys()].sort((a, b) => a - b);
  const seeded = [];
  for (const rank of ranks) {
    const teamsInTier = [...tiers.get(rank)].sort((a, b) => a.poolLabel.localeCompare(b.poolLabel));
    seeded.push(...teamsInTier);
  }
  return seeded.map((team, i) => ({ ...team, seed: i + 1 }));
}

export const BRACKET_SEEDING_METHODS = {
  standardCrossPool: standardCrossPoolSeeding,
};

// qualifiedTeams: QualifiedTeam[] (see PoolQualificationService)
// returns: SeededTeam[] — same shape plus `seed` (1-indexed), ordered by seed
export function assignSeeds(qualifiedTeams, method = "standardCrossPool") {
  const seed = BRACKET_SEEDING_METHODS[method] || standardCrossPoolSeeding;
  return seed(qualifiedTeams);
}
