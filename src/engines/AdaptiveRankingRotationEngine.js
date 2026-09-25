import { RotationEngine } from "./RotationEngine.js";
import { uid } from "../lib/random.js";
import { isRecentMatchup } from "../lib/matchupMemory.js";

// Adaptive Ranking Rotation — ONE continuous player pool ordered by PickleKing
// Points (players[id].rankingPoints, a per-session SNAPSHOT of the Club
// Rating Engine's currentRating — see lib/rankingSnapshot.js). No hard
// Beginner/Intermediate DIVISION: the skill label (players[id].skill) is never
// used to decide WHO plays or to fence a pool — only, after fairness, to
// BALANCE TEAMS (preferred shape: Beginner+Intermediate vs Beginner+Intermediate,
// gracefully falling back when a room does not have enough of one skill). Fully separate from AdaptiveSkillRotationEngine
// and BalancedRotationEngine: nothing here imports or alters either.
//
// Philosophy: fair turn -> competitive matchup -> variety. Two SEPARATE
// problems, deliberately never folded into one score:
//   WHO GETS TO PLAY  = stages 1-3 (rest, fairness tier, long-wait rescue).
//                       Never reads a rating.
//   WHO THEY PLAY     = stages 4-7 (ranking neighbourhood around the
//                       fairness anchor, partner, opponent, team balance).
//                       Can only choose among fairness-eligible candidates.
//
// Every constant below is a NAMED, exported knob — the values come from the
// design/tuning simulations (.scratch_vercel/ranking_sim2.mjs) and are an
// initial policy, not final.

// 1. REST — a player who waited less than this since their last match (or
// check-in) is "just finished". Excluded while >= 4 rested players exist.
export const REST_MIN_MINUTES = 5;

// 2. FAIRNESS — F3 "loose" tiers, relative to the median games played among
// the players eligible right now: games <= median - UNDER_SERVED_GAP is
// "materially under-served" (first), games >= median + OVER_SERVED_GAP is
// "materially over-served" (last), everyone else "normal". Longest wait breaks
// ties inside a tier. (OVER_SERVED_GAP 2 = the "loose" variant; 1 = strict —
// strict trades ~5 points of "waited longer" complaints for ~6 points of
// "fewer games" complaints, see the tuning report.)
export const UNDER_SERVED_GAP = 2;
export const OVER_SERVED_GAP = 2;

// 3. LONG-WAIT RESCUE — a player who has waited at least this many minutes
// jumps the tier order (longest wait first among rescued players), so
// "I waited much longer, why was he called first?" has a bounded answer.
// Tuning range 30-35; NOT final. Default 35: in the 62-player / 4-court
// benchmark room the MEAN wait is ~31 min, so at 30 most of the pool is
// "rescued" at once, which cancels the fairness tiers (games gap complaints
// ~18% vs ~12% at 35, and no better on wait complaints) — see the
// implementation report. The right threshold scales with room size / court
// count; a cycle-time-relative threshold is a possible later refinement.
// Guarded: only players at most LONG_WAIT_MAX_GAMES_AHEAD games above the
// pool minimum are rescued, so the rescue can never manufacture a large
// games gap.
export const LONG_WAIT_RESCUE_MINUTES = 35;
export const LONG_WAIT_MAX_GAMES_AHEAD = 2;

// 4. RANKING NEIGHBOURHOOD — candidates within +/- this many Points of the
// fairness anchor, widened x RANKING_WINDOW_WIDEN_FACTOR until the
// quartet can be filled. A provisional player (anchor or candidate) uses a
// window PROVISIONAL_WINDOW_FACTOR wider. Candidates are also limited to the
// next CANDIDATE_ARENA players in fairness order and to players at most
// CANDIDATE_GAMES_LEAD games above the pool minimum (relaxed if that leaves
// fewer than 3).
export const RANKING_WINDOW_START = 100;
export const RANKING_WINDOW_WIDEN_FACTOR = 1.5;
export const RANKING_WINDOW_MAX = 3000;
export const PROVISIONAL_WINDOW_FACTOR = 1.5;
export const CANDIDATE_ARENA = 10;
export const CANDIDATE_GAMES_LEAD = 1;

// New / unrated players: seeded at 1000 (the Club Rating Engine's own
// DEFAULT_INITIAL_RATING), provisional for their first 5 session games. No
// Beginner label anywhere.
export const DEFAULT_RANKING_POINTS = 1000;
export const PROVISIONAL_GAMES = 5;

// 5-7. Split scoring for the 3 possible 2+2 splits of the chosen 4 — same
// partner/opponent scale BalancedRotationEngine uses (+100 never partnered,
// -100 last game, -75 within 2 games, -50 partnered 3+, +50 otherwise;
// opponents -100 last game, -50 recent, +20 never faced), plus:
export const RECENT_MATCHUP_PENALTY = 150; // exact team-vs-team pairing in R1's bounded recentMatchups
export const TEAM_BALANCE_WEIGHT = 1; // penalty per Point of team-sum imbalance
export const TEAM_BALANCED_MAX_IMBALANCE = 40; // reason-code threshold only

