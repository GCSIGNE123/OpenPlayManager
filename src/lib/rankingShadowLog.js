// Adaptive Ranking Rotation — SHADOW LOG (pure helpers + a tiny browser-local
// wrapper). Evidence collection only: it records what Adaptive Skill Rotation
// (the real production engine) actually had queued versus what Adaptive
// Ranking Rotation WOULD have proposed from the same state. Nothing here
// touches the live session, Supabase, or any network API — observations live
// only in this browser's localStorage (scorer device), capped, oldest evicted
// first, compact ids only (no player objects, no names, no photos).
import { isEligibleForMatchmaking } from "./utils.js";

export const SHADOW_LOG_KEY = "pk-shadow-log-v1";
export const SHADOW_DISABLED_KEY = "pk-shadow-disabled"; // set to "1" to turn shadow mode off on this device
export const SHADOW_LOG_MAX = 500;
export const SHADOW_ACTUAL_ENGINE = "adaptiveSkill";
export const SHADOW_ENGINE = "adaptiveRanking";

// ---------- what counts as a meaningful scheduling change ----------

export function schedulingParts(state) {
  const players = state.players || {};
  const queueIds = state.queueIds || [];
  const eligible = queueIds.filter((id) => players[id] && isEligibleForMatchmaking(players[id])).slice().sort().join(",");
  return {
    matchups: (state.nextMatchups || []).map((m) => `${m.id}:${(m.teamA || []).join("-")}|${(m.teamB || []).join("-")}`).join(","),
    courts: (state.courts || []).map((c) => `${c.number}:${c.status}:${(c.teamA || []).join("-")}|${(c.teamB || []).join("-")}`).join(","),
    eligible,
    history: (state.matchHistory || []).length,
  };
}

// Returns a trigger label, or null when nothing scheduling-relevant changed
// (so ordinary saves — timers, waiting-time bookkeeping, score edits — never
// produce an observation).
export function classifyTrigger(prev, next, hint = null) {
  if (!prev) return hint || "session_observed";
  if (hint && (prev.matchups !== next.matchups || prev.courts !== next.courts || prev.eligible !== next.eligible)) return hint;
  if (next.history > prev.history) return "match_ended";
  if (prev.courts !== next.courts) return "matchup_dispatched";
  if (prev.eligible !== next.eligible) {
    const a = new Set(prev.eligible.split(",").filter(Boolean)), b = new Set(next.eligible.split(",").filter(Boolean));
    const added = [...b].some((id) => !a.has(id)), removed = [...a].some((id) => !b.has(id));
    return added && !removed ? "player_available" : removed && !added ? "player_unavailable" : "queue_changed";
  }
  if (prev.matchups !== next.matchups) return "matchups_refreshed";
  return null;
}

// ---------- observation building ----------

const skillOfPlayer = (p) => (p?.skill === "intermediate" ? "I" : p?.skill === "beginner" ? "B" : null);
const round1 = (x) => Math.round(x * 10) / 10;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// stats for one side (actual or proposed) over a list of [teamA, teamB]
export function matchupStats(matchups, players, points, now) {
  const ids = [...new Set(matchups.flatMap(([a, b]) => [...a, ...b]))];
  const games = ids.map((id) => players[id]?.games || 0);
  const waits = ids.map((id) => {
    const p = players[id];
    const since = p?.lastMatchEndAt ?? p?.checkedInAt ?? now;
    return (now - since) / 60000;
  });
  let mixed = 0, partnerRepeat = 0, opponentRepeat = 0;
  const ranges = [], imbalances = [];
  for (const [a, b] of matchups) {
    const val = (t) => t.map((id) => skillOfPlayer(players[id]));
    const sa = val(a), sb = val(b);
    if ([...sa, ...sb].every((s) => s !== null) && sa.includes("B") && sa.includes("I") && sb.includes("B") && sb.includes("I")) mixed++;
    if ([a, b].some((t) => (players[t[0]]?.recentPartnerIds || []).slice(0, 2).includes(t[1]) || (players[t[1]]?.recentPartnerIds || []).slice(0, 2).includes(t[0]))) partnerRepeat++;
    if (a.some((x) => b.some((y) => players[x]?.lastOpponentIds?.includes(y)))) opponentRepeat++;
    const pts = [...a, ...b].map((id) => points[id] ?? 1000);
    ranges.push(Math.max(...pts) - Math.min(...pts));
    imbalances.push(Math.abs(a.reduce((s, id) => s + (points[id] ?? 1000), 0) - b.reduce((s, id) => s + (points[id] ?? 1000), 0)));
  }
  return {
    count: matchups.length,
    avgGames: round1(mean(games)),
    maxGames: games.length ? Math.max(...games) : 0,
    gamesSpread: games.length ? Math.max(...games) - Math.min(...games) : 0,
    avgWait: round1(mean(waits)),
    maxWait: waits.length ? round1(Math.max(...waits)) : 0,
    mixed,
    partnerRepeat,
    opponentRepeat,
    pointsRange: round1(mean(ranges)),
    imbalance: round1(mean(imbalances)),
  };
}

