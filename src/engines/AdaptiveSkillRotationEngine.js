import { RotationEngine } from "./RotationEngine.js";
import { BalancedRotationEngine } from "./BalancedRotationEngine.js";
import { shuffle, uid } from "../lib/random.js";

// Winner vs Winner / Loser vs Loser preference bonus — see scoreMatchup
// below. Named/exported (rather than a literal buried in the scoring
// method) so this can be tuned without hunting through the engine, and so
// a future Session Settings control could read/write the same constant.
// Deliberately smaller than BalancedRotationEngine's repeat-opponent
// scoring scale (-100/-50/+20) so repeat-opponent avoidance always wins
// when the two preferences conflict.
export const WINNER_MATCH_BONUS = 30;

// Adaptive Skill Rotation — see PROJECT.md/FEATURES.md. Beginners only ever
// play Beginners, Intermediates only ever play Intermediates — this engine
// never builds a mixed-skill team. Do NOT replace or duplicate the existing
// fairness engine: TEAM formation (who partners with whom) is always
// BalancedRotationEngine's own partner-recency logic, reused unmodified via
// its public buildTeams — so partners keep rotating every match, exactly as
// before this class existed, and nothing here ever creates a fixed pairing.
//
// Winner vs Winner / Loser vs Loser (see below) only ever affects which two
// ALREADY-FORMED teams face off, not who's on a team together.
//
// Promotion/relegation are NOT decided here. This engine only ever reads
// each player's CURRENT players[id].skill — whatever
// PickleballOpenPlay.jsx's endMatch (automatic promotion/relegation) or
// changePlayerSkill (manual override) last set it to. That's what makes
// "promotion/relegation only affects future matchmaking" true for free: by
// the time this engine runs again (the next save()), the skill change has
// already happened and this just naturally divides the pool along the new
// line.
export class AdaptiveSkillRotationEngine extends RotationEngine {
  constructor() {
    super();
    this.divisionEngine = new BalancedRotationEngine();
  }

  generateMatchups(context) {
    const { waitingIds, players, existingMatchups } = context;
    const reserved = new Set((existingMatchups || []).flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = waitingIds.filter((id) => !reserved.has(id) && players[id]);

    const beginnerIds = pool.filter((id) => players[id]?.skill !== "intermediate");
    const intermediateIds = pool.filter((id) => players[id]?.skill === "intermediate");

    return [
      ...this.generateDivisionMatchups(beginnerIds, players),
      ...this.generateDivisionMatchups(intermediateIds, players),
    ];
  }

  // One division (Beginner or Intermediate) at a time. `true` for
  // allowSameSkillFallback mirrors this class's original behavior — the
  // pool handed in is already single-skill (one division), so
  // BalancedRotationEngine's own mixed-pairing loop never finds a partner
  // in the OTHER skill bucket and always needs its same-skill leftover path
  // (pairLeftovers) to pair anyone at all. Nothing about that changes here.
  generateDivisionMatchups(pool, players) {
    const teams = this.divisionEngine.buildTeams(pool, players, true);
    const rawMatchups = this.buildMatchupsFromTeams(teams, players);
    return rawMatchups.map(({ teamA, teamB }) => ({ id: uid(), teamA, teamB }));
  }

  // Winner vs Winner / Loser vs Loser — a PREFERENCE layered on top of
  // BalancedRotationEngine's own opponent-recency scoring (reused via its
  // public scoreOpponents, not duplicated), never a hard requirement. It's
  // a scoring bonus, not a filter: whenever there aren't enough
  // same-last-result players available to pair up, the bonus just doesn't
  // apply to any candidate pairing and the existing
  // fairness/opponent-avoidance scoring alone decides who faces whom —
  // there's no separate "fall back to the plain engine" code path to
  // maintain, because a soft-scored preference that can't be satisfied
  // simply contributes nothing to any candidate's score. bestOfAttempts
  // still always returns the best-available FULL set of matchups from
  // whatever pool it's given, exactly like BalancedRotationEngine itself —
  // that's what guarantees a court is never left empty because of this
  // preference.
  buildMatchupsFromTeams(teams, players) {
    return this.bestOfAttempts(
      () => this.buildMatchupsOnce(teams, players),
      (result) => result.reduce((sum, { teamA, teamB }) => sum + this.scoreMatchup(teamA, teamB, players), 0)
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
          const score = this.scoreMatchup(pool[i], pool[j], players);
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
    // an odd team out simply stays unpaired — its players remain available
    // for the next refresh, same "don't force a worse match just to avoid
    // a sit-out" precedent BalancedRotationEngine's own buildMatchupsFromTeams
    // follows for an odd number of teams
    return matchups;
  }

  // Priority order:
  // 1. Avoid repeat opponents
  // 2. Prefer Winner vs Winner / Loser vs Loser
  // 3. Remaining fairness heuristics
  //
  // In practice this is BalancedRotationEngine's own repeat-opponent-
  // avoidance scoring (-100/-50/+20, reused as-is, never duplicated),
  // plus a same-last-result bonus (see WINNER_MATCH_BONUS above) per
  // cross-team player pair: applied when both players are coming off the
  // same result (both won, or both lost, their last completed match); 0
  // when either has no result yet (e.g. their first match this session)
  // or the two differ. WINNER_MATCH_BONUS is deliberately smaller than the
  // repeat-opponent scale, so priority 1 always outranks priority 2 when
  // they conflict; "remaining fairness heuristics" (priority 3 — waiting
  // time, games played, teammate avoidance) all live one level up, in the
  // team-formation step (buildTeams/scorePartner), completely untouched by
  // this method.
  scoreMatchup(teamX, teamY, players) {
    let score = this.divisionEngine.scoreOpponents(teamX, teamY, players);
    for (const x of teamX) {
      const px = players[x];
      for (const y of teamY) {
        const py = players[y];
        if (px?.lastResult && py?.lastResult && px.lastResult === py.lastResult) {
          score += WINNER_MATCH_BONUS;
        }
      }
    }
    return score;
  }

  // runs `attemptFn` several times and returns whichever result scores
  // highest under `scoreFn` — same randomized-restart hedge every other
  // engine in this app uses (BalancedRotationEngine/TransitionRotationEngine/
  // CompetitiveRotationEngine), against greedy tie-breaking locking in a
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