// 4. PARTNER DIVERSITY — HARD constraint. A pair that is in either player's
// recentPartnerIds (the existing bounded history recordRotationHistory keeps:
// the last 2 partners) may not be teammates while ANY valid alternative
// complete 4-player matchup exists. Fixed / mutually-requested partners are
// exempt. Only when no alternative exists is a repeat allowed (the least-bad
// one, most-distant repeat first) and tagged FORCED_REPEAT_PARTNER.
export const RECENT_PARTNER_WINDOW = 2;

// 3. TEAM SKILL BALANCE — a split is scored by how evenly the two teams' skill
// is spread (Beginner = 0, Intermediate = 1, team sum difference: B+I vs B+I = 0,
// B+I vs I+I = 1, B+B vs I+I = 2). A quartet that is all one skill (no mixed
// team possible) is charged this extra amount so a mixed quartet is preferred
// when the fairness-eligible candidates allow one. Unknown skill = neutral.
export const HOMOGENEOUS_QUARTET_PENALTY = 0.5;
// 2. POINTS NEIGHBOURHOOD — among fairness-eligible candidates, a quartet whose
// four Points values sit inside one band of this width is preferred over a
// wider one (spread 0-100 = band 0, 101-200 = band 1, ...). This is the
// "high plays high / low plays low" preference. It is ranked ABOVE team skill
// balance and team-sum balance, and BELOW fairness: it only chooses among
// candidates fairness already made eligible, never who gets the turn.
export const POINTS_SPREAD_BAND = 100;

// 8. WAIT-TIME GUARD — among the LEGAL candidates (already inside the Points
// neighbourhood window, the rest filter, and the fairness arena, and after the
// hard recent-partner ban), a quartet that leaves out an eligible candidate who
// has waited at least this many minutes LONGER than one of its members is
// ranked below a quartet that does not. It sits ahead of the Points-band /
// skill-balance / partner-freshness / opponent preferences, so a big wait gap
// can outweigh a small ranking-quality difference — but it can only ever
// choose among candidates the window already admitted, so a player far outside
// the neighbourhood is never dragged in merely because they waited longer.
// Same threshold the Adaptive Skill rest guard uses (REST_GUARD_GAP_MINUTES).
// 0 disables it.
export const WAIT_GUARD_GAP_MINUTES = 8;

// 9. RECENT SAME-FOUR — a quartet made of the SAME four players as one of the
// last RECENT_SAME_FOUR_WINDOW matches (whatever the team split) is ranked below
// any alternative legal quartet (after the hard partner ban and the wait-time
// guard). Soft: it never leaves a court idle — when no other legal quartet
// exists the repeat is allowed. 0 disables it.
export const RECENT_SAME_FOUR_WINDOW = 4;

// 10. TEAM BALANCE BAND — when > 0 (off for the original Adaptive Ranking mode),
// the two teams' Points-sum imbalance is compared in bands of this width and
// ranked AHEAD of partner freshness / opponent variety, so among the 3 possible
// 2+2 splits of a chosen quartet a clearly better-balanced split beats a
// marginally fresher partnership (bands so tiny differences never matter).
// 0 keeps the original ordering (balance only after freshness/opponents).
export const TEAM_BALANCE_BAND_POINTS = 0;

// At most this many fairness-ordered candidates are combined per search level
// (C(12,3) = 220 triples x 3 splits — trivial, and bounded).
export const SEARCH_CANDIDATE_CAP = 12;

// Reason codes (organizer/debugging only — not shown to players).
export const REASONS = {
  REST_PROTECTED: "REST_PROTECTED",
  REST_RELAXED: "REST_RELAXED",
  LOW_GAMES_PRIORITY: "LOW_GAMES_PRIORITY",
  LONG_WAIT_PRIORITY: "LONG_WAIT_PRIORITY",
  LONGEST_WAIT_ORDER: "LONGEST_WAIT_ORDER",
  RANKING_MATCH: "RANKING_MATCH",
  RANKING_WIDENED: "RANKING_WIDENED",
  PROVISIONAL_RATING_USED: "PROVISIONAL_RATING_USED",
  NEW_PARTNER: "NEW_PARTNER",
  REPEAT_PARTNER_AVOIDED: "REPEAT_PARTNER_AVOIDED",
  REPEAT_OPPONENT_AVOIDED: "REPEAT_OPPONENT_AVOIDED",
  TEAM_BALANCED: "TEAM_BALANCED",
  FORCED_REPEAT_PARTNER: "FORCED_REPEAT_PARTNER",
  MIXED_SKILL_TEAM: "MIXED_SKILL_TEAM",
  SKILL_FALLBACK: "SKILL_FALLBACK",
  FIXED_PARTNER: "FIXED_PARTNER",
  POINTS_NEIGHBORHOOD: "POINTS_NEIGHBORHOOD",
  POINTS_WIDENED: "POINTS_WIDENED",
  WAIT_GUARD_APPLIED: "WAIT_GUARD_APPLIED",
  REPEAT_QUARTET_AVOIDED: "REPEAT_QUARTET_AVOIDED",
  GAMES_GAP_GUARD_APPLIED: "GAMES_GAP_GUARD_APPLIED",
};

