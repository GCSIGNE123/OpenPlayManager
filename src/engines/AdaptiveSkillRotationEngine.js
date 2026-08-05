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

// Cross-division fairness redesign — see PROJECT.md/FEATURES.md. Adaptive
// Skill Rotation used to build each division's matchups independently and
// simply concatenate Beginner-then-Intermediate before Smart Queue
// Management's queue-depth cap sliced the result — meaning Intermediate
// matchups were silently truncated away entirely whenever the Beginner
// division alone could fill the cap, every single round, with no fairness
// signal ever weighing in (confirmed by simulation: total starvation of
// the smaller division, even at an even 16/16 split). The fix: score every
// candidate matchup from BOTH divisions on one shared scale, merge, sort,
// and only THEN let the existing cap slice the top N — see generateMatchups
// below.
//
// Games-played imbalance redesign — see PROJECT.md/FEATURES.md. The
// original fix above (a single flat additive score: partner + opponent +
// winner + a small waiting/games bonus) stopped total division starvation,
// but real Open Play sessions still showed players who checked in
// simultaneously drifting to large games-played gaps (e.g. 8 vs 2). Root
// cause, confirmed by simulation: team FORMATION (BalancedRotationEngine's
// own buildTeams/scorePartner) has zero awareness of games played — it only
// ever considers partner recency — and the small additive games/wait bonus
// this class layered on top was numerically swamped by scorePartner/
// scoreOpponents's much larger range (roughly -400 to +200) every round,
// so a modest partner/opponent advantage could reliably outvote a real
// games-played disadvantage. Increasing the bonus weight only plateaued
// (a tuning sweep 0-10 showed diminishing/reversing returns past ~4-5) —
// this was a ranking-algorithm problem, not a weight problem.
//
// Fix: generateMatchups below now ranks candidates by an explicit,
// lexicographic (tiered) tuple instead of one blended number:
//   1. Lowest average games played across the matchup's 4 players
//   2. Lowest maximum games played among those 4 (guards against an
//      already-over-served player "riding along" with a needy partner —
//      a matchup only wins tier 1 on AVERAGE if even its most-played
//      member isn't the outlier propping that average up)
//   3. Existing matchup quality score — partner diversity + opponent
//      diversity + Winner-vs-Winner (qualityScoreFor below) — completely
//      unchanged inputs, just no longer summed with games/wait
//   4. Waiting bonus (waitingBonusFor below) as the final tiebreak
// A simulation comparison (12 Beginner/10 Intermediate, 3 courts, 20-40
// seeded trials per option, ~3h and ~15h session lengths) validated this
// against a flat "lowest MINIMUM games" ranking and against the original
// flat additive formula before this was adopted — see TESTING.md for the
// full comparison tables. Team formation, partner/opponent scoring, and
// Winner-vs-Winner are completely untouched by this — only the PRIORITY
// ORDER candidates are considered in changes.
//
// WAIT_BONUS_WEIGHT — points per minute a matchup's 4 players are waiting
// above/below the CURRENT overall waiting-pool average (see
// waitingBonusFor). Relative to the pool average (not an absolute
// constant) so it self-scales as a session runs longer. Now used only as
// tier 4 (the final tiebreak among candidates already tied on games
// played and quality) rather than blended additively with everything
// else.
export const WAIT_BONUS_WEIGHT = 2;

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

  // Each division still generates its own candidate matchups completely
  // independently, exactly as before (generateDivisionMatchups is
  // unchanged) — Beginners only ever pair with Beginners, Intermediates
  // only ever with Intermediates. What changes is what happens to the two
  // resulting lists: instead of concatenating them (Beginner-first) and
  // letting the caller's queue-depth cap truncate whatever's left over,
  // every candidate matchup from BOTH divisions is ranked on one shared,
  // lexicographic (tiered) scale and merged into a single list, best-first
  // — see the games-played imbalance redesign comment above for the tuple.
  // The cap itself still lives entirely in the caller (refreshNextMatchups's
  // `.slice(0, room)`, lib/utils.js) — unchanged — it now just slices the
  // top of this ranked list instead of a division-ordered or single-score
  // one.
  generateMatchups(context) {
    const { waitingIds, players, existingMatchups } = context;
    const reserved = new Set((existingMatchups || []).flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = waitingIds.filter((id) => !reserved.has(id) && players[id]);

    const beginnerIds = pool.filter((id) => players[id]?.skill !== "intermediate");
    const intermediateIds = pool.filter((id) => players[id]?.skill === "intermediate");

    const beginnerMatchups = this.generateDivisionMatchups(beginnerIds, players);
    const intermediateMatchups = this.generateDivisionMatchups(intermediateIds, players);

    // pool-wide baseline computed once per call, reused for every
    // candidate's tier-4 waiting tiebreak — see waitingBonusFor below
    const overallAvgWaitMinutes = this.avgWaitMinutes(pool, players);

    const ranked = [...beginnerMatchups, ...intermediateMatchups].map((m) => {
      const ids = [...m.teamA, ...m.teamB];
      return {
        m,
        avgGames: this.avgGames(ids, players),
        maxGames: this.maxGames(ids, players),
        quality: this.qualityScoreFor(m, players),
        waitBonus: this.waitingBonusFor(ids, players, overallAvgWaitMinutes),
      };
    });

    // shuffle before the sort so an exact tie on every tier doesn't
    // systematically favor whichever division happened to be concatenated
    // first (Array.prototype.sort is not guaranteed stable across all
    // engines/inputs for this purpose, and even where it is, "always
    // Beginner on a tie" is exactly the bias this redesign exists to
    // remove)
    shuffle(ranked);
    ranked.sort(
      (a, b) =>
        a.avgGames - b.avgGames || // 1. lowest average games played
        a.maxGames - b.maxGames || // 2. lowest max games played (guards against an over-served rider)
        b.quality - a.quality || // 3. existing matchup quality (partner + opponent + Winner-vs-Winner)
        b.waitBonus - a.waitBonus // 4. waiting bonus, final tiebreak
    );

    return ranked.map(({ m }) => m);
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
    return this.divisionEngine.scoreOpponents(teamX, teamY, players) + this.winnerBonusFor(teamX, teamY, players);
  }

  // Winner vs Winner / Loser vs Loser bonus, extracted out of scoreMatchup
  // above into its own named method — same math, same result, just given
  // a name so it can be reused by qualityScoreFor below without
  // duplicating this loop. scoreMatchup's own behavior (and therefore
  // Winner-vs-Winner pairing itself) is completely unchanged by this
  // extraction.
  winnerBonusFor(teamX, teamY, players) {
    let bonus = 0;
    for (const x of teamX) {
      const px = players[x];
      for (const y of teamY) {
        const py = players[y];
        if (px?.lastResult && py?.lastResult && px.lastResult === py.lastResult) {
          bonus += WINNER_MATCH_BONUS;
        }
      }
    }
    return bonus;
  }

  // Average minutes waited across a set of player ids, right now. Reuses
  // the exact same fields/fallback WaitingTimer.jsx already displays with
  // (lastMatchEndAt once a player has played, else checkedInAt) — no new
  // player field, no new persisted state.
  avgWaitMinutes(ids, players) {
    if (ids.length === 0) return 0;
    const now = Date.now();
    const total = ids.reduce((sum, id) => {
      const since = players[id]?.lastMatchEndAt || players[id]?.checkedInAt || now;
      return sum + (now - since) / 60000;
    }, 0);
    return total / ids.length;
  }

  // Average games played across a set of player ids — tier 1 of the
  // ranking tuple in generateMatchups above.
  avgGames(ids, players) {
    if (ids.length === 0) return 0;
    return ids.reduce((sum, id) => sum + (players[id]?.games || 0), 0) / ids.length;
  }

  // Max games played across a set of player ids — tier 2 of the ranking
  // tuple. Prevents a matchup from winning tier 1 purely on a low AVERAGE
  // that's actually propped up by pairing one very-underplayed player with
  // one already-heavily-played "rider" — a matchup only wins tier 2 too if
  // even its most-played member isn't an outlier.
  maxGames(ids, players) {
    if (ids.length === 0) return 0;
    return Math.max(...ids.map((id) => players[id]?.games || 0));
  }

  // Player-based waiting bonus — deliberately computed from the 4 players
  // actually IN this candidate matchup, not a division-wide average, so a
  // long-waiting player rises in priority even against same-division peers
  // who just played, and a division that's been structurally excluded
  // keeps climbing every round its players don't get a fresh
  // lastMatchEndAt, until it outweighs the plain scorePartner/
  // scoreOpponents gap that was starving it (see WAIT_BONUS_WEIGHT above).
  waitingBonusFor(matchupPlayerIds, players, overallAvgWaitMinutes) {
    return WAIT_BONUS_WEIGHT * (this.avgWaitMinutes(matchupPlayerIds, players) - overallAvgWaitMinutes);
  }

  // Tier 3 of the ranking tuple — "existing matchup quality": composes
  // BalancedRotationEngine's own scoreFullMatchup (scorePartner x2 +
  // scoreOpponents, i.e. partner diversity + opponent diversity) with this
  // class's own winnerBonusFor (Winner-vs-Winner). No scoring logic is
  // reimplemented here; this only sums pieces that already exist
  // elsewhere. Deliberately excludes games/waiting — those are tiers 1/2/4
  // of the tuple in generateMatchups, not blended into this number.
  qualityScoreFor(matchup, players) {
    return (
      this.divisionEngine.scoreFullMatchup(matchup.teamA, matchup.teamB, players) +
      this.winnerBonusFor(matchup.teamA, matchup.teamB, players)
    );
  }

  // Development-only helper — NEVER called from generateMatchups or any
  // production code path; exists purely so a dev-only script/tool can
  // print a per-matchup ranking breakdown (Avg Games/Max Games/Quality/
  // Waiting) for inspecting WAIT_BONUS_WEIGHT or the tuple's behavior
  // against a real or simulated session. Read-only decomposition of the
  // same numbers generateMatchups' ranking already uses — does not affect
  // matchmaking.
  scoreBreakdownFor(matchup, players, { overallAvgWaitMinutes }) {
    const ids = [...matchup.teamA, ...matchup.teamB];
    const partnerScore =
      this.divisionEngine.scorePartner(matchup.teamA[0], matchup.teamA[1], players) +
      this.divisionEngine.scorePartner(matchup.teamB[0], matchup.teamB[1], players);
    const opponentScore = this.divisionEngine.scoreOpponents(matchup.teamA, matchup.teamB, players);
    const winnerBonus = this.winnerBonusFor(matchup.teamA, matchup.teamB, players);
    return {
      avgGamesInMatchup: this.avgGames(ids, players),
      maxGamesInMatchup: this.maxGames(ids, players),
      partnerScore,
      opponentScore,
      winnerBonus,
      qualityScore: partnerScore + opponentScore + winnerBonus,
      waitingBonus: this.waitingBonusFor(ids, players, overallAvgWaitMinutes),
    };
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
