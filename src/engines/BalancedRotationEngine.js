import { RotationEngine } from "./RotationEngine.js";
import { shuffle, uid } from "../lib/random.js";

// Balanced Beginner+Intermediate rotation strategy.
//
// Priority order (highest first):
//   1. Every team is 1 beginner + 1 intermediate (same-skill teams are a
//      last resort, only used for leftover players when the beginner and
//      intermediate counts in the pool are unequal and no mixed pairing is
//      possible).
//   2. Avoid repeating a player's most recent partner.
//   3. Avoid repeating a team's most recent opponents.
//   4. Everything else being equal, prefer players who've partnered less
//      often / waited longer (fewest games), and spread intermediates
//      across different beginners over time.
//
// This is a greedy, not globally-optimal, algorithm: at each step it picks
// the single highest-scoring pairing and commits to it. For open-play group
// sizes (a few dozen players) this produces good, stable results without
// the complexity of a true maximum-weight matching (Hungarian/blossom
// algorithm) — see PROJECT.md if that ever needs revisiting at larger scale.
export class BalancedRotationEngine extends RotationEngine {
  // `allowSameSkillFallback` gates the last-resort same-skill pairing
  // described above. Guaranteed Upcoming Match Queue — see PROJECT.md/
  // FEATURES.md: both callers in lib/utils.js (refreshNextMatchups and
  // regenerateNextMatchups) now pass true, so the queue never sits empty
  // just because the waiting pool isn't an even beginner/intermediate mix.
  // Skill balancing is a preference, not a blocker. The fallback only ever
  // pairs players a balanced pairing couldn't use (see buildTeamsOnce
  // below) and still scores those pairings by the same partner-recency
  // rules as everything else (see pairLeftovers/scorePartner) — it's a
  // relaxed constraint, not a random assignment.
  generateMatchups({ waitingIds, players, existingMatchups }, allowSameSkillFallback = false) {
    const reserved = new Set(existingMatchups.flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = waitingIds.filter((id) => !reserved.has(id) && players[id]);

    const teams = this.buildTeams(pool, players, allowSameSkillFallback);
    const rawMatchups = this.buildMatchupsFromTeams(teams, players);

    return rawMatchups.map(({ teamA, teamB }) => ({ id: uid(), teamA, teamB }));
  }

  // Priority 1 + 2: pair beginners with intermediates by recency score.
  // A single greedy pass can paint itself into a corner — e.g. with 2
  // beginners and 2 intermediates where only one of the 4 possible pairings
  // is "bad" (recent partners), a naive greedy can still end up forced into
  // that bad pairing depending on which tied-best pair it happens to try
  // first, since committing early doesn't look ahead at what it leaves
  // behind. To avoid that, this runs several randomized attempts and keeps
  // whichever produced the best total score — cheap and reliable at the
  // player counts open play sessions actually have, without needing a true
  // maximum-weight matching algorithm.
  // Partner Requests — see PROJECT.md/FEATURES.md. A reusable matchmaking
  // OPTION, not a separate rotation mode or engine: any player with a
  // mutually-set `partnerId` (see setFixedPartner/clearFixedPartner,
  // lib/queueManagement.js — an organizer action, set/cleared per pair at
  // any point during the session) is force-paired with that partner as one
  // team BEFORE the normal beginner/intermediate greedy matching ever runs
  // — see extractFixedPartnerTeams below. This is unconditional: a request
  // takes effect the moment it's set, for exactly that one pair, with no
  // separate session-wide setting to enable first — a player without a
  // requested partner is completely unaffected and rotates exactly as
  // before. Everything downstream is completely untouched: the fixed team
  // still goes through the exact same opponent-selection scoring
  // (scoreOpponents/buildMatchupsFromTeams) as any other team, so opponent
  // rotation/diversity keeps working normally, and (composed via
  // AdaptiveSkillRotationEngine.divisionEngine) the games-played fairness
  // tuple and Winner-vs-Winner bonus both still apply to the resulting
  // matchup exactly as they would to any other one — only which two
  // players end up on the same team changed, never how matchups are
  // scored or ranked afterward.
  buildTeams(pool, players, allowSameSkillFallback) {
    const { teams: fixedTeams, remaining: workingPool } = this.extractFixedPartnerTeams(pool, players);

    const beginnerIds = workingPool.filter((id) => players[id]?.skill === "beginner");
    const intermediateIds = workingPool.filter((id) => players[id]?.skill === "intermediate");

    const builtTeams = this.bestOfAttempts(
      () => this.buildTeamsOnce(beginnerIds, intermediateIds, players, allowSameSkillFallback),
      (teams) => teams.reduce((sum, [a, b]) => sum + this.scorePartner(a, b, players), 0)
    );

    return [...fixedTeams, ...builtTeams];
  }

  // Pulls out every mutually-agreeing fixed-partner pair present in `pool`
  // as its own team, leaving everyone else (including a player whose fixed
  // partner isn't currently waiting) in `remaining` to go through the
  // normal algorithm unchanged. "Mutually-agreeing" — both A.partnerId===B
  // AND B.partnerId===A — guards against a stale one-sided link (e.g. a
  // player's old partner already re-paired with someone else) silently
  // force-pairing the wrong two people.
  extractFixedPartnerTeams(pool, players) {
    const poolSet = new Set(pool);
    const used = new Set();
    const teams = [];
    for (const id of pool) {
      if (used.has(id)) continue;
      const partnerId = players[id]?.partnerId;
      if (!partnerId || used.has(partnerId) || !poolSet.has(partnerId)) continue;
      if (players[partnerId]?.partnerId !== id) continue; // one-sided/stale link — not a real mutual pair
      teams.push([id, partnerId]);
      used.add(id);
      used.add(partnerId);
    }
    const remaining = pool.filter((id) => !used.has(id));
    return { teams, remaining };
  }

  buildTeamsOnce(beginnerIds, intermediateIds, players, allowSameSkillFallback) {
    const beginners = shuffle(beginnerIds);
    const intermediates = shuffle(intermediateIds);

    const teams = [];
    const usedB = new Set();
    const usedI = new Set();

    while (usedB.size < beginners.length && usedI.size < intermediates.length) {
      let best = null;
      for (const b of beginners) {
        if (usedB.has(b)) continue;
        for (const i of intermediates) {
          if (usedI.has(i)) continue;
          const score = this.scorePartner(b, i, players);
          if (!best || score > best.score) best = { b, i, score };
        }
      }
      if (!best) break;
      teams.push([best.b, best.i]);
      usedB.add(best.b);
      usedI.add(best.i);
    }

    if (allowSameSkillFallback) {
      const leftoverBeginners = beginners.filter((id) => !usedB.has(id));
      const leftoverIntermediates = intermediates.filter((id) => !usedI.has(id));
      teams.push(...this.pairLeftovers(leftoverBeginners, players));
      teams.push(...this.pairLeftovers(leftoverIntermediates, players));
    }

    return teams;
  }

  // runs `attemptFn` several times and returns whichever result scores
  // highest under `scoreFn` — a cheap randomized-restart hedge against
  // greedy tie-breaking locking in a worse-than-necessary outcome
  bestOfAttempts(attemptFn, scoreFn, attempts = 15) {
    let best = attemptFn();
    let bestScore = scoreFn(best);
    for (let i = 1; i < attempts; i++) {
      const candidate = attemptFn();
      const score = scoreFn(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  // last-resort same-skill pairing for whichever skill has more waiting
  // players than the other — still scored by partner recency
  pairLeftovers(ids, players) {
    const pool = shuffle(ids);
    const pairs = [];
    while (pool.length >= 2) {
      const a = pool.shift();
      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let j = 0; j < pool.length; j++) {
        const score = this.scorePartner(a, pool[j], players);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = j;
        }
      }
      const b = pool.splice(bestIndex, 1)[0];
      pairs.push([a, b]);
    }
    return pairs;
  }

  // +100 never partnered before
  // -100 partnered last round
  // -75  partnered within the last 2 rounds
  // -50  partnered many times (3+)
  // +50  partnered before, but not recently and not often
  scorePartner(aId, bId, players) {
    const a = players[aId];
    const count = a?.partnerCounts?.[bId] || 0;
    const recent = a?.recentPartnerIds || [];
    if (count === 0) return 100;
    if (recent[0] === bId) return -100;
    if (recent.slice(0, 2).includes(bId)) return -75;
    if (count >= 3) return -50;
    return 50;
  }

  // Priority 3: pick pairs of teams to face off by opponent-recency score,
  // repeatedly, until fewer than 2 teams remain. An odd team out (e.g. 3
  // teams available) simply isn't matched this round — it stays available
  // for the next call once a 4th team's worth of players checks in or
  // finishes a match. Same randomized-restart hedge as buildTeams, for the
  // same reason (greedy tie-breaking can otherwise force a worse pairing
  // than necessary).
  //
  // Priority 1 still wins over Priority 3 here: if the team count is odd,
  // the one sitting out should preferentially be a same-skill fallback team
  // rather than a properly mixed one — otherwise a fresh session (no
  // opponent history to tell teams apart) could arbitrarily bench a good
  // mixed team while still deploying a worse same-skill one.
  buildMatchupsFromTeams(teams, players) {
    // the held-back same-skill team (if any) simply goes back to being
    // unpaired waiting players rather than being force-matched, or forcing
    // a mixed team to sit out in its place
    let usable = teams;
    if (teams.length % 2 === 1) {
      const sameSkillIndex = teams.findIndex(([a, b]) => players[a]?.skill === players[b]?.skill);
      if (sameSkillIndex !== -1) {
        usable = teams.filter((_, i) => i !== sameSkillIndex);
      }
    }

    return this.bestOfAttempts(
      () => this.buildMatchupsOnce(usable, players),
      (result) => result.reduce((sum, { teamA, teamB }) => sum + this.scoreOpponents(teamA, teamB, players), 0)
    );
  }

  buildMatchupsOnce(teams, players) {
    const pool = shuffle(teams);
    const matchups = [];
    while (pool.length >= 2) {
      let bestI = 0;
      let bestJ = 1;
      let bestScore = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const score = this.scoreOpponents(pool[i], pool[j], players);
          if (score > bestScore) {
            bestScore = score;
            bestI = i;
            bestJ = j;
          }
        }
      }
      const teamA = pool[bestI];
      const teamB = pool[bestJ];
      pool.splice(bestJ, 1);
      pool.splice(bestI, 1);
      matchups.push({ teamA, teamB });
    }
    return matchups;
  }