// Every knob above, as one overridable object. generateMatchups reads
// `context.config` (partial) over these defaults — used by tuning/shadow
// experiments and boundary tests; production passes nothing.
export const DEFAULT_CONFIG = {
  restMinutes: REST_MIN_MINUTES,
  underServedGap: UNDER_SERVED_GAP,
  overServedGap: OVER_SERVED_GAP,
  longWaitRescueMinutes: LONG_WAIT_RESCUE_MINUTES,
  longWaitMaxGamesAhead: LONG_WAIT_MAX_GAMES_AHEAD,
  windowStart: RANKING_WINDOW_START,
  windowWidenFactor: RANKING_WINDOW_WIDEN_FACTOR,
  windowMax: RANKING_WINDOW_MAX,
  provisionalWindowFactor: PROVISIONAL_WINDOW_FACTOR,
  candidateArena: CANDIDATE_ARENA,
  candidateGamesLead: CANDIDATE_GAMES_LEAD,
  provisionalGames: PROVISIONAL_GAMES,
  recentMatchupPenalty: RECENT_MATCHUP_PENALTY,
  teamBalanceWeight: TEAM_BALANCE_WEIGHT,
  recentPartnerWindow: RECENT_PARTNER_WINDOW,
  homogeneousQuartetPenalty: HOMOGENEOUS_QUARTET_PENALTY,
  searchCandidateCap: SEARCH_CANDIDATE_CAP,
  pointsSpreadBand: POINTS_SPREAD_BAND,
  waitGuardGapMinutes: WAIT_GUARD_GAP_MINUTES,
  recentSameFourWindow: RECENT_SAME_FOUR_WINDOW,
  // GAMES GAP GUARD: leaving out an eligible candidate who has >= this many
  // FEWER completed games than a chosen member ranks a quartet below one that
  // does not (soft — after the hard partner ban, never idles a court). 0 = off.
  gamesGapThreshold: 0,
  restOnlyAfterPlay: false,
  useCalibratedPoints: false,
  // CALIBRATION AFFINITY (see lib/calibrationProfile.js): soft compatibility
  // between the four players from the organizer's calibration rounds. 0 = off.
  calibrationAffinityWeight: 0,
  calibrationDecayGames: 6,
  teamBalanceBand: TEAM_BALANCE_BAND_POINTS,
  // false = the Beginner/Intermediate label is never read (Points-Based Adaptive
  // Matchmaking): no skill team-balance term, no mixed-skill preference.
  useSkillLabels: true,
  // Points neighbourhood is STRICT by default: it is relaxed only for fairness
  // (a rescued long-waiter), fixed partners, court utilization (no legal
  // quartet inside it) and the hard recent-partner ban — NOT merely because a
  // better B+I mix exists outside it. Set true to also widen the window (and
  // rank skill above Points spread) whenever a 2B+2I quartet exists in the
  // fairness arena but not inside the neighbourhood — measured to lift B+I
  // vs B+I a lot when Beginners sit well below Intermediates in Points, at the
  // cost of mixed high/low quartets.
  widenWindowForSkill: false,
};

// The Points the SEARCH compares (Points neighbourhood, team balance). With
// `useCalibratedPoints` (Points-Based Adaptive Matchmaking) a session-local
// calibrated estimate replaces the persistent Points while it exists; the
// persistent rankingPoints themselves are never altered by it.
export function pointsFor(player, ratings, cfg) {
  if (cfg?.useCalibratedPoints && typeof player?.calibratedPoints === "number") return player.calibratedPoints;
  return rankingPointsOf(player, ratings);
}

export function rankingPointsOf(player, ratings) {
  const snap = player?.rankingPoints;
  if (typeof snap === "number") return snap;
  const fromMap = ratings?.[player?.id];
  if (typeof fromMap === "number") return fromMap;
  return DEFAULT_RANKING_POINTS;
}

// Provisional = not backed by a stored Player Database rating AND still in
// its first PROVISIONAL_GAMES session games. A player with a real stored
// rating (rankingSource "rated") is never provisional.
export function isProvisional(player, ratings, provisionalGames = PROVISIONAL_GAMES) {
  if (player?.rankingSource === "rated") return false;
  if (typeof ratings?.[player?.id] === "number") return false;
  return (player?.games || 0) < provisionalGames;
}

