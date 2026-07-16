import { RotationEngine } from "./RotationEngine.js";
import { shuffle, uid } from "../lib/random.js";
import { calculatePerformanceRating } from "../lib/performanceRating.js";

// Progressive Skill Rotation's Competitive-phase pairing.
//
// Unlike Mentorship (BalancedRotationEngine, beginner+intermediate teams
// mandatory) and Transition (TransitionRotationEngine, beginner+intermediate
// a soft bonus), Competitive ignores the original skill labels entirely and
// pairs primarily by current session Performance Rating (see
// lib/performanceRating.js), while still avoiding repeated partners and
// opponents:
//
//   Team formation (who partners with whom):
//     Primarily by rating closeness — the smaller the gap between two
//     players' Performance Rating, the better the partner score, so players
//     end up tiered with others playing at a similar level right now.
//     Weighted roughly 2x a full partner-recency swing so it's the dominant
//     factor, but a genuine repeat-partner penalty can still outweigh a
//     small rating gap, keeping "continuing to minimize repeated partners"
//     meaningful rather than symbolic. Players with no completed games yet
//     (rating === null) are treated as a neutral 50, same as Transition.
//
//   Matchup formation (which two teams face off):
//     Avoid repeating opponents (same recency scoring every other engine in
//     this app uses). No separate rating-balancing pass here, unlike
//     Transition — teams are already rating-tiered from the partner stage,
//     so opposing teams drawn from the same tier are naturally comparable.
//
// Same randomized-restart hedge as BalancedRotationEngine/
// TransitionRotationEngine (bestOfAttempts) against greedy tie-breaking
// locking in a worse-than-necessary result.
export class CompetitiveRotationEngine extends RotationEngine {
  generateMatchups({ waitingIds, players, existingMatchups }) {
    const reserved = new Set(existingMatchups.flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = waitingIds.filter((id) => !reserved.has(id) && players[id]);

    const teams = this.buildTeams(pool, players);
    const rawMatchups = this.buildMatchupsFromTeams(teams, players);

    return rawMatchups.map(({ teamA, teamB }) => ({ id: uid(), teamA, teamB }));
  }

  buildTeams(pool, players) {
    return this.bestOfAttempts(
      () => this.buildTeamsOnce(pool, players),
      (teams) => teams.reduce((sum, [a, b]) => sum + this.scoreTeam(a, b, players), 0)
    );
  }

  buildTeamsOnce(pool, players) {
    const remaining = shuffle(pool);
    const teams = [];
    while (remaining.length >= 2) {
      const a = remaining.shift();
      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let j = 0; j < remaining.length; j++) {
        const score = this.scoreTeam(a, remaining[j], players);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = j;
        }
      }
      const b = remaining.splice(bestIndex, 1)[0];
      teams.push([a, b]);
    }
    return teams;
  }

  // rating closeness (0-200, closer = higher, weighted 2x) is the primary
  // driver; partner-recency (-100 to +100, same scale as every other engine
  // in this app) still contributes so a genuine repeat-partner penalty can
  // outweigh a small rating gap. Skill labels (beginner/intermediate) are
  // deliberately ignored here.
  scoreTeam(aId, bId, players) {
    const ratingA = this.rating(aId, players);
    const ratingB = this.rating(bId, players);
    const ratingCloseness = (100 - Math.abs(ratingA - ratingB)) * 2;

    const a = players[aId];
    const count = a?.partnerCounts?.[bId] || 0;
    const recent = a?.recentPartnerIds || [];
    let recencyScore;
    if (count === 0) recencyScore = 100;
    else if (recent[0] === bId) recencyScore = -100;
    else if (recent.slice(0, 2).includes(bId)) recencyScore = -75;
    else if (count >= 3) recencyScore = -50;
    else recencyScore = 50;

    return ratingCloseness + recencyScore;
  }

  buildMatchupsFromTeams(teams, players) {
    return this.bestOfAttempts(
      () => this.buildMatchupsOnce(teams, players),
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
  // rounds, +20 never played this opponent before -- identical to
  // BalancedRotationEngine/TransitionRotationEngine
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

  // a player's current session Performance Rating, treating "no completed
  // games yet" (rating === null) as a neutral 50 -- a newcomer shouldn't be
  // scored as weak (or strong) before they've played
  rating(id, players) {
    const rating = calculatePerformanceRating(players[id] || {}).rating;
    return rating === null ? 50 : rating;
  }

  // runs `attemptFn` several times and returns whichever result scores
  // highest under `scoreFn` -- same randomized-restart hedge every other
  // engine in this app uses, against greedy tie-breaking locking in a
  // worse-than-necessary outcome
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
}
