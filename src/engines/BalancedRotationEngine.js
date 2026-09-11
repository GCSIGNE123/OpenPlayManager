import { RotationEngine } from "./RotationEngine.js";
import { shuffle, uid } from "../lib/random.js";

// ── FAIRNESS SELECTION (Stage 1) ─────────────────────────────────────
// Real ~28-player / 2-court Open Play sessions showed players who had JUST
// finished a match being selected for the next one ahead of players who had
// been waiting far longer. Root cause (see the investigation report): this
// engine's team FORMATION (buildTeams -> shuffle + scorePartner) had ZERO
// awareness of waiting time, and the caller's post-hoc sortMatchupsByPriority
// is a no-op unless an organizer opts in — so a just-finished player was
// exactly as likely to be picked as one who'd waited an hour, and scarce
// Intermediates (each needed for a mixed team every round) were re-picked
// almost immediately regardless of how long Beginners had waited.
//
// Fix — a two-stage pipeline, mirroring the one AdaptiveSkillRotationEngine
// already uses (kept as its own copy here so that engine — and its tests —
// stay completely untouched; the constant VALUES are deliberately identical
// since the same real session drove both):
//
//   STAGE 1 — SELECTION (selectFairnessQuartets). Orders the eligible
//   waiting pool by LONGEST EFFECTIVE WAIT first (lastMatchEndAt once a
//   player has played, else checkedInAt — the exact fallback
//   sinceWaiting()/WaitingTimer.jsx use, so a just-finished player's clock
//   correctly restarts and a never-played player's full wait counts). Walks
//   that ordered list front-to-back assembling groups of exactly 4,
//   PROTECTING THE FRONT (the single longest-waiting eligible player is
//   never skipped) while allowing a small BOUNDED lookahead only when the
//   strict front 4 can't form a valid group.
//
//   HARD RECENT-PLAY REST GUARD — a "fresh" player (waited under
//   REST_GUARD_FRESH_MINUTES) is never selected while an eligible
//   alternative within the lookahead window has waited at least
//   REST_GUARD_GAP_MINUTES longer. A filter on which quartets Stage 1 will
//   consider — not a score Stage 2 could out-bid. Relaxes only when no
//   guard-compliant quartet exists at all (a tiny pool), never for a better
//   skill/quality score.
//
//   INTERMEDIATE QUEUE-DISTANCE RULE — two Intermediate players may share a
//   matchup (i.e. face each other across two mixed teams) only when their
//   positions in the effective-wait-ordered waiting list are AT MOST
//   INTERMEDIATE_QUEUE_DISTANCE_MAX apart ("1 or 2 waiting-list positions
//   apart"). Positions are 1-based ranks in that ordered list (rank 1 =
//   longest waiting); a mutually-fixed partner pair is exempt (an explicit
//   organizer choice). So a far-back Intermediate is never pulled up merely
//   to give a front Intermediate a same-skill opponent — the front
//   Intermediate just plays with Beginners and the far one keeps waiting.
//
//   STAGE 2 — PAIRING (buildTeams / buildMatchupsFromTeams, UNCHANGED).
//   Given a fixed set of exactly 4 players, mixed beginner+intermediate
//   pairing, Partner Requests, partner-recency and opponent-recency all run
//   EXACTLY as before — just scoped to those 4 instead of the whole pool.
//   Stage 2 can no longer reach past the fairness-selected players to find a
//   better score: skill/diversity remain PAIRING preferences, never a
//   queue-selection priority.
//
// state.matchmakingPriority still steers Stage 1's ordering key when an
// organizer opts in ("newlyCheckedIn" / "leastGamesPlayed" order the stack
// differently and skip the rest guard, since those explicitly don't want
// longest-wait-first); null / "longestWaiting" is the default above.

// A player who has waited less than this many minutes since their last
// match (or check-in) counts as "just finished" / fresh for the rest guard.
export const REST_GUARD_FRESH_MINUTES = 5;

// The rest guard triggers when a fresh player would be selected while an
// eligible alternative still within the lookahead window has waited at
// least this many minutes LONGER (matches the investigation's example: a
// player who finished ~2 min ago must not be chosen over players waiting
// 11-14 min — a 9-12 min gap, comfortably over this threshold).
export const REST_GUARD_GAP_MINUTES = 8;

// At most this many EXTRA waiting units (a unit = one player, or one
// mutually-fixed-partner pair moving together) beyond the front unit are
// ever considered when assembling one group of 4. A hard cap, not unlimited
// search for a "better" matchup.
export const LOOKAHEAD_MAX_UNITS = 6;

// "1 or 2 waiting-list positions apart" — two Intermediate players may share
// a matchup only when their 1-based ranks in the effective-wait-ordered
// eligible waiting list differ by at most this. So ranks (1,2), (1,3),
// (2,4), (3,5) are allowed (difference <= 2); (1,4) and (3,6) are not.
export const INTERMEDIATE_QUEUE_DISTANCE_MAX = 2;