export function partnerScore(aId, bId, players) {
  const a = players[aId];
  const count = a?.partnerCounts?.[bId] || 0;
  const recent = a?.recentPartnerIds || [];
  if (count === 0) return 100;
  if (recent[0] === bId) return -100;
  if (recent.slice(0, 2).includes(bId)) return -75;
  if (count >= 3) return -50;
  return 50;
}

export function opponentScore(teamX, teamY, players) {
  let score = 0;
  for (const x of teamX) {
    const px = players[x];
    for (const y of teamY) {
      if (px?.lastOpponentIds?.includes(y)) score -= 100;
      else if (px?.recentOpponentIds?.includes(y)) score -= 50;
      else if (!px?.opponentCounts?.[y]) score += 20;
    }
  }
  return score;
}

export class AdaptiveRankingRotationEngine extends RotationEngine {
  // context: { waitingIds, players, existingMatchups, recentMatchups?, now?,
  //            ratings? (optional id->Points map, used by shadow mode for
  //            players with no session snapshot), courtsFree? (max matchups) }
  // Returns matchups best-first (the first is for the highest-priority
  // fairness anchor). Pure: never mutates its inputs.
  generateMatchups(context) {
    const { waitingIds, players, existingMatchups, recentMatchups = null, ratings = null } = context;
    const now = context.now ?? Date.now();
    const cfg = { ...DEFAULT_CONFIG, ...(context.config || {}) };
    const reserved = new Set((existingMatchups || []).flatMap((m) => [...m.teamA, ...m.teamB]));
    let remaining = waitingIds.filter((id) => !reserved.has(id) && players[id]).map((id) => players[id]);
    const matchups = [];
    const limit = context.maxMatchups ?? Infinity;

    while (remaining.length >= 4 && matchups.length < limit) {
      const built = this.buildOneMatchup(remaining, players, { now, recentMatchups, ratings, cfg, calibration: context.calibration || null });
      if (!built) break;
      matchups.push({ id: uid(), teamA: built.teamA, teamB: built.teamB, fairness: built.fairness, reasons: built.reasons, ranking: built.ranking });
      const used = new Set([...built.teamA, ...built.teamB]);
      remaining = remaining.filter((p) => !used.has(p.id));
    }
    return matchups;
  }

  waitMinutes(player, now) {
    const since = player.lastMatchEndAt ?? player.checkedInAt ?? now;
    return (now - since) / 60000;
  }

  // ----- stages 1-3: WHO GETS TO PLAY -----
  fairnessOrder(pool, now, cfg = DEFAULT_CONFIG) {
    const games = pool.map((p) => p.games || 0).sort((a, b) => a - b);
    const median = games[games.length >> 1];
    const minGames = games[0];
    const info = new Map();
    for (const p of pool) {
      const g = p.games || 0;
      const wait = this.waitMinutes(p, now);
      const rescued = wait >= cfg.longWaitRescueMinutes && g <= minGames + cfg.longWaitMaxGamesAhead;
      const tier = g <= median - cfg.underServedGap ? "under" : g >= median + cfg.overServedGap ? "over" : "normal";
      const tierRank = tier === "under" ? 2 : tier === "over" ? 0 : 1;
      info.set(p.id, { wait, rescued, tier, key: rescued ? 1e7 + wait : tierRank * 1e5 + wait });
    }
    // stable: equal keys fall back to input order (deterministic)
    const ordered = pool.map((p, i) => ({ p, i })).sort((a, b) => info.get(b.p.id).key - info.get(a.p.id).key || a.i - b.i).map((x) => x.p);
    return { ordered, info, median, minGames };
  }

