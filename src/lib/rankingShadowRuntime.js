// Adaptive Ranking Rotation — SHADOW RUNTIME.
//
// Wires shadow mode into a running Open Play session WITHOUT changing what
// players receive: Adaptive Skill Rotation stays the real engine; this only
// (1) notices a meaningful scheduling change, (2) after a short debounce,
// computes what Adaptive Ranking Rotation would have proposed from the same
// state, (3) verifies the live state was not touched, and (4) appends one
// compact observation to a browser-local log (lib/rankingShadowLog.js).
//
// Egress rules: no Realtime subscription, no polling, no writes of any kind
// to Supabase / opl_kv / opl-session. The ONLY network access is the existing
// Phase 1 bulk rating lookup (fetchPlayerRatingsBulk — one `key IN (...)`
// query), made at most once per batch of player ids not yet looked up; a
// failed lookup is never retried for the same ids (they fall back to the
// provisional 1000 seed and the observation records ratingsAvailable=false).
import { fetchPlayerRatingsBulk } from "./ratingModel.js";
import { computeShadowComparison } from "./rankingShadow.js";
import { RANKING_WINNER_DELTA, RANKING_LOSER_DELTA, DEFAULT_RANKING_POINTS } from "./rankingSnapshot.js";
import { isProvisional } from "../engines/AdaptiveRankingRotationEngine.js";
import {
  SHADOW_ACTUAL_ENGINE, SHADOW_LOG_MAX, buildShadowObservation, classifyTrigger, isShadowEnabled, isValidObservation,
  recordShadowObservation, schedulingParts,
} from "./rankingShadowLog.js";

export const SHADOW_DEBOUNCE_MS = 1500;

// Cheap fingerprint of everything shadow mode must NOT change: the scheduling
// slices of state plus the scalar fields of every player (never photos).
export function stateFingerprint(state) {
  const players = state.players || {};
  const ids = Object.keys(players).sort();
  const p = ids.map((id) => {
    const x = players[id] || {};
    return [id, x.games, x.wins, x.losses, x.skill, x.held, x.status, x.playStatus, x.lastMatchEndAt, x.checkedInAt, x.lastResult, x.rankingPoints, x.rankingSource, (x.recentPartnerIds || []).join(">"), (x.lastOpponentIds || []).join(">")].join("|");
  }).join(";");
  return JSON.stringify([state.nextMatchups, state.queueIds, state.courts, (state.matchHistory || []).length, state.recentMatchups, state.rotationMode]) + "#" + p;
}

export function createShadowRuntime({ storage, fetchBulk = fetchPlayerRatingsBulk, now = () => Date.now(), max = SHADOW_LOG_MAX, debounceMs = SHADOW_DEBOUNCE_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const cache = new Map(); // id -> { rating, wins, losses, rated }
  const attempted = new Set();
  let lastParts = null;
  let timer = null;
  let pending = null;
  let ratingsUnavailable = false;

  // ONE bulk lookup for ids never looked up before (never per player, never repeated)
  async function ensureRatings(players) {
    const ids = Object.keys(players || {}).filter((id) => !attempted.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => attempted.add(id));
    let ratings = null;
    try {
      ratings = await fetchBulk(ids);
    } catch (e) {
      ratingsUnavailable = true;
    }
    for (const id of ids) {
      const p = players[id];
      const rec = ratings?.[id];
      // session results so far are already reflected in a stored rating for
      // players who played (Club Rating Engine's async writes), so Points are
      // mirrored forward from THIS moment: base + 15*(wins-losses since now)
      cache.set(id, { rating: rec && typeof rec.currentRating === "number" ? rec.currentRating : DEFAULT_RANKING_POINTS, wins: p?.wins || 0, losses: p?.losses || 0, rated: Boolean(rec && typeof rec.currentRating === "number") });
    }
  }

  // read-only Points view: copies of player objects carrying a shadow Points snapshot
  function pointsView(players) {
    const view = {};
    const points = {};
    for (const id of Object.keys(players || {})) {
      const p = players[id];
      const c = cache.get(id);
      if (!c) { view[id] = p; points[id] = DEFAULT_RANKING_POINTS; continue; }
      const pts = c.rating + RANKING_WINNER_DELTA * Math.max(0, (p.wins || 0) - c.wins) + RANKING_LOSER_DELTA * Math.max(0, (p.losses || 0) - c.losses);
      view[id] = { ...p, rankingPoints: pts, rankingSource: c.rated ? "rated" : "provisional" };
      points[id] = pts;
    }
    return { view, points };
  }

  // Compute + verify + log one observation. Never throws; never mutates `state`.
  async function observe(state, { trigger, sessionCode } = {}) {
    try {
      const before = stateFingerprint(state);
      await ensureRatings(state.players);
      const { view, points } = pointsView(state.players);
      const actualCount = (state.nextMatchups || []).length;
      const comparison = computeShadowComparison(state, { actual: "live", maxMatchups: Math.max(1, actualCount), rankingPlayers: view, now: now() });
      if (stateFingerprint(state) !== before) return { ok: false, reason: "state_changed_during_shadow" };
      const provisionalCount = comparison.comparisons.filter((c) => c.proposed).flatMap((c) => [...c.proposed.teamA, ...c.proposed.teamB]).filter((id) => isProvisional(view[id])).length;
      const ids = Object.keys(state.players || {});
      const ratingsAvailable = !ratingsUnavailable && ids.some((id) => cache.get(id)?.rated);
      const observation = buildShadowObservation({ state, comparisons: comparison.comparisons, points, trigger: trigger || "unspecified", sessionCode, ratingsAvailable, provisionalCount, now: now() });
      if (!isValidObservation(observation)) return { ok: false, reason: "malformed_observation" };
      const stored = recordShadowObservation(storage, observation, max);
      return { ok: stored, observation };
    } catch (e) {
      return { ok: false, reason: "shadow_error", error: String(e?.message || e) };
    }
  }

  // Called after ANY state change; does nothing unless the change is a
  // meaningful scheduling decision (see classifyTrigger), and coalesces bursts
  // into one observation via a debounce. No timers run while idle.
  function notify(state, { hint = null, sessionCode = null } = {}) {
    try {
      if (!state || state.rotationMode !== SHADOW_ACTUAL_ENGINE) return null;
      if (state.sessionType && state.sessionType !== "openPlay") return null;
      if (!isShadowEnabled(storage)) return null;
      const parts = schedulingParts(state);
      const trigger = classifyTrigger(lastParts, parts, hint);
      lastParts = parts;
      if (!trigger) return null;
      pending = { state, trigger: pending?.trigger && pending.trigger !== trigger ? `${pending.trigger}+${trigger}`.split("+").slice(-3).join("+") : trigger, sessionCode };
      if (timer) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        const job = pending;
        pending = null;
        if (job) observe(job.state, { trigger: job.trigger, sessionCode: job.sessionCode });
      }, debounceMs);
      return trigger;
    } catch (e) {
      return null;
    }
  }

  function dispose() {
    if (timer) clearTimer(timer);
    timer = null;
    pending = null;
  }

  return { observe, notify, dispose, _cache: cache };
}
