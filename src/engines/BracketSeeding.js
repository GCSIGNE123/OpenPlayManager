// Bracket seeding — turns the flat, pool-grouped qualifier list Playoff
// Qualification produces into a single ordered seed list (seed 1..N). A
// small method registry (Strategy pattern, same shape as PoolAssignment.js
// and getTournamentEngine) — Manual & Advanced Seeding (see PROJECT.md)
// expanded this from a single hardcoded function into five real class-based
// strategies (Standard Cross-Pool, Random, Snake, Rating, Manual), all
// implementing the same generateSeeds()/validateSeeds()/previewBracket()
// interface so PlayoffBracketGenerator never needs to know which one is
// selected.
import { DEFAULT_INITIAL_RATING } from "../lib/ratingModel.js";

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

// Manual & Advanced Seeding — see PROJECT.md. A common base class every
// concrete strategy below extends, matching the spec's requested interface
// exactly: generateSeeds() (the actual ordering), validateSeeds() (only
// ManualSeedingStrategy has real rules — every other strategy always
// succeeds, since only Manual depends on organizer input that can be
// incomplete/wrong), and previewBracket() (shared here since it's the same
// "generate seeds, then mirror-pair round 1" derivation for every
// strategy — no need for each subclass to reimplement it).
//
// Deliberately synchronous, same as standardCrossPoolSeeding always was —
// RatingSeedingStrategy needs player ratings, which only exist in async
// storage, but that fetch happens ONE level up (lib/tournament.js's
// saveGenerateBracket, in an already-async UI action) and gets passed in
// as `context.ratings`, a plain Map. Keeping this whole interface
// synchronous is what lets PlayoffBracketGenerator.seedParticipants stay
// synchronous too, so bracket generation's existing contract (a plain
// return value, not a Promise) never has to change for the one strategy
// (Standard Cross-Pool) that still auto-generates on the old hot path.
class SeedingStrategy {
  // qualifiedTeams: QualifiedTeam[] (see PoolQualificationService)
  // context: strategy-specific extra data (ratings map, manual seed
  // assignments, a random seed value for testing, ...) — always optional,
  // always plain data, never itself async.
  // returns: SeededTeam[] — qualifiedTeams plus `seed` (1-indexed)
  generateSeeds(qualifiedTeams, context) {
    throw new Error("generateSeeds() must be implemented by a SeedingStrategy subclass");
  }

  // returns: { valid: boolean, errors: string[] }. The base default is
  // "always valid" — true for every strategy except Manual, which is the
  // only one with real, checkable input from the organizer.
  validateSeeds(qualifiedTeams, context) {
    return { valid: true, errors: [] };
  }

  // Pure preview — generates seeds, then mirrors round 1 the exact same
  // way PlayoffBracketGenerator.createRounds does (seed i vs seed N-1-i),
  // without building match records or touching the tournament at all.
  // What the Seeding page's "preview of resulting bracket" renders.
  previewBracket(qualifiedTeams, context) {
    const seeds = this.generateSeeds(qualifiedTeams, context);
    const total = seeds.length;
    const pairs = [];
    for (let i = 0; i < Math.floor(total / 2); i++) {
      pairs.push({ seedA: seeds[i], seedB: seeds[total - 1 - i] });
    }
    return { seeds, pairs };
  }
}

export class StandardCrossPoolSeedingStrategy extends SeedingStrategy {
  generateSeeds(qualifiedTeams) {
    return standardCrossPoolSeeding(qualifiedTeams);
  }
}

// A small seeded PRNG (mulberry32) — Math.random() has no seed hook, and
// "repeatable with an optional seed value for testing" needs one. Given
// the same numeric seed and the same qualifiedTeams, always produces the
// same shuffle.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RandomSeedingStrategy extends SeedingStrategy {
  // context.seedValue: optional number. Given, the shuffle is repeatable
  // (same seedValue + same qualifiedTeams -> same order every time) —
  // what makes this testable. Omitted, Date.now() drives a real random
  // shuffle each call, same as an organizer would expect.
  generateSeeds(qualifiedTeams, context = {}) {
    const rand = mulberry32(context.seedValue ?? Date.now());
    const shuffled = [...qualifiedTeams];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map((team, i) => ({ ...team, seed: i + 1 }));
  }
}