  // ----- who plays with/against whom -----
  // WHO GETS THE TURN is decided first (rest -> F3 tiers -> long-wait rescue ->
  // the fairness ANCHOR is mandatory), exactly as Phase 1. Then, among the
  // fairness-eligible candidates only, the quartet + team split is chosen by
  // a search that compares options LEXICOGRAPHICALLY (earlier item always
  // beats later ones — no weighted sum that could hide an unfair queue):
  //   c0 recent-partner violations   HARD: any repeat sinks the option while a
  //                                  violation-free option exists anywhere
  //   cW wait-time guard             leaving out an eligible candidate who waited
  //                                  >= WAIT_GUARD_GAP_MINUTES longer than a member
  //   c1 team skill balance          B+I vs B+I best; graceful fallback
  //   c2 partner freshness           prefer never/rarely-partnered teammates
  //   c3 immediate repeat opponents  (players who faced each other last game)
  //   c4 recent opponents + exact recentMatchups pairing
  //   c5 team Points-sum imbalance
  //   c6 fairness closeness          rank of the chosen candidates in the fairness order
  // The Points window is a candidate FILTER around the anchor (Phase 1): it
  // widens step by step whenever no acceptable option exists inside it, then
  // the candidate arena widens, before a repeat partner is ever forced.
  buildOneMatchup(remaining, players, { now, recentMatchups, ratings, cfg = DEFAULT_CONFIG, calibration: context_calibration = null }) {
    const reasons = [];
    // 1. REST
    // restOnlyAfterPlay: the rest guard protects players who JUST PLAYED; a fresh
    // check-in (never played) is not "resting", so a latecomer is judged by the
    // ordinary fairness rules from the moment they are eligible.
    const rested = remaining.filter((p) => (cfg.restOnlyAfterPlay && p.lastMatchEndAt == null) || this.waitMinutes(p, now) >= cfg.restMinutes);
    let pool = remaining;
    if (rested.length >= 4) {
      pool = rested;
      if (rested.length < remaining.length) reasons.push(REASONS.REST_PROTECTED);
    } else {
      reasons.push(REASONS.REST_RELAXED);
    }
    // A mutually fixed pair moves as ONE unit: if only one member made it into
    // the pool (the other is still resting), hold him back so he is not teamed
    // with someone else. A partner who is not waiting at all (live court,
    // held, checked out, on break) leaves the other player free.
    const waitingIds = new Set(remaining.map((p) => p.id));
    const fixedAll = new Map();
    for (const p of remaining) {
      const q = p.partnerId;
      if (q && q !== p.id && waitingIds.has(q) && players[q]?.partnerId === p.id) fixedAll.set(p.id, q);
    }
    if (fixedAll.size > 0) {
      const inPool = new Set(pool.map((p) => p.id));
      const unitPool = pool.filter((p) => !fixedAll.has(p.id) || inPool.has(fixedAll.get(p.id)));
      if (unitPool.length >= 4) pool = unitPool;
      else { pool = remaining; if (!reasons.includes(REASONS.REST_RELAXED)) reasons.push(REASONS.REST_RELAXED); }
    }
    if (pool.length < 4) return null;

    // 2-3. FAIRNESS + LONG-WAIT RESCUE
    const { ordered, info, minGames } = this.fairnessOrder(pool, now, cfg);
    const anchor = ordered[0];
    const anchorInfo = info.get(anchor.id);
    if (anchorInfo.rescued) reasons.push(REASONS.LONG_WAIT_PRIORITY);
    else if (anchorInfo.tier === "under") reasons.push(REASONS.LOW_GAMES_PRIORITY);
    else reasons.push(REASONS.LONGEST_WAIT_ORDER);
    const rankOf = new Map(ordered.map((p, i) => [p.id, i]));

    // fixed / mutually-requested partners currently in the pool (STRICT teaming
    // constraint: they must be teammates, overriding Points neighbourhood,
    // recent-partner ban, partner diversity and skill balance between them)
    const fixedOf = new Map();
    const poolIds = new Set(pool.map((p) => p.id));
    for (const [a, b] of fixedAll) if (poolIds.has(a) && poolIds.has(b)) fixedOf.set(a, b);

    const anchorPts = pointsFor(anchor, ratings, cfg);
    const anchorProv = isProvisional(anchor, ratings, cfg.provisionalGames);
    const within = (p, W) => {
      const prov = anchorProv || isProvisional(p, ratings, cfg.provisionalGames);
      const eff = prov ? W * cfg.provisionalWindowFactor : W;
      return Math.abs(pointsFor(p, ratings, cfg) - anchorPts) <= eff;
    };

    const stats = { sawViolation: false, sawImmediateOpponent: false, sawWaitSkip: false, sawSameFour: false, sawGamesSkip: false };
    const ctx = { players, ratings, recentMatchups, cfg, rankOf, fixedOf, anchor, stats, info, calibration: context_calibration, recentFours: recentQuartetSet([...(recentMatchups || []).slice(0, cfg.recentSameFourWindow), ...(context_calibration?.fourKeys || [])], Infinity) };

    const arenaBase = (size) => {
      let cand = ordered.slice(1, size === Infinity ? undefined : size + 1);
      if (size !== Infinity) {
        const guarded = cand.filter((p) => (p.games || 0) <= minGames + cfg.candidateGamesLead);
        if (guarded.length >= 3) cand = guarded;
      }
      // the anchor's fixed partner is always available to the search, whatever
      // the arena / games-lead guard says (an explicit organizer request)
      const fp = fixedOf.get(anchor.id);
      if (fp && !cand.some((p) => p.id === fp)) { const pp = ordered.find((p) => p.id === fp); if (pp) cand = [...cand, pp]; }
      return cand;
    };
    // the anchor's fixed partner is window-exempt (an explicit organizer request)
    const anchorFixed = fixedOf.get(anchor.id) || null;

    let accepted = null;
    let bestSoFar = null;
    let bestWindow = cfg.windowStart;
    let bestWidened = false;
    outer: for (const arena of [cfg.candidateArena, Infinity]) {
      const base = arenaBase(arena);
      if (base.length < 3) continue;
      const forced = base.filter((p) => info.get(p.id).rescued || p.id === anchorFixed).slice(0, 3);
      const forcedIds = new Set(forced.map((p) => p.id));
      const idealPossible = cfg.useSkillLabels === false ? false : this.idealSkillPossible(anchor, base);
      let W = cfg.windowStart;
      let widened = false;
      for (;;) {
        const inWin = base.filter((p) => !forcedIds.has(p.id) && within(p, W));
        const candList = [...forced, ...inWin].slice(0, cfg.searchCandidateCap);
        // forced players must always be in the list even when the cap trims
        for (const f of forced) if (!candList.includes(f)) candList.unshift(f);
        // a fixed partner of anyone in the list is window-exempt: the pair can
        // only be placed together, so its partner must be searchable
        for (const p of [...candList]) {
          const fp = fixedOf.get(p.id);
          if (fp && fp !== anchor.id && !candList.some((x) => x.id === fp)) { const pp = base.find((x) => x.id === fp); if (pp) candList.push(pp); }
        }
        if (candList.length >= 3) {
          const res = this.searchQuartets(candList, forcedIds, ctx);
          if (res) {
            if (!bestSoFar || compareTuples(res.tuple, bestSoFar.tuple) < 0) { bestSoFar = res; bestWindow = W; bestWidened = widened; }
            const skillOk = !cfg.widenWindowForSkill || res.skillPenalty === 0 || !idealPossible;
            if (res.violations === 0 && skillOk) { accepted = res; bestWindow = W; bestWidened = widened; break outer; }
          }
        }
        if (W === Infinity) break;
        W *= cfg.windowWidenFactor;
        widened = true;
        if (W > cfg.windowMax) W = Infinity;
      }
    }
    const chosen = accepted || bestSoFar;
    if (!chosen) return null;

    if (chosen.forcedCount > 0 && !reasons.includes(REASONS.LONG_WAIT_PRIORITY)) reasons.push(REASONS.LONG_WAIT_PRIORITY);
    const quartet = chosen.quartet.map((id) => players[id]);
    // Points neighbourhood: tight when every member is inside the anchor's window
    // at its starting width; widened when the window had to grow OR fairness /
    // a fixed partner brought someone in from outside it
    const outside = quartet.some((p) => !within(p, cfg.windowStart));
    const widenedFinal = bestWidened || outside;
    reasons.push(widenedFinal ? REASONS.RANKING_WIDENED : REASONS.RANKING_MATCH);
    reasons.push(widenedFinal ? REASONS.POINTS_WIDENED : REASONS.POINTS_NEIGHBORHOOD);
    if (chosen.fixedPairs > 0) reasons.push(REASONS.FIXED_PARTNER);
    if (chosen.gamesSkips === 0 && stats.sawGamesSkip) reasons.push(REASONS.GAMES_GAP_GUARD_APPLIED);
    if (chosen.sameFour === 0 && stats.sawSameFour) reasons.push(REASONS.REPEAT_QUARTET_AVOIDED);
    if (chosen.waitSkips === 0 && stats.sawWaitSkip) reasons.push(REASONS.WAIT_GUARD_APPLIED);
    const provisionalIds = quartet.filter((p) => isProvisional(p, ratings, cfg.provisionalGames)).map((p) => p.id);
    if (provisionalIds.length > 0) reasons.push(REASONS.PROVISIONAL_RATING_USED);

    const { teamA, teamB } = chosen;
    const neverPartnered = [teamA, teamB].every((t) => !(players[t[0]]?.partnerCounts?.[t[1]] > 0));
    if (neverPartnered) reasons.push(REASONS.NEW_PARTNER);
    if (chosen.violations > 0) reasons.push(REASONS.FORCED_REPEAT_PARTNER);
    else if (stats.sawViolation) reasons.push(REASONS.REPEAT_PARTNER_AVOIDED);
    if (chosen.immediateOpponents === 0 && stats.sawImmediateOpponent) reasons.push(REASONS.REPEAT_OPPONENT_AVOIDED);
    if (chosen.imbalance <= TEAM_BALANCED_MAX_IMBALANCE) reasons.push(REASONS.TEAM_BALANCED);
    if (chosen.skillKnown) reasons.push(chosen.bothMixed ? REASONS.MIXED_SKILL_TEAM : REASONS.SKILL_FALLBACK);

    const pts = quartet.map((p) => pointsFor(p, ratings, cfg));
    const waits = quartet.map((p) => this.waitMinutes(p, now));
    const games = quartet.map((p) => p.games || 0);
    return {
      teamA,
      teamB,
      reasons,
      ranking: {
        anchorId: anchor.id,
        window: bestWindow === Infinity ? cfg.windowMax : Math.round(bestWindow),
        widened: widenedFinal,
        fixedPartners: chosen.fixedTeams,
        pointsRange: [Math.min(...pts), Math.max(...pts)],
        imbalance: chosen.imbalance,
        provisionalIds,
        skills: cfg.useSkillLabels === false ? quartet.map(() => null) : quartet.map((p) => skillOf(p)),
        forcedRepeatPartner: chosen.violations > 0,
      },
      fairness: {
        waitMinutesRange: [Math.round(Math.min(...waits)), Math.round(Math.max(...waits))],
        gamesRange: [Math.min(...games), Math.max(...games)],
        usedLookahead: false,
        guardRelaxed: reasons.includes(REASONS.REST_RELAXED),
        reason: "Adaptive Ranking Rotation: " + reasons.join(", "),
      },
    };
  }