// Effective wait start for one player — since they last stopped playing,
// else since check-in. Explicit ?? (not ||) so a literal 0 timestamp is
// never mistaken for "unset" (real epoch stamps are never exactly 0, but
// this keeps the fallback correct rather than relying on that).
export function effectiveWaitSince(player) {
  return player?.lastMatchEndAt ?? player?.checkedInAt ?? 0;
}

// Balanced Beginner+Intermediate rotation strategy.
//
// Priority order (highest first):
//   1. Eligibility (handled by the caller — held / checked-out / on-break
//      players are already excluded from `waitingIds`).
//   2. Longest effective waiting time — Stage 1 selection (see above).
//   3. Skill compatibility within the allowed constraint — mixed
//      beginner+intermediate teams, and the Intermediate queue-distance
//      rule; a preference, never allowed to override #2.
//   4. Existing tie-breakers — avoid repeating a player's most recent
//      partner; avoid repeating a team's most recent opponents; spread
//      intermediates across different beginners over time (Stage 2).
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
  generateMatchups({ waitingIds, players, existingMatchups, priority = null }, allowSameSkillFallback = false) {
    const reserved = new Set(existingMatchups.flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = waitingIds.filter((id) => !reserved.has(id) && players[id]);

    // STAGE 1 — decide WHO plays (longest effective wait first) and in what
    // order the resulting matchups sit (front = longest-waiting quartet, so
    // the caller's `.slice(0, room)` keeps the right players).
    const quartets = this.selectFairnessQuartets(pool, players, priority);

    // STAGE 2 — decide WHO PARTNERS / FACES WHOM, unchanged, scoped to each
    // fairness-selected group of 4.
    const matchups = [];
    for (const quartet of quartets) {
      const teams = this.buildTeams(quartet, players, allowSameSkillFallback);
      const rawMatchups = this.buildMatchupsFromTeams(teams, players);
      for (const { teamA, teamB } of rawMatchups) {
        matchups.push({ id: uid(), teamA, teamB });
      }
    }
    return matchups;
  }

  // STAGE 1 — see the FAIRNESS SELECTION comment above the class. Builds an
  // ordered "waiting list" for the whole pool, then walks it front-to-back
  // assembling groups of exactly 4. Mutually-fixed Partner Requests move
  // through the list as a single 2-player unit so a request is never split
  // across two groups by the ordering. Returns the groups (front =
  // longest-waiting) plus whatever couldn't form a full group of 4, which
  // simply waits for the next refresh — the same "leftover stays available"
  // precedent every rotation engine here already follows.
  selectFairnessQuartets(pool, players, priority = null) {
    const { teams: fixedPairs, remaining: soloIds } = this.extractFixedPartnerTeams(pool, players);
    const now = Date.now();
    const waitMin = (id) => (now - effectiveWaitSince(players[id])) / 60000;

    const units = [
      ...soloIds.map((id) => ({ ids: [id] })),
      ...fixedPairs.map(([a, b]) => ({ ids: [a, b] })),
    ].map((u) => ({
      ...u,
      // a unit ranks by its LONGEST-waiting / FEWEST-games / newest-checkin
      // member, so a fresher fixed partner never dilutes the other's priority
      since: Math.min(...u.ids.map((id) => effectiveWaitSince(players[id]))),
      checkedIn: Math.max(...u.ids.map((id) => players[id]?.checkedInAt ?? 0)),
      games: Math.min(...u.ids.map((id) => players[id]?.games ?? 0)),
      waitMin: Math.max(...u.ids.map((id) => waitMin(id))),
    }));

    const useRestGuard = priority == null || priority === "longestWaiting";
    const cmp =
      priority === "newlyCheckedIn"
        ? (a, b) => b.checkedIn - a.checkedIn || a.since - b.since
        : priority === "leastGamesPlayed"
          ? (a, b) => a.games - b.games || a.since - b.since
          : /* longestWaiting / default */ (a, b) => a.since - b.since || a.games - b.games;
    units.sort(cmp);

    // 1-based rank of every player in the ordered list (a fixed pair's two
    // players take consecutive ranks) — the "waiting-list position" the
    // Intermediate queue-distance rule uses.
    const positionOf = new Map();
    let rank = 0;
    for (const u of units) {
      for (const id of u.ids) {
        rank += 1;
        positionOf.set(id, rank);
      }
    }

    const quartets = [];
    let stack = units;
    while (stack.reduce((n, u) => n + u.ids.length, 0) >= 4) {
      const window = stack.slice(0, 1 + LOOKAHEAD_MAX_UNITS);
      const chosenIdxs = this.selectQuartetFromWindow(window, players, positionOf, useRestGuard, now);
      if (!chosenIdxs) break; // window can't assemble a full 4 — stop, leave the rest waiting
      const chosenUnits = new Set(chosenIdxs.map((i) => window[i]));
      quartets.push(chosenIdxs.flatMap((i) => window[i].ids));
      stack = stack.filter((u) => !chosenUnits.has(u));
    }
    return quartets;
  }

  // Assembles one valid group of exactly 4 ids from `window` (an ordered
  // slice of units, front = highest priority). The front unit is mandatory
  // ("protect the queue front"); everything else is a small bounded
  // brute-force search (<= 2^LOOKAHEAD_MAX_UNITS = 64 subsets) for a
  // combination that totals exactly 4 ids and, in priority order:
  //   (a) satisfies the rest guard, then
  //   (b) satisfies the Intermediate queue-distance rule.
  // WAIT/FAIRNESS > INTERMEDIATE COMPATIBILITY — when both can't be
  // satisfied together, the rest guard wins and the Intermediate rule is
  // relaxed, never the reverse. Each constraint is relaxed only if NOTHING
  // in the window can satisfy it — fairness/skill constraints give way
  // solely when there is truly no compliant alternative, never for a
  // better quality score. Ties break toward the combination closest to the
  // queue front (lowest index sum).
  selectQuartetFromWindow(window, players, positionOf, useRestGuard, now) {
    const totalIds = window.reduce((n, u) => n + u.ids.length, 0);
    if (totalIds < 4) return null;

    const restIndexes = window.map((_, i) => i).filter((i) => i !== 0);
    const frontSize = window[0].ids.length;

    const candidates = [];
    const subsetCount = 1 << restIndexes.length;
    for (let mask = 0; mask < subsetCount; mask++) {
      const chosenRest = restIndexes.filter((_, bit) => mask & (1 << bit));
      const size = frontSize + chosenRest.reduce((n, i) => n + window[i].ids.length, 0);
      if (size !== 4) continue;
      const idxs = [0, ...chosenRest];
      candidates.push({ idxs, indexSum: idxs.reduce((a, b) => a + b, 0) });
    }
    if (candidates.length === 0) return null;

    const intOK = (c) => this.intermediatesWithinQueueDistance(c.idxs, window, players, positionOf);
    const guardOK = (c) => !useRestGuard || this.satisfiesRestGuard(c.idxs, window);

    // WAIT/FAIRNESS > INTERMEDIATE COMPATIBILITY: when both can't be
    // satisfied together, keep the rest guard and relax the Intermediate
    // rule first — never the other way around. Dropping the rest guard
    // first would let a just-finished player leapfrog a materially
    // longer-waiting one merely to give a front Intermediate a same-skill
    // opponent, which is exactly the bypass this engine exists to prevent.
    let pool = candidates.filter((c) => intOK(c) && guardOK(c));
    if (pool.length === 0) pool = candidates.filter(guardOK); // keep the guard, drop the skill rule
    if (pool.length === 0) pool = candidates.filter(intOK); // keep the skill rule, drop the guard
    if (pool.length === 0) pool = candidates; // truly no fair alternative — take the strict front

    pool.sort((a, b) => a.indexSum - b.indexSum);
    return pool[0].idxs;
  }

  // Intermediate queue-distance rule (see INTERMEDIATE_QUEUE_DISTANCE_MAX).
  // No two Intermediate players in the candidate quartet may be more than
  // that many 1-based waiting-list positions apart — a mutually-fixed
  // partner pair is exempt (an explicit organizer choice overrides the
  // rule; "fixed partners still work").
  intermediatesWithinQueueDistance(idxs, window, players, positionOf) {
    const ids = idxs.flatMap((i) => window[i].ids);
    const intIds = ids.filter((id) => players[id]?.skill === "intermediate");
    for (let a = 0; a < intIds.length; a++) {
      for (let b = a + 1; b < intIds.length; b++) {
        const x = intIds[a];
        const y = intIds[b];
        const mutuallyFixed = players[x]?.partnerId === y && players[y]?.partnerId === x;
        if (mutuallyFixed) continue;
        if (Math.abs((positionOf.get(x) ?? 0) - (positionOf.get(y) ?? 0)) > INTERMEDIATE_QUEUE_DISTANCE_MAX) {
          return false;
        }
      }
    }
    return true;
  }

  // Hard rest guard for one candidate quartet (unit indexes into `window`):
  // no included "fresh" unit (waited < REST_GUARD_FRESH_MINUTES) may be
  // selected while an EXCLUDED unit still inside the window has waited at
  // least REST_GUARD_GAP_MINUTES longer. Judged per-unit (a fixed pair by
  // its longest-waiting member), same as everywhere else in Stage 1.
  satisfiesRestGuard(idxs, window) {
    const chosen = new Set(idxs);
    for (const i of idxs) {
      if (window[i].waitMin >= REST_GUARD_FRESH_MINUTES) continue; // not fresh — guard doesn't apply
      for (let j = 0; j < window.length; j++) {
        if (chosen.has(j)) continue;
        if (window[j].waitMin >= window[i].waitMin + REST_GUARD_GAP_MINUTES) return false;
      }
    }
    return true;
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
