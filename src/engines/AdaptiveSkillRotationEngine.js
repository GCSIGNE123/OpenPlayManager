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

// LEGACY — kept only for scoreBreakdownFor/waitingBonusFor, the dev-only
// inspection helpers scripts/simulate-adaptive-fairness.mjs prints (never
// called from generateMatchups or any production path — see the Fairness
// Selection Redesign comment below for what actually decides matchmaking
// now). Points per minute a matchup's 4 players are waiting above/below the
// pool average.
export const WAIT_BONUS_WEIGHT = 2;

// ---------------------------------------------------------------------
// FAIRNESS SELECTION REDESIGN (see PROJECT.md/FEATURES.md — "Fairness
// First, Competition Second"). Real ~28-player Open Play sessions showed
// players who had JUST finished a match getting selected for the next one
// ahead of players who had been waiting far longer — root-caused (see the
// investigation report) to two things:
//   1. generateMatchups ranked candidate matchups by average games-played
//      FIRST, waiting time only as the last tiebreak — so a fresher,
//      lower-games player could always outrank a much-longer-waiting one.
//   2. Team FORMATION itself (BalancedRotationEngine.scorePartner) has
//      zero awareness of waiting time at all, so a long-waiting player
//      could be left out of a division's candidate pool entirely, before
//      any tiebreak ever ran.
//
// Fix — a two-stage pipeline, Stage 1 decides WHO plays, Stage 2 (entirely
// unchanged, reused as-is) decides WHO PARTNERS/FACES WHOM among just those
// players:
//
//   STAGE 1 — SELECTION (selectFairnessGroups below). Builds a single
//   "waiting stack" per division, ordered by:
//     1. Longest effective wait (checkedInAt/lastMatchEndAt), descending
//     2. Fewest games played, ascending
//     3. A stable tertiary tiebreak (earlier of the two timestamps first)
//   Walks the stack front-to-back in groups of 4, protecting the very
//   front of the stack (the single longest-waiting eligible player is
//   NEVER skipped) while allowing a small, explicit BOUNDED LOOKAHEAD
//   (LOOKAHEAD_MAX_UNITS below) to swap in a slightly-further-back player
//   only when needed — see selectQuartetFromWindow's own comment.
//
//   HARD RECENT-PLAY REST GUARD — a player who just finished a match
//   (waited under REST_GUARD_FRESH_MINUTES) must NEVER be selected ahead
//   of an eligible alternative who has waited at least REST_GUARD_GAP_MINUTES
//   longer, as long as such an alternative exists within the bounded
//   lookahead window. This is a hard filter on which candidate quartets
//   Stage 1 will even consider — not a score/weight Stage 2's quality
//   optimization could out-bid. It only relaxes (selects the fresh player
//   anyway) when no guard-compliant quartet exists in the window at all
//   (e.g. a very small division), exactly matching "fairness first,
//   competition second": fairness constraints are relaxed only when there
//   is truly no fair alternative, never for a better skill/quality score.
//
//   STAGE 2 — PAIRING (generateDivisionMatchups below, unchanged). Once
//   Stage 1 hands over a fixed set of exactly 4 players, team formation
//   (BalancedRotationEngine.buildTeams — partner-recency, Partner
//   Requests) and matchup quality (buildMatchupsFromTeams/scoreMatchup —
//   opponent-recency, Winner-vs-Winner) run EXACTLY as they always have,
//   just scoped to that one group of 4 instead of the whole division pool.
//   Nothing in BalancedRotationEngine, scorePartner, scoreOpponents, or the
//   Winner-vs-Winner bonus is modified — Stage 2 simply can no longer reach
//   past the players Stage 1 already fairness-selected to find a better
//   score, which is the whole point: Winner-vs-Winner and partner/opponent
//   diversity remain PAIRING preferences, never a queue-selection priority.
//
// Cross-division fairness redesign (superseded by the above for RANKING —
// see generateMatchups) still applies structurally: Beginners only ever
// play Beginners, Intermediates only ever play Intermediates. Games-played
// imbalance redesign's insight (team formation has no games-awareness) is
// what Stage 1 now directly fixes, rather than working around with a
// bigger additive bonus.
// ---------------------------------------------------------------------

// A player who has waited less than this many minutes since their last
// match (or check-in, if they haven't played yet) counts as "just
// finished" / fresh for the rest guard below.
export const REST_GUARD_FRESH_MINUTES = 5;