  // could a 2 Beginner + 2 Intermediate quartet be formed from the anchor + arena?
  idealSkillPossible(anchor, base) {
    let b = 0, i = 0;
    for (const p of [anchor, ...base]) { const s = skillOf(p); if (s === "B") b++; else if (s === "I") i++; }
    return b >= 2 && i >= 2;
  }

  // Evaluates every (triple from candList) x (3 splits) legal under fixed-partner
  // rules and returns the lexicographically best option, or null.
  searchQuartets(candList, forcedIds, ctx) {
    const { players, ratings, recentMatchups, cfg, rankOf, fixedOf, anchor, stats, info, recentFours } = ctx;
    const n = candList.length;
    let best = null;
    const forcedList = candList.filter((p) => forcedIds.has(p.id));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const trio = [candList[i], candList[j], candList[k]];
      if (forcedList.some((f) => !trio.includes(f))) continue;
      const ids = [anchor.id, trio[0].id, trio[1].id, trio[2].id];
      // a fixed pair must be in the quartet together or not at all
      let okFixed = true;
      for (const id of ids) { const f = fixedOf.get(id); if (f && !ids.includes(f)) { okFixed = false; break; } }
      if (!okFixed) continue;
      const rankSum = trio.reduce((s, p) => s + rankOf.get(p.id), 0);
      // Points neighbourhood: how wide are the four Points values? (banded)
      const pts4 = [anchor, ...trio].map((p) => pointsFor(p, ratings, cfg));
      const spread = Math.max(...pts4) - Math.min(...pts4);
      const spreadBand = Math.max(0, Math.ceil(spread / cfg.pointsSpreadBand) - 1);
      const members = [anchor, ...trio];
      // games-gap guard: pairs (left-out candidate u, chosen member m) with m.games - u.games >= threshold
      let gamesSkips = 0;
      if (cfg.gamesGapThreshold > 0) {
        for (const u of candList) {
          if (trio.includes(u)) continue;
          for (const m of [anchor, ...trio]) if ((m.games || 0) - (u.games || 0) >= cfg.gamesGapThreshold) gamesSkips++;
        }
        if (gamesSkips > 0) stats.sawGamesSkip = true;
      }
      // calibration affinity: how compatible the organizer's rounds (and results) say these four are,
      // in coarse steps, only while the quartet's calibration confidence is still meaningful
      let affinityPenalty = 0;
      if (cfg.calibrationAffinityWeight > 0 && ctx.calibration) {
        const q4 = [anchor, ...trio];
        const avgGames = q4.reduce((s, p) => s + (p.games || 0), 0) / 4;
        const conf = Math.max(0, 1 - avgGames / cfg.calibrationDecayGames);
        if (conf >= 0.25) {
          const aff = ctx.calibration.quartetAffinity(q4.map((p) => p.id));
          affinityPenalty = Math.round((1 - aff) * 4 * Math.min(1, conf * cfg.calibrationAffinityWeight));
        }
      }
      const sameFour = recentFours.size > 0 && recentFours.has([anchor.id, trio[0].id, trio[1].id, trio[2].id].sort().join(",")) ? 1 : 0;
      if (sameFour) stats.sawSameFour = true;
      // wait-time guard: pairs (left-out legal candidate u, chosen member m)
      // where u has waited >= the guard gap longer than m
      let waitSkips = 0;
      if (cfg.waitGuardGapMinutes > 0) {
        for (const u of candList) {
          if (trio.includes(u)) continue;
          const uw = info.get(u.id).wait;
          for (const m of members) if (uw - info.get(m.id).wait >= cfg.waitGuardGapMinutes) waitSkips++;
        }
        if (waitSkips > 0) stats.sawWaitSkip = true;
      }
      const skills = cfg.useSkillLabels === false ? members.map(() => null) : members.map(skillOf);
      const skillKnown = skills.every((s) => s !== null);
      const homogeneous = skillKnown && new Set(skills).size === 1;
      for (const [teamA, teamB] of this.splitsOf(ids)) {
        // fixed partners must be teammates
        let splitOk = true;
        for (const t of [teamA, teamB]) for (const id of t) { const f = fixedOf.get(id); if (f && !t.includes(f)) splitOk = false; }
        if (!splitOk) continue;
        // c0 recent-partner violations (severity: last game 3, earlier in window 2)
        let violations = 0;
        for (const t of [teamA, teamB]) {
          if (fixedOf.get(t[0]) === t[1]) continue; // fixed partners are exempt
          violations += recentPartnerSeverity(players, t[0], t[1], cfg.recentPartnerWindow);
        }
        if (violations > 0) stats.sawViolation = true;
        // c1 team skill balance
        let skillPenalty = 0, bothMixed = false;
        if (skillKnown) {
          const val = (t) => t.reduce((s, id) => s + (skillOf(players[id]) === "I" ? 1 : 0), 0);
          skillPenalty = Math.abs(val(teamA) - val(teamB)) + (homogeneous ? cfg.homogeneousQuartetPenalty : 0);
          bothMixed = val(teamA) === 1 && val(teamB) === 1;
        }
        // c2 partner freshness (higher partnerScore = fresher) -> negate
        const freshness = -(partnerScore(teamA[0], teamA[1], players) + partnerScore(teamB[0], teamB[1], players));
        // c3/c4 opponents
        let immediate = 0, recentOpp = 0;
        for (const x of teamA) for (const y of teamB) {
          if (players[x]?.lastOpponentIds?.includes(y)) immediate++;
          else if (players[x]?.recentOpponentIds?.includes(y)) recentOpp++;
        }
        if (immediate > 0) stats.sawImmediateOpponent = true;
        const exact = recentMatchups && isRecentMatchup(recentMatchups, teamA, teamB) ? 1 : 0;
        // c5 team Points balance
        const sum = (t) => t.reduce((s, id) => s + pointsFor(players[id], ratings, cfg), 0);
        const imbalance = Math.abs(sum(teamA) - sum(teamB));
        // lexicographic order: hard partner ban, THEN Points neighbourhood (band),
        // THEN skill balance, partner freshness, opponents, team-sum balance,
        // fairness closeness. (widenWindowForSkill swaps band and skill.)
        const head = cfg.widenWindowForSkill ? [skillPenalty, spreadBand] : [spreadBand, skillPenalty];
        const balanceBand = cfg.teamBalanceBand > 0 ? Math.floor(imbalance / cfg.teamBalanceBand) : 0;
        const tuple = [violations, waitSkips, gamesSkips, sameFour, affinityPenalty, ...head, balanceBand, freshness, immediate, recentOpp * 1 + exact * 4, cfg.teamBalanceWeight * imbalance, rankSum];
        let fixedTeams = [];
        for (const t of [teamA, teamB]) if (fixedOf.get(t[0]) === t[1]) fixedTeams.push([...t]);
        if (!best || compareTuples(tuple, best.tuple) < 0) {
          best = { tuple, waitSkips, gamesSkips, sameFour, affinityPenalty, quartet: ids, teamA, teamB, violations, skillPenalty, skillKnown, bothMixed, immediateOpponents: immediate, imbalance, forcedCount: forcedList.length, spread, fixedPairs: fixedTeams.length, fixedTeams };
        }
      }
    }
    return best;
  }

  splitsOf(ids) {
    const [a, b, c, d] = ids;
    return [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
    ];
  }
}

// The distinct 4-player sets of the newest `window` entries of the session's
// bounded matchup memory (keys look like "a|b__vs__c|d"), as sorted-id strings.
export function recentQuartetSet(recentMatchups, window = RECENT_SAME_FOUR_WINDOW) {
  const out = new Set();
  if (!window || !recentMatchups) return out;
  for (const key of recentMatchups.slice(0, window)) {
    const ids = String(key).split("__vs__").flatMap((t) => t.split("|"));
    if (ids.length === 4) out.add(ids.sort().join(","));
  }
  return out;
}

export function skillOf(player) {
  if (player?.skill === "intermediate") return "I";
  if (player?.skill === "beginner") return "B";
  return null;
}

// 0 = not a recent partner pair; 3 = partnered in the immediately previous
// game; 2 = an earlier game still inside the configured window.
export function recentPartnerSeverity(players, a, b, window = RECENT_PARTNER_WINDOW) {
  const la = (players[a]?.recentPartnerIds || []).slice(0, window);
  const lb = (players[b]?.recentPartnerIds || []).slice(0, window);
  if (la[0] === b || lb[0] === a) return 3;
  if (la.includes(b) || lb.includes(a)) return 2;
  return 0;
}

function compareTuples(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
