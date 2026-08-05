// Session Analytics Engine (Sprint 4A / V1) — see PROJECT.md/FEATURES.md.
// Pure, headless, React-free: takes plain session state and returns a
// plain report object. The UI (SessionAnalyticsReport.jsx) only ever
// renders whatever this module returns — it never computes a metric
// itself. This is deliberate so the same functions can be unit-tested
// without a browser (see scripts/verify-session-analytics.mjs) and so a
// later sprint can persist/reopen/export the exact same shape without any
// of this module changing.
//
// V1 scope: compute + display only. No persistence, no export, no
// Session History integration — those are explicitly out of scope for
// this sprint (see FEATURES.md).
import { ROTATION_MODES } from "./constants.js";
import { derivePaymentStats } from "./queueManagement.js";

// ---------------------------------------------------------------------
// Waiting-time tracking — called from PickleballOpenPlay.jsx's save(),
// the single write path every action (manual assignment, Fill all open
// courts, Generate remaining courts, automatic Smart Court Dispatch)
// already funnels through. Purely additive bookkeeping layered AFTER
// dispatch/matchmaking has already decided who goes where — it never
// reads or influences any decision, only observes the before/after court
// diff. Nothing in Smart Queue Management, Smart Court Dispatch, or
// either rotation engine is touched by this.
// ---------------------------------------------------------------------

// A player counts as "on a court" (no longer waiting) the moment they're
// assigned — including "dispatching" (Smart Court Dispatch's "Calling
// Players..." state, before the announcement/Auto Start Match delay
// completes) and "finished" (awaiting End Match) — not just "live". The
// announcement delay is a transition delay, not time spent waiting in the
// queue, so the wait period ends at assignment, not at "Start Match".
const ON_COURT_STATUSES = new Set(["dispatching", "live", "finished"]);

// Below this, a transition from one court straight back onto another
// (Winner Pool Rotation's pooled regroup, or a lightning-fast facilitator
// with a very small waiting pool) counts as "no real wait" for the
// purposes of the consecutive-play-streak metric, rather than resetting
// it to 1. One minute comfortably exceeds a same-save-cycle regroup while
// still being well under any realistic queue wait.
const NO_REAL_WAIT_THRESHOLD_MS = 60 * 1000;

function playingIdsFromCourts(courts) {
  const ids = new Set();
  (courts || []).forEach((c) => {
    if (!ON_COURT_STATUSES.has(c.status)) return;
    (c.teamA || []).forEach((id) => ids.add(id));
    (c.teamB || []).forEach((id) => ids.add(id));
  });
  return ids;
}

// Diffs `prevCourts` (the court layout right before this save) against
// `nextCourts` (right after matchmaking/dispatch this save cycle) and
// returns an updated `players` map with wait-time/play-streak bookkeeping
// applied for every player who just transitioned from waiting onto a
// court. Returns the SAME `players` reference unchanged if nothing
// transitioned this save (the common case — most saves don't dispatch
// anyone), so callers can skip an unnecessary object spread.
export function applyWaitingTimeTracking(prevCourts, nextCourts, players, now = Date.now()) {
  const prevPlayingIds = playingIdsFromCourts(prevCourts);
  const nextPlayingIds = playingIdsFromCourts(nextCourts);

  let updated = players;
  let changed = false;
  for (const id of nextPlayingIds) {
    if (prevPlayingIds.has(id)) continue; // already on a court before this save — not a new transition
    const p = players[id];
    if (!p) continue;
    const since = p.lastMatchEndAt || p.checkedInAt;
    if (!since) continue; // no reference point yet — shouldn't normally happen for a dispatched player, but never throw over it

    const waitMs = Math.max(0, now - since);
    const noRealWait = waitMs < NO_REAL_WAIT_THRESHOLD_MS;
    const nextPlayStreak = noRealWait ? (p.currentPlayStreak || 0) + 1 : 1;

    if (!changed) updated = { ...players };
    changed = true;
    updated[id] = {
      ...p,
      totalWaitMs: (p.totalWaitMs || 0) + waitMs,
      longestWaitMs: Math.max(p.longestWaitMs || 0, waitMs),
      waitPeriodsCount: (p.waitPeriodsCount || 0) + 1,
      currentPlayStreak: nextPlayStreak,
      longestPlayStreak: Math.max(p.longestPlayStreak || 0, nextPlayStreak),
    };
  }
  return updated;
}