  // -100 same opponent as last round, -50 opponent within the last 2
  // rounds, +20 never played this opponent before — summed across all 4
  // cross-team player pairs
  scoreOpponents(teamX, teamY, players) {
    let score = 0;
    for (const x of teamX) {
      const px = players[x];
      for (const y of teamY) {
        if (px?.lastOpponentIds?.includes(y)) {
          score -= 100;
        } else if (px?.recentOpponentIds?.includes(y)) {
          score -= 50;
        } else if (!px?.opponentCounts?.[y]) {
          score += 20;
        }
      }
    }
    return score;
  }

  // Total fairness score for one fully-formed matchup (both teams already
  // decided) — the complete number this class computes internally, in
  // pieces, while deciding which teams to form (scorePartner) and which
  // teams to pit against each other (scoreOpponents), but never previously
  // surfaced as a single value. Exposed as its own method — rather than
  // left as an anonymous `reduce` inside buildTeamsOnce/buildMatchupsFromTeams
  // — specifically so Adaptive Skill Rotation can reuse it (see
  // AdaptiveSkillRotationEngine.scoreFullMatchup) to compare candidate
  // matchups ACROSS its two divisions without reimplementing any of this
  // scoring. Composes scorePartner/scoreOpponents as-is; this method adds
  // no new scoring logic of its own.
  scoreFullMatchup(teamA, teamB, players) {
    return (
      this.scorePartner(teamA[0], teamA[1], players) +
      this.scorePartner(teamB[0], teamB[1], players) +
      this.scoreOpponents(teamA, teamB, players)
    );
  }
}