// The rest guard triggers when a fresh player (see above) would be
// selected while an eligible alternative, still within the bounded
// lookahead window, has waited at least this many minutes LONGER. Matches
// the investigation's own example (a player who finished 2 minutes ago
// must not be chosen over players waiting 11-14 minutes — an 9-12 minute
// gap, comfortably over this threshold).
export const REST_GUARD_GAP_MINUTES = 8;

// Bounded stack lookahead — see selectQuartetFromWindow. At most this many
// EXTRA waiting units (a unit is one player, or one mutually-fixed-partner
// pair moving together) beyond the front-of-stack unit are ever considered
// when assembling one group of 4. This is a hard cap, not a suggestion:
// Stage 1 never scans deeper into the stack than
// 1 (front) + LOOKAHEAD_MAX_UNITS units looking for a valid combination,
// so the maximum a player can ever be "reached past" is bounded and
// documented, not unlimited search for a "better" matchup.
export const LOOKAHEAD_MAX_UNITS = 6;

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
  // independently — Beginners only ever pair with Beginners, Intermediates
  // only ever with Intermediates (see generateDivisionMatchups, which now
  // runs Stage 1 fairness selection before Stage 2 pairing). What changes
  // is how the two resulting lists are merged: every matchup from BOTH
  // divisions is ranked on one shared scale and merged into a single list,
  // best-first — see the Fairness Selection Redesign comment above for why
  // waiting time is now the PRIMARY ranking key (previously average games
  // played was primary and waiting was only the last tiebreak). The cap
  // itself still lives entirely in the caller (refreshNextMatchups's
  // `.slice(0, room)`, lib/utils.js) — unchanged — it now just slices the
  // top of this ranked list instead of a division-ordered or
  // games-first-ranked one.
  generateMatchups(context) {
    const { waitingIds, players, existingMatchups } = context;
    const reserved = new Set((existingMatchups || []).flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = waitingIds.filter((id) => !reserved.has(id) && players[id]);

    const beginnerIds = pool.filter((id) => players[id]?.skill !== "intermediate");
    const intermediateIds = pool.filter((id) => players[id]?.skill === "intermediate");

    // Partner Requests — a fixed partner pair is only ever forced together
    // WITHIN one division here (each division's pool is passed separately,
    // see extractFixedPartnerTeams in BalancedRotationEngine), so a pair
    // spanning Beginner and Intermediate is never force-paired — Adaptive
    // Skill Rotation's Beginner/Intermediate separation is structurally
    // untouched by this option.
    const beginnerMatchups = this.generateDivisionMatchups(beginnerIds, players);
    const intermediateMatchups = this.generateDivisionMatchups(intermediateIds, players);

    const merged = [...beginnerMatchups, ...intermediateMatchups].map((m) => {
      const ids = [...m.teamA, ...m.teamB];
      return {
        m,
        representativeWait: this.avgWaitMinutes(ids, players),
        avgGames: this.avgGames(ids, players),
        quality: this.qualityScoreFor(m, players),
      };
    });

    // shuffle before the sort so an exact tie on every tier doesn't
    // systematically favor whichever division happened to be concatenated
    // first
    shuffle(merged);
    merged.sort(
      (a, b) =>
        b.representativeWait - a.representativeWait || // 1. longest-waiting group first (Stage 1's own priority)
        a.avgGames - b.avgGames || // 2. fewest games played, tiebreak
        b.quality - a.quality // 3. existing matchup quality (partner + opponent + Winner-vs-Winner), final tiebreak
    );

    return merged.map(({ m }) => m);
  }

  // One division (Beginner or Intermediate) at a time.
  //
  // Stage 1: selectFairnessGroups partitions `pool` into ordered groups of
  // exactly 4 fairness-selected players (see its own comment) plus a
  // leftover remainder that simply isn't matched this round (same
  // "leftover stays available for the next refresh" precedent every other
  // engine in this app already follows for an odd/insufficient pool).
  //
  // Stage 2: for each group, team formation (buildTeams) and matchup
  // quality (buildMatchupsFromTeams) run EXACTLY as before this redesign —
  // completely unchanged code, just scoped to 4 players at a time instead
  // of the whole division. `true` for allowSameSkillFallback mirrors this
  // class's original behavior — a single division's pool is always
  // single-skill, so BalancedRotationEngine's own mixed-pairing loop never
  // finds a partner in the OTHER skill bucket and always needs its
  // same-skill leftover path (pairLeftovers) to pair anyone at all.
  generateDivisionMatchups(pool, players) {
    const { groups, groupNotes } = this.selectFairnessGroups(pool, players);

    const matchups = [];
    groups.forEach((quartet, i) => {
      const teams = this.divisionEngine.buildTeams(quartet, players, true);
      const rawMatchups = this.buildMatchupsFromTeams(teams, players);
      // exactly 4 players in => exactly 2 teams => exactly 1 full matchup,
      // every time (buildTeams never leaves a same-skill-of-4 pool
      // unpaired) — rawMatchups.length === 1 is guaranteed here, but this
      // stays a .forEach rather than an assumption so a future
      // buildTeams edge case degrades to "no matchup this group" instead
      // of throwing.
      rawMatchups.forEach(({ teamA, teamB }) => {
        matchups.push({ id: uid(), teamA, teamB, fairness: this.describeFairness(quartet, players, groupNotes[i]) });
      });
    });

    return matchups;
  }

  // Stage 1 — see the Fairness Selection Redesign comment above the class.
  // Builds one priority "stack" for the whole division pool, then walks it
  // front-to-back assembling groups of exactly 4 fairness-selected
  // players. Mutually-fixed Partner Requests (see
  // BalancedRotationEngine.extractFixedPartnerTeams, reused read-only here
  // — never modified) are treated as a single 2-player "unit" that always
  // moves through the stack together, so a partner request can never be
  // split across two different groups by the fairness ordering.
  selectFairnessGroups(pool, players) {
    const { teams: fixedPairs, remaining: soloIds } = this.divisionEngine.extractFixedPartnerTeams(pool, players);
    const now = Date.now();

    const units = [
      ...soloIds.map((id) => ({ ids: [id] })),
      ...fixedPairs.map(([a, b]) => ({ ids: [a, b] })),
    ].map((unit) => ({
      ...unit,
      // a unit's priority is driven by its LONGEST-waiting member (so a
      // partner request never dilutes a long-waiting player's own
      // priority) and its FEWEST games (so the unit isn't penalized by a
      // fresher partner either)
      wait: Math.max(...unit.ids.map((id) => this.waitMinutesFor(id, players, now))),
      games: Math.min(...unit.ids.map((id) => players[id]?.games || 0)),
      earliestSince: Math.min(...unit.ids.map((id) => this.sinceStamp(id, players))),
    }));

    units.sort(
      (a, b) => b.wait - a.wait || a.games - b.games || a.earliestSince - b.earliestSince
    );

    const groups = [];
    const groupNotes = [];
    let stack = units;

    while (stack.reduce((n, u) => n + u.ids.length, 0) >= 4) {
      const window = stack.slice(0, 1 + LOOKAHEAD_MAX_UNITS);
      const { quartetUnitIndexes, usedLookahead, guardRelaxed } = this.selectQuartetFromWindow(window, players, now);
      if (!quartetUnitIndexes) break; // window can't assemble a full 4 (e.g. a single leftover unit of 2) — stop, leave it waiting
      const chosenUnits = quartetUnitIndexes.map((i) => window[i]);
      const quartet = chosenUnits.flatMap((u) => u.ids);
      groups.push(quartet);
      groupNotes.push({ usedLookahead, guardRelaxed });
      const chosenSet = new Set(quartetUnitIndexes.map((i) => window[i]));
      stack = stack.filter((u) => !chosenSet.has(u));
    }

    return { groups, groupNotes, leftover: stack.flatMap((u) => u.ids) };
  }

  // Assembles one valid group of exactly 4 ids from `window` (an ordered
  // slice of units, front = highest priority). The front-most unit is
  // mandatory — "protect the queue front" — everything else is chosen by
  // a small brute-force search over the REMAINING units in the window
  // (bounded to at most LOOKAHEAD_MAX_UNITS of them, never the whole
  // stack) for the combination that both (a) totals exactly 4 ids and
  // (b) satisfies the hard rest guard (see REST_GUARD_* above) against
  // every unit the window would otherwise exclude. Ties are broken toward
  // whichever combination sits closest to the front (lowest unit-index
  // sum) — i.e. the strict front-of-stack groups are used whenever they
  // don't trip the guard, exactly "protect the queue front while allowing
  // limited flexibility."
  //
  // Graceful relaxation: if NO combination in the window satisfies the
  // guard (only possible in a very small/thin division), the guard is
  // dropped and the strict front-of-window combination is used instead —
  // "the guard should gracefully relax only when there are not enough
  // eligible alternatives," never the other way around.
  selectQuartetFromWindow(window, players, now) {
    if (window.length === 0) return { quartetUnitIndexes: null };
    const totalIds = window.reduce((n, u) => n + u.ids.length, 0);
    if (totalIds < 4) return { quartetUnitIndexes: null };

    const frontIndex = 0;
    const restIndexes = window.map((_, i) => i).filter((i) => i !== frontIndex);
    const frontSize = window[frontIndex].ids.length;

    const candidates = [];
    // bounded brute force: restIndexes.length <= LOOKAHEAD_MAX_UNITS, so
    // 2^restIndexes.length subsets is at most 2^6 = 64 — small and
    // explicitly capped by LOOKAHEAD_MAX_UNITS
    const subsetCount = 1 << restIndexes.length;
    for (let mask = 0; mask < subsetCount; mask++) {
      const chosenRest = restIndexes.filter((_, bit) => mask & (1 << bit));
      const size = frontSize + chosenRest.reduce((n, i) => n + window[i].ids.length, 0);
      if (size !== 4) continue;
      const quartetUnitIndexes = [frontIndex, ...chosenRest];
      candidates.push({ quartetUnitIndexes, indexSum: quartetUnitIndexes.reduce((a, b) => a + b, 0) });
    }

    if (candidates.length === 0) return { quartetUnitIndexes: null };

    const guardCompliant = candidates.filter((c) => this.satisfiesRestGuard(c.quartetUnitIndexes, window, players, now));
    const pool = guardCompliant.length > 0 ? guardCompliant : candidates;
    pool.sort((a, b) => a.indexSum - b.indexSum);
    const chosen = pool[0];
    const strictFront = window.length >= 4 ? [0, 1, 2, 3].every((i) => chosen.quartetUnitIndexes.includes(i)) : false;
    return {
      quartetUnitIndexes: chosen.quartetUnitIndexes,
      usedLookahead: !strictFront,
      guardRelaxed: guardCompliant.length === 0,
    };
  }

  // Hard rest guard check for one candidate quartet (given as unit indexes
  // into `window`): no included unit that is "fresh" (waited less than
  // REST_GUARD_FRESH_MINUTES) may be selected while an EXCLUDED unit still
  // inside the same bounded window has waited at least REST_GUARD_GAP_MINUTES
  // longer. This is checked per-unit (not per-player) so a fixed-partner
  // pair is judged by its own (longest-waiting-member) priority, same as
  // everywhere else in Stage 1.
  satisfiesRestGuard(quartetUnitIndexes, window, players, now) {
    const chosenSet = new Set(quartetUnitIndexes);
    for (const i of quartetUnitIndexes) {
      const unit = window[i];
      if (unit.wait >= REST_GUARD_FRESH_MINUTES) continue; // not "fresh" — guard doesn't apply to this unit
      for (let j = 0; j < window.length; j++) {
        if (chosenSet.has(j)) continue;
        if (window[j].wait >= unit.wait + REST_GUARD_GAP_MINUTES) return false;
      }
    }
    return true;
  }

  // Next Match Proposal explanation data — see docs/PROJECT.md's "Next
  // Match Proposal" UI. Purely descriptive (never affects matchmaking
  // itself); attached to each returned matchup so the UI can show the
  // organizer WHY these 4 players were selected, and surface a Fairness
  // Warning whenever the bounded lookahead had to reach past the strict
  // front of the queue, or the rest guard had to relax.
  describeFairness(quartet, players, note) {
    const now = Date.now();
    const waits = quartet.map((id) => this.waitMinutesFor(id, players, now));
    const games = quartet.map((id) => players[id]?.games || 0);
    let reason = "Fairness priority: these are the longest-waiting eligible players.";
    if (note?.guardRelaxed) {
      reason = "Fairness note: the rest guard was relaxed because there weren't enough eligible alternatives waiting substantially longer.";
    } else if (note?.usedLookahead) {
      reason = "Fairness note: limited queue lookahead was used because the first four waiting players could not form a valid matchup.";
    }
    return {
      waitMinutesRange: [Math.round(Math.min(...waits)), Math.round(Math.max(...waits))],
      gamesRange: [Math.min(...games), Math.max(...games)],
      usedLookahead: Boolean(note?.usedLookahead),
      guardRelaxed: Boolean(note?.guardRelaxed),
      reason,
    };
  }

  // Winner vs Winner / Loser vs Loser — a PREFERENCE layered on top of
  // BalancedRotationEngine's own opponent-recency scoring (reused via its
  // public scoreOpponents, not duplicated), never a hard requirement. It's
  // a scoring bonus, not a filter: whenever there aren't enough
  // same-last-result players available to pair up, the bonus just doesn't
  // apply to any candidate pairing and the existing
  // fairness/opponent-avoidance scoring alone decides who faces whom.
  // Scoped to a single Stage-1-selected group of 4 since this redesign —
  // it can rearrange which 2 of THOSE 4 players are on which team, but can
  // never reach outside the group to pull in a different, fresher player
  // for a better score (see the class header comment).
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
  // time, games played) now live one level up, in Stage 1 (selectFairnessGroups),
  // completely untouched by this method.
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

  // Minutes waited right now for a single player id — same fallback
  // WaitingTimer.jsx already displays with (lastMatchEndAt once a player
  // has played, else checkedInAt). Explicit null/undefined checks (not
  // `||`) so a literal 0 timestamp is never mistaken for "not set" — real
  // epoch timestamps are never exactly 0, but this keeps the fallback
  // correct rather than relying on that always being true.
  waitMinutesFor(id, players, now = Date.now()) {
    const p = players[id];
    const since = p?.lastMatchEndAt ?? p?.checkedInAt ?? now;
    return (now - since) / 60000;
  }

  // Raw timestamp (not minutes) backing waitMinutesFor — used only as
  // Stage 1's stable tertiary tiebreak (earlier timestamp = been in the
  // pool/off-court longer, resolves an exact wait-minute tie consistently
  // rather than by insertion order).
  sinceStamp(id, players) {
    const p = players[id];
    return p?.lastMatchEndAt ?? p?.checkedInAt ?? 0;
  }

  // Average minutes waited across a set of player ids, right now. Reuses
  // the exact same fields/fallback WaitingTimer.jsx already displays with.
  avgWaitMinutes(ids, players) {
    if (ids.length === 0) return 0;
    const now = Date.now();
    return ids.reduce((sum, id) => sum + this.waitMinutesFor(id, players, now), 0) / ids.length;
  }

  // Average games played across a set of player ids — dev-tool/legacy use
  // (scripts/simulate-adaptive-fairness.mjs); Stage 1's own games-played
  // tiebreak is computed directly in selectFairnessGroups above.
  avgGames(ids, players) {
    if (ids.length === 0) return 0;
    return ids.reduce((sum, id) => sum + (players[id]?.games || 0), 0) / ids.length;
  }

  // Max games played across a set of player ids — dev-tool/legacy use, see
  // avgGames above.
  maxGames(ids, players) {
    if (ids.length === 0) return 0;
    return Math.max(...ids.map((id) => players[id]?.games || 0));
  }

  // LEGACY — no longer called by generateMatchups (Stage 1 now decides
  // waiting priority directly), kept only for
  // scripts/simulate-adaptive-fairness.mjs's dev-only breakdown tool.
  waitingBonusFor(matchupPlayerIds, players, overallAvgWaitMinutes) {
    return WAIT_BONUS_WEIGHT * (this.avgWaitMinutes(matchupPlayerIds, players) - overallAvgWaitMinutes);
  }

  // "Existing matchup quality" — composes BalancedRotationEngine's own
  // scoreFullMatchup (scorePartner x2 + scoreOpponents, i.e. partner
  // diversity + opponent diversity) with this class's own winnerBonusFor
  // (Winner-vs-Winner). No scoring logic is reimplemented here; this only
  // sums pieces that already exist elsewhere. Used as generateMatchups'
  // final cross-division tiebreak, and by the dev-tool breakdown helper.
  qualityScoreFor(matchup, players) {
    return (
      this.divisionEngine.scoreFullMatchup(matchup.teamA, matchup.teamB, players) +
      this.winnerBonusFor(matchup.teamA, matchup.teamB, players)
    );
  }

  // Development-only helper — NEVER called from generateMatchups or any
  // production code path; exists purely so a dev-only script/tool can
  // print a per-matchup breakdown. Read-only decomposition of numbers this
  // class already computes elsewhere — does not affect matchmaking.
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