// ---------------------------------------------------------------------
// Report computation
// ---------------------------------------------------------------------

function average(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function stdDev(nums, avg) {
  if (nums.length === 0) return 0;
  const variance = nums.reduce((s, n) => s + (n - avg) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

// Coefficient-of-variation-based 0-100 score — 100 = perfectly even,
// lower = more spread relative to the average. Same formula
// RotationSimulationEngine.js's calculateFairnessStats already uses for
// games played; reused here (not reimplemented differently) and applied
// a second time, unmodified, to waiting time, so the app has ONE
// consistent definition of "fairness" rather than two different ones.
function fairnessScoreFromCV(avg, sd) {
  const cv = avg > 0 ? sd / avg : 0;
  return Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));
}

const MINUTE_MS = 60 * 1000;
function toMinutes(ms) {
  return Math.round((ms / MINUTE_MS) * 10) / 10;
}

// Participants for every stat below: players who actually checked in at
// some point this session. A registered-but-never-checked-in player has
// trivially 0 games/0 wait data and would corrupt "lowest games played"/
// stdDev/diversity with a meaningless data point they were never present
// for.
function participantsOf(players) {
  return Object.values(players || {}).filter((p) => p && p.checkedInAt != null);
}

function computeParticipation(participants) {
  const games = participants.map((p) => p.games || 0);
  const avgGames = average(games);
  const sd = stdDev(games, avgGames);
  return {
    averageGames: Math.round(avgGames * 100) / 100,
    highestGames: games.length ? Math.max(...games) : 0,
    lowestGames: games.length ? Math.min(...games) : 0,
    stdDevGames: Math.round(sd * 100) / 100,
    // Renamed per explicit direction — never call this simply "Fairness
    // Score" elsewhere in the app; this is specifically the games-played
    // dimension of fairness, one of several inputs to the overall Session
    // Grade below.
    gamesFairnessScore: fairnessScoreFromCV(avgGames, sd),
  };
}

function computeWaiting(participants) {
  const withPeriods = participants.filter((p) => (p.waitPeriodsCount || 0) > 0);
  // Average Waiting Time: mean of each player's OWN average wait length
  // (mean-of-means) — "how long does a typical wait feel to a typical
  // player."
  const perPlayerAvgWaitMs = withPeriods.map((p) => p.totalWaitMs / p.waitPeriodsCount);
  const avgWaitMs = average(perPlayerAvgWaitMs);
  const longestWaitMs = participants.length ? Math.max(0, ...participants.map((p) => p.longestWaitMs || 0)) : 0;
  // Average Time Between Games: a pooled (weighted) average across every
  // completed wait period session-wide, not a mean-of-means — a
  // deliberately different, complementary view of the same underlying
  // data (a few players with many short waits pull this one down more
  // than they'd pull the mean-of-means down).
  const totalWaitMsAll = withPeriods.reduce((s, p) => s + p.totalWaitMs, 0);
  const totalPeriodsAll = withPeriods.reduce((s, p) => s + p.waitPeriodsCount, 0);
  const avgTimeBetweenGamesMs = totalPeriodsAll > 0 ? totalWaitMsAll / totalPeriodsAll : 0;

  const waitMsList = withPeriods.map((p) => p.totalWaitMs);
  const avgTotalWaitMs = average(waitMsList);
  const sdTotalWaitMs = stdDev(waitMsList, avgTotalWaitMs);

  return {
    averageWaitMinutes: toMinutes(avgWaitMs),
    longestWaitMinutes: toMinutes(longestWaitMs),
    averageTimeBetweenGamesMinutes: toMinutes(avgTimeBetweenGamesMs),
    // used by the Session Grade below, not shown as its own headline
    // number in V1's report — same CV formula as Games Fairness Score,
    // applied to total accumulated wait time instead of games played.
    _waitingFairnessScore: fairnessScoreFromCV(avgTotalWaitMs, sdTotalWaitMs),
  };
}

function computeDiversity(participants) {
  const withGames = participants.filter((p) => (p.games || 0) > 0);
  const partnerDiversity = withGames.map((p) => Object.keys(p.partnerCounts || {}).length);
  const opponentDiversity = withGames.map((p) => Object.keys(p.opponentCounts || {}).length);
  const avgUniquePartners = average(partnerDiversity);
  const avgUniqueOpponents = average(opponentDiversity);

  // Normalized 0-1 ratios against the theoretical max given games played —
  // used only by the Session Grade below (a player who played N games has
  // at most N possible unique partners and 2N possible unique opponents,
  // doubles pickleball always having exactly 2 opponents per game).
  const partnerRatios = withGames.map((p) => {
    const games = p.games || 0;
    const unique = Object.keys(p.partnerCounts || {}).length;
    return games > 0 ? Math.min(1, unique / games) : 0;
  });
  const opponentRatios = withGames.map((p) => {
    const games = p.games || 0;
    const unique = Object.keys(p.opponentCounts || {}).length;
    return games > 0 ? Math.min(1, unique / (games * 2)) : 0;
  });

  return {
    averageUniquePartners: Math.round(avgUniquePartners * 100) / 100,
    averageUniqueOpponents: Math.round(avgUniqueOpponents * 100) / 100,
    _diversityScore: Math.round(((average(partnerRatios) + average(opponentRatios)) / 2) * 100),
  };
}

// Adaptive Skill Rotation only — counts derived from skillChangeLog
// entries. `source` ("automatic"/"manual") was added to every new entry
// specifically so this can be computed reliably; legacy entries from
// before that field existed fall back to matching `reason` text, purely
// so a session begun before this sprint still reports something sane.
function computeAdaptive(skillChangeLog) {
  const entries = skillChangeLog || [];
  const isAutomatic = (e) => e.source ? e.source === "automatic" : /consecutive/.test(e.reason || "");
  let promotions = 0;
  let relegations = 0;
  let automaticChanges = 0;
  let manualChanges = 0;
  entries.forEach((e) => {
    if (e.newSkill === "intermediate") promotions++;
    else if (e.newSkill === "beginner") relegations++;
    if (isAutomatic(e)) automaticChanges++;
    else manualChanges++;
  });
  return { promotions, relegations, automaticChanges, manualChanges };
}

// Players Needing Attention — simple, explainable threshold rules (not a
// black-box score) so a facilitator can see exactly WHY someone is
// flagged. A player can appear with more than one reason.
function computePlayersNeedingAttention(participants) {
  if (participants.length === 0) return [];

  const games = participants.map((p) => p.games || 0);
  const minGames = Math.min(...games);
  const withWait = participants.filter((p) => (p.waitPeriodsCount || 0) > 0);
  const longestWaitMs = withWait.length ? Math.max(...withWait.map((p) => p.longestWaitMs || 0)) : 0;
  const longestPlayStreak = Math.max(0, ...participants.map((p) => p.longestPlayStreak || 0));

  const flagged = new Map();
  const flag = (p, reason) => {
    if (!flagged.has(p.id)) flagged.set(p.id, { playerId: p.id, playerName: p.name, reasons: [] });
    flagged.get(p.id).reasons.push(reason);
  };

  participants.forEach((p) => {
    if (minGames < average(games) && (p.games || 0) === minGames) {
      flag(p, `Fewest games played (${p.games || 0})`);
    }
    if (longestWaitMs > 0 && (p.longestWaitMs || 0) === longestWaitMs) {
      flag(p, `Longest single wait (${toMinutes(longestWaitMs)} min)`);
    }
    // "longest consecutive waiting streak" is the same underlying figure
    // as "longest single wait" (both mean the longest unbroken stretch a
    // player spent off any court) — reported once, not duplicated, per
    // player.
    if (longestPlayStreak >= 3 && (p.longestPlayStreak || 0) === longestPlayStreak) {
      flag(p, `Longest consecutive playing streak (${longestPlayStreak} matches in a row)`);
    }
  });

  return Array.from(flagged.values());
}

// Session Grade — extensible by design (explicit sprint requirement): a
// named, exported weights table combines independent 0-100 sub-scores,
// and a separate named band table maps the result to a label. Adding a
// future sub-score (e.g. a court-utilization score) means adding one line
// to SESSION_GRADE_WEIGHTS, not redesigning this function or the report
// shape.
export const SESSION_GRADE_WEIGHTS = {
  gamesFairness: 0.6,
  waitingFairness: 0.3,
  diversity: 0.1,
};

export const SESSION_GRADE_BANDS = [
  { min: 95, label: "Excellent" },
  { min: 90, label: "Very Good" },
  { min: 80, label: "Good" },
  { min: 70, label: "Fair" },
  { min: 0, label: "Needs Improvement" },
];

export function gradeLabelForScore(score) {
  return (SESSION_GRADE_BANDS.find((b) => score >= b.min) || SESSION_GRADE_BANDS[SESSION_GRADE_BANDS.length - 1]).label;
}

function computeSessionGrade(subScores) {
  const weighted =
    subScores.gamesFairness * SESSION_GRADE_WEIGHTS.gamesFairness +
    subScores.waitingFairness * SESSION_GRADE_WEIGHTS.waitingFairness +
    subScores.diversity * SESSION_GRADE_WEIGHTS.diversity;
  const score = Math.round(weighted);
  return { score, label: gradeLabelForScore(score) };
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const totalMinutes = Math.round(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// The one entry point the UI calls. `state` is the live session state
// exactly as PickleballOpenPlay.jsx holds it — this function never
// mutates it, never touches storage, and never renders anything; it just
// reads and returns numbers.
export function computeSessionAnalyticsReport(state, generatedAt = Date.now()) {
  const participants = participantsOf(state.players);
  const participation = computeParticipation(participants);
  const waiting = computeWaiting(participants);
  const diversity = computeDiversity(participants);
  const isAdaptive = state.rotationMode === "adaptiveSkill";
  const adaptive = isAdaptive ? computeAdaptive(state.skillChangeLog) : null;
  const playersNeedingAttention = computePlayersNeedingAttention(participants);

  const grade = computeSessionGrade({
    gamesFairness: participation.gamesFairnessScore,
    waitingFairness: waiting._waitingFairnessScore,
    diversity: diversity._diversityScore,
  });

  const durationMs = state.sessionStartedAt ? generatedAt - state.sessionStartedAt : null;
  const rotationModeLabel = ROTATION_MODES.find((m) => m.value === state.rotationMode)?.label || state.rotationMode;

  return {
    generatedAt,
    sessionSummary: {
      venue: state.venue || "",
      rotationMode: state.rotationMode,
      rotationModeLabel,
      courtsCount: (state.courts || []).length,
      playersCount: participants.length,
      startedAt: state.sessionStartedAt || null,
      durationMs,
      durationLabel: formatDuration(durationMs),
    },
    participation: {
      averageGames: participation.averageGames,
      highestGames: participation.highestGames,
      lowestGames: participation.lowestGames,
      stdDevGames: participation.stdDevGames,
      gamesFairnessScore: participation.gamesFairnessScore,
    },
    waiting: {
      averageWaitMinutes: waiting.averageWaitMinutes,
      longestWaitMinutes: waiting.longestWaitMinutes,
      averageTimeBetweenGamesMinutes: waiting.averageTimeBetweenGamesMinutes,
    },
    diversity: {
      averageUniquePartners: diversity.averageUniquePartners,
      averageUniqueOpponents: diversity.averageUniqueOpponents,
    },
    adaptive, // null unless rotationMode === "adaptiveSkill"
    playersNeedingAttention,
    // Player Payment Tracking — see PROJECT.md/FEATURES.md. Purely
    // additive: reuses the same derivePaymentStats (lib/queueManagement.js)
    // the Scorer tab's own stats panel reads, so this can never drift out
    // of sync with it. Facilitator reference only — never fed back into
    // gamesFairnessScore/waiting/diversity/grade above, all of which are
    // computed identically to before this field existed.
    payment: derivePaymentStats(state.players),
    grade,
  };
}