const adaptiveSkillReasonCodes = (fairness) => {
  if (!fairness) return ["FAIRNESS_PRIORITY"];
  const out = [];
  if (fairness.guardRelaxed) out.push("REST_GUARD_RELAXED");
  if (fairness.usedLookahead) out.push("LOOKAHEAD_USED");
  if (out.length === 0) out.push("FAIRNESS_PRIORITY");
  return out;
};

const teamKey = (t) => [...t].sort().join("+");
const matchKey = (a, b) => [teamKey(a), teamKey(b)].sort().join("~");

// comparisons: computeShadowComparison(...).comparisons. players: the LIVE
// session players (read only). points: id -> shadow Points used for the
// proposal. Everything stored is compact ids / numbers / reason codes.
export function buildShadowObservation({ state, comparisons, points = {}, trigger, sessionCode, ratingsAvailable, provisionalCount = 0, now = Date.now() }) {
  const players = state.players || {};
  const actual = comparisons.filter((c) => c.current).map((c) => [c.current.teamA, c.current.teamB]);
  const proposedItems = comparisons.filter((c) => c.proposed);
  const proposed = proposedItems.map((c) => [c.proposed.teamA, c.proposed.teamB]);
  const actualIds = new Set(actual.flatMap(([a, b]) => [...a, ...b]));
  const proposedIds = new Set(proposed.flatMap(([a, b]) => [...a, ...b]));
  const samePlayers = actualIds.size === proposedIds.size && [...actualIds].every((id) => proposedIds.has(id));
  const proposedKeys = new Set(proposed.map(([a, b]) => matchKey(a, b)));
  const sameTeams = actual.length === proposed.length && actual.every(([a, b]) => proposedKeys.has(matchKey(a, b)));
  const differingPlayers = [...new Set([...[...actualIds].filter((id) => !proposedIds.has(id)), ...[...proposedIds].filter((id) => !actualIds.has(id))])];
  const shadowReasons = proposedItems.map((c) => c.proposed.reasons || []);
  const a = matchupStats(actual, players, points, now);
  const s = matchupStats(proposed, players, points, now);
  const count = (code) => shadowReasons.filter((r) => r.includes(code)).length;
  return {
    timestamp: now,
    sessionCode: sessionCode || null,
    trigger,
    actualEngine: SHADOW_ACTUAL_ENGINE,
    shadowEngine: SHADOW_ENGINE,
    actualMatchups: actual,
    proposedMatchups: proposed,
    samePlayers,
    sameTeams,
    differingPlayers,
    actualReasons: comparisons.filter((c) => c.current).map((c) => adaptiveSkillReasonCodes(c.current.fairness)),
    shadowReasons,
    ratingsAvailable: Boolean(ratingsAvailable),
    metrics: {
      actualMatchCount: a.count, shadowMatchCount: s.count,
      actualAvgGames: a.avgGames, shadowAvgGames: s.avgGames,
      actualMaxGames: a.maxGames, shadowMaxGames: s.maxGames,
      actualGamesSpread: a.gamesSpread, shadowGamesSpread: s.gamesSpread,
      actualAvgWait: a.avgWait, shadowAvgWait: s.avgWait,
      actualMaxWait: a.maxWait, shadowMaxWait: s.maxWait,
      actualMixedSkillMatchCount: a.mixed, shadowMixedSkillMatchCount: s.mixed,
      actualRecentPartnerRepeats: a.partnerRepeat, shadowRecentPartnerRepeats: s.partnerRepeat,
      actualRecentOpponentRepeats: a.opponentRepeat, shadowRecentOpponentRepeats: s.opponentRepeat,
      actualPointsRange: a.pointsRange, shadowPointsRange: s.pointsRange,
      actualImbalance: a.imbalance, shadowImbalance: s.imbalance,
      shadowForcedPartnerRepeats: count("FORCED_REPEAT_PARTNER"),
      shadowForcedSkillFallbacks: count("SKILL_FALLBACK"),
      provisionalPlayers: provisionalCount,
    },
  };
}

// Structural sanity check — a malformed observation is dropped, never logged.
export function isValidObservation(o) {
  const nums = ["actualMatchCount", "shadowMatchCount", "actualAvgGames", "shadowAvgGames", "actualMaxWait", "shadowMaxWait"];
  return Boolean(o) && typeof o.timestamp === "number" && typeof o.trigger === "string"
    && Array.isArray(o.actualMatchups) && Array.isArray(o.proposedMatchups)
    && typeof o.samePlayers === "boolean" && typeof o.sameTeams === "boolean"
    && Boolean(o.metrics) && nums.every((k) => Number.isFinite(o.metrics[k]));
}

