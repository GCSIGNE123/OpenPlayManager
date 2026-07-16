import { RotationEngine } from "./RotationEngine.js";
import { shuffle, uid } from "../lib/random.js";
import { calculatePerformanceRating } from "../lib/performanceRating.js";

// Progressive Skill Rotation's Transition-phase pairing.
//
// Unlike Mentorship (BalancedRotationEngine, where beginner+intermediate
// teams are mandatory), Transition treats skill-mixing as a soft
// preference and introduces Performance Rating (see lib/performanceRating.js)
// as a pairing factor, on top of the partner/opponent-avoidance this app
// always applies:
//
//   Team formation (who partners with whom):
//     1. Avoid repeating a player's most recent partner (same recency
//        scoring BalancedRotationEngine uses).
//     2. Prefer a beginner+intermediate team when practical — a bonus, not
//        a requirement, so a same-skill pairing is never blocked just
//        because it's the best available partner for recency reasons.
//
//   Matchup formation (which two teams face off):
//     1. Avoid repeating opponents (same recency scoring as Mentorship).
//     2. Balance match quality: minimize the gap between the two teams'
//        composite Performance Rating, so a hot team doesn't run over a
//        cold one. Players with no completed games yet (rating === null)
//        are treated as a neutral 50 so newcomers don't skew this before
//        they have any data.
//
// Same randomized-restart hedge as BalancedRotationEngine (bestOfAttempts)
// against greedy tie-breaking locking in a worse-than-necessary result.
export class TransitionRotationEngine extends RotationEngine {
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

  // +100 never partnered before, -100 partnered last round, -75 partnered
  // within the last 2 rounds, -50 partnered often, +50 partnered before but
  // not recently/often -- identical scale to BalancedRotationEngine, plus a
  // +30 soft bonus for a beginner+intermediate pairing (never a requirement)
  scoreTeam(aId, bId, players) {
    const a = players[aId];
    const count = a?.partnerCounts?.[bId] || 0;
    const recent = a?.recentPartnerIds || [];
    let score;
    if (count === 0) score = 100;
    else if (recent[0] === bId) score = -100;
    else if (recent.slice(0, 2).includes(bId)) score = -75;
    else if (count >= 3) score = -50;
    else score = 50;

    const skillA = a?.skill;
    const skillB = players[bId]?.skill;
    if (skillA && skillB && skillA !== skillB) score += 30;

    return score;
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

  // opponent-recency scoring identical to BalancedRotationEngine, minus a
  // penalty proportional to the gap between the two teams' composite
  // Performance Rating -- the closer the match quality, the smaller the
  // penalty
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

    const ratingGap = Math.abs(this.compositeRating(teamX, players) - this.compositeRating(teamY, players));
    score -= ratingGap;

    return score;
  }

  // average Performance Rating across a team, treating players with no
  // completed games yet (rating === null) as a neutral 50 rather than 0 --
  // a newcomer shouldn't be scored as "weak" before they've played
  compositeRating(team, players) {
    const ratings = team.map((id) => {
      const rating = calculatePerformanceRating(players[id] || {}).rating;
      return rating === null ? 50 : rating;
    });
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  }

  // runs `attemptFn` several times and returns whichever result scores
  // highest under `scoreFn` -- same randomized-restart hedge
  // BalancedRotationEngine uses, against greedy tie-breaking locking in a
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