export class SnakeSeedingStrategy extends SeedingStrategy {
  // Classic "snake draft" tiering: the same rank-tier grouping Standard
  // Cross-Pool uses (every pool's 1st, every pool's 2nd, ...), but
  // alternates sort direction per tier (tier 1 pools ascending, tier 2
  // descending, tier 3 ascending, ...) instead of Standard's always-
  // ascending order — the well-established meaning of "snake seeding" in
  // draft/bracket contexts, and what actually differentiates it from
  // Standard Cross-Pool once there are 3+ pools (for exactly 2 pools the
  // two methods coincide, since there's only one tier boundary).
  generateSeeds(qualifiedTeams) {
    const tiers = new Map();
    for (const team of qualifiedTeams) {
      if (!tiers.has(team.rank)) tiers.set(team.rank, []);
      tiers.get(team.rank).push(team);
    }
    const ranks = [...tiers.keys()].sort((a, b) => a - b);
    const seeded = [];
    ranks.forEach((rank, tierIndex) => {
      const teamsInTier = [...tiers.get(rank)].sort((a, b) => a.poolLabel.localeCompare(b.poolLabel));
      if (tierIndex % 2 === 1) teamsInTier.reverse();
      seeded.push(...teamsInTier);
    });
    return seeded.map((team, i) => ({ ...team, seed: i + 1 }));
  }
}

export class RatingSeedingStrategy extends SeedingStrategy {
  // context.ratings: Map<participantId, number> — pre-fetched by the
  // caller (see this file's header comment for why the fetch can't happen
  // here). Highest rating gets seed 1. Falls back to Standard Cross-Pool
  // WHOLESALE only when none of the qualified participants have a rating
  // on file at all ("if no rating exists, gracefully fall back") — a
  // participant missing a rating while others have one instead just
  // defaults that one participant's rating to DEFAULT_INITIAL_RATING,
  // rather than failing the whole strategy over one gap.
  generateSeeds(qualifiedTeams, context = {}) {
    const ratings = context.ratings || new Map();
    const anyRatingKnown = qualifiedTeams.some((t) => ratings.has(t.participantId));
    if (!anyRatingKnown) {
      return standardCrossPoolSeeding(qualifiedTeams);
    }
    const sorted = [...qualifiedTeams].sort(
      (a, b) => (ratings.get(b.participantId) ?? DEFAULT_INITIAL_RATING) - (ratings.get(a.participantId) ?? DEFAULT_INITIAL_RATING)
    );
    return sorted.map((team, i) => ({ ...team, seed: i + 1 }));
  }
}

export class ManualSeedingStrategy extends SeedingStrategy {
  // context.manualSeeds: { [participantId]: seedNumber } — organizer
  // assignments captured by the Seeding page (tournament.manualSeeds),
  // validated via validateSeeds() below BEFORE this is ever called from
  // the real Generate Bracket action.
  generateSeeds(qualifiedTeams, context = {}) {
    const manualSeeds = context.manualSeeds || {};
    return [...qualifiedTeams]
      .map((team) => ({ ...team, seed: manualSeeds[team.participantId] }))
      .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity));
  }

  // Every rule the spec's Validation section names for Manual mode:
  // missing assignments, duplicate seed numbers (which also covers "more
  // than one participant per seed" — the same check either way), and
  // seed numbers outside the valid 1..N range.
  validateSeeds(qualifiedTeams, context = {}) {
    const manualSeeds = context.manualSeeds || {};
    const errors = [];
    const missing = qualifiedTeams.filter((t) => manualSeeds[t.participantId] == null);
    if (missing.length > 0) {
      errors.push(`Missing seed assignment for: ${missing.map((t) => t.label).join(", ")}.`);
    }
    const assigned = qualifiedTeams.map((t) => manualSeeds[t.participantId]).filter((s) => s != null);
    const duplicates = [...new Set(assigned.filter((s, i) => assigned.indexOf(s) !== i))];
    if (duplicates.length > 0) {
      errors.push(`Duplicate seed number(s): ${duplicates.join(", ")}.`);
    }
    const expected = qualifiedTeams.length;
    if (assigned.some((s) => s < 1 || s > expected)) {
      errors.push(`Seed numbers must be between 1 and ${expected}.`);
    }
    return { valid: errors.length === 0, errors };
  }
}

// The registry — same Strategy-pattern shape PoolAssignment.js/
// getTournamentEngine/RATING_ALGORITHMS already use elsewhere in this app.
// Adding a future strategy (club-protected seeding, regional separation,
// a custom template, a tournament-director plugin, ...) means registering
// one more entry here; PlayoffBracketGenerator never changes.
export const SEEDING_STRATEGIES = {
  standardCrossPool: new StandardCrossPoolSeedingStrategy(),
  random: new RandomSeedingStrategy(),
  snake: new SnakeSeedingStrategy(),
  rating: new RatingSeedingStrategy(),
  manual: new ManualSeedingStrategy(),
};

export function getSeedingStrategy(method) {
  return SEEDING_STRATEGIES[method] || SEEDING_STRATEGIES.standardCrossPool;
}

// qualifiedTeams: QualifiedTeam[] (see PoolQualificationService)
// returns: SeededTeam[] — same shape plus `seed` (1-indexed), ordered by seed
// Backward-compatible function form — unchanged signature, unchanged
// output for the default (standardCrossPool) case; still what
// PlayoffBracketGenerator.seedParticipants calls.
export function assignSeeds(qualifiedTeams, method = "standardCrossPool", context) {
  return getSeedingStrategy(method).generateSeeds(qualifiedTeams, context);
}