// ---------- bounded log (pure) ----------

export function appendShadowObservation(log, observation, max = SHADOW_LOG_MAX) {
  const next = [...(Array.isArray(log) ? log : []), observation];
  return next.length > max ? next.slice(next.length - max) : next; // oldest evicted first
}

export function exportShadowJson(log) {
  return JSON.stringify({ format: "pk-shadow-log", version: 1, count: (log || []).length, observations: log || [] });
}

// ---------- summary (pure) — evidence only, no scoring / winner label ----------

export function summarizeShadowLog(log) {
  const obs = (log || []).filter(Boolean);
  const n = obs.length;
  const rate = (pred) => (n ? obs.filter(pred).length / n : 0);
  const sum = (key) => obs.reduce((s, o) => s + (o.metrics?.[key] || 0), 0);
  const avg = (key) => (n ? sum(key) / n : 0);
  const side = (p) => {
    const matches = sum(`${p}MatchCount`);
    return {
      matchups: matches,
      avgGamesSpread: round1(avg(`${p}GamesSpread`)),
      avgMaxGames: round1(avg(`${p}MaxGames`)),
      avgMaxWait: round1(avg(`${p}MaxWait`)),
      avgWait: round1(avg(`${p}AvgWait`)),
      mixedSkillPct: matches ? round1((100 * sum(`${p}MixedSkillMatchCount`)) / matches) : 0,
      recentPartnerRepeatRate: matches ? round1((100 * sum(`${p}RecentPartnerRepeats`)) / matches) : 0,
      recentOpponentRepeatRate: matches ? round1((100 * sum(`${p}RecentOpponentRepeats`)) / matches) : 0,
      avgPointsRange: round1(avg(`${p}PointsRange`)),
      avgTeamImbalance: round1(avg(`${p}Imbalance`)),
    };
  };
  const triggers = {};
  obs.forEach((o) => { triggers[o.trigger] = (triggers[o.trigger] || 0) + 1; });
  return {
    decisions: n,
    agreementRate: round1(100 * rate((o) => o.samePlayers)),
    teamCompositionAgreementRate: round1(100 * rate((o) => o.sameTeams)),
    actual: side("actual"),
    shadow: { ...side("shadow"), forcedPartnerRepeats: sum("shadowForcedPartnerRepeats"), forcedSkillFallbacks: sum("shadowForcedSkillFallbacks") },
    decisionsWithoutRatings: obs.filter((o) => !o.ratingsAvailable).length,
    triggers,
    sessions: [...new Set(obs.map((o) => o.sessionCode).filter(Boolean))],
    firstTimestamp: n ? obs[0].timestamp : null,
    lastTimestamp: n ? obs[n - 1].timestamp : null,
  };
}

// ---------- browser-local wrapper (localStorage ONLY) ----------

function defaultStorage() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; }
}

export function isShadowEnabled(storage = defaultStorage()) {
  try { return storage?.getItem(SHADOW_DISABLED_KEY) !== "1"; } catch (e) { return true; }
}

export function readShadowLog(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(SHADOW_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function recordShadowObservation(storage = defaultStorage(), observation, max = SHADOW_LOG_MAX) {
  if (!storage || !isValidObservation(observation)) return false;
  let log = appendShadowObservation(readShadowLog(storage), observation, max);
  try {
    storage.setItem(SHADOW_LOG_KEY, JSON.stringify(log));
    return true;
  } catch (e) {
    // storage full: keep the newest half and retry once
    try {
      log = log.slice(Math.floor(log.length / 2));
      storage.setItem(SHADOW_LOG_KEY, JSON.stringify(log));
      return true;
    } catch (e2) {
      return false;
    }
  }
}

export function clearShadowLog(storage = defaultStorage()) {
  try { storage?.removeItem(SHADOW_LOG_KEY); return true; } catch (e) { return false; }
}

// Developer-only console helpers (window.pkShadow) — never rendered in the UI.
export function installShadowDevTools(win, storage = defaultStorage()) {
  if (!win) return null;
  win.pkShadow = {
    summary: () => summarizeShadowLog(readShadowLog(storage)),
    exportJson: () => exportShadowJson(readShadowLog(storage)),
    clear: () => clearShadowLog(storage),
    count: () => readShadowLog(storage).length,
    disable: () => { try { storage?.setItem(SHADOW_DISABLED_KEY, "1"); } catch (e) { /* ignore */ } },
    enable: () => { try { storage?.removeItem(SHADOW_DISABLED_KEY); } catch (e) { /* ignore */ } },
  };
  return win.pkShadow;
}
