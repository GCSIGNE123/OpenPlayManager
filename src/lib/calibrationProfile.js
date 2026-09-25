// Calibration Profile — SESSION-LOCAL, TEMPORARY matchmaking information for
// Points-Based Adaptive Matchmaking. It is deliberately separate from the
// player's long-term Open Play Points:
//
//   Open Play Points   players[id].rankingPoints  persistent rating (mirrors the
//                                                 Club Rating Engine, flat/Elo
//                                                 K unchanged). NEVER touched here.
//   Calibration        players[id].calibratedPoints  session-only estimate the
//                                                 engine's Points neighbourhood /
//                      state.calibrationEvidence      team balance read while
//                      state.calibrationProfile       Points are still immature.
//
// WHAT THE ORGANIZER'S ROUNDS 1-2 CONTRIBUTE
//   The matches the organizer builds by hand are kept as EVIDENCE (who shared a
//   court, who was teammate / opponent, result, margin, Points at the time).
//   The grouping is not a label and awards no Points. It is used two ways:
//     1. As a weak prior inside the session strength fit: the two teams on an
//        organizer court are pseudo-observed as a near TIE (weight
//        `tieWeight`), i.e. "the organizer thought these four were reasonably
//        compatible", which shrinks noisy single results toward each other.
//     2. As a soft AFFINITY between players (shared court = compatible;
//        friend-of-a-compatible-player = a little; everyone else neutral) that
//        the engine may use, only while calibration confidence is high, to
//        prefer compatible quartets — never to recreate the same four (the
//        exact calibration fours are on a permanent ban list).
//
// STRENGTH ESTIMATE
//   A regularised (MAP) Bradley-Terry / Elo-scale fit over EVERY completed
//   session match plus the organizer tie prior, re-solved from scratch after each
//   match (so result order does not matter and information propagates across
//   everyone who has met). The prior mean is the player's Points at session
//   start (`rankingPointsSeed`, else 1000) with ridge `ridge`: real results
//   therefore outweigh the calibration prior automatically as games accumulate
//   (calibration decay), and a returning player's stored rating keeps its pull.
//   The affinity signal decays explicitly: confidence = 1 - avgGames /
//   calibrationDecayGames (see the engine), reaching 0 after that many games.
export const CALIBRATION_CONFIG = {
  iterations: 60,
  step: 40, // Points moved per unit of (result - expected) per iteration
  ridge: 0.5, // pull toward the seed Points (equilibrium swing ~ step/ridge * residual)
  tieWeight: 0.5, // organizer "these four are compatible" pseudo-observation weight
  marginBand: [0.85, 1.15], // score-margin scaling of a real result
  pointsToWin: 11,
  maxEvidence: 24,
  affinityCoCourt: 1,
  affinityTwoHop: 0.75,
  affinityNeutral: 0.5,
  // ORGANIZER STRENGTH ORDER (optional, session-local): the organizer orders the
  // calibration match GROUPS of a round strongest -> weakest. That is turned into
  // a RANK-based prior on the session strength estimate of PROVISIONAL players
  // only (a stored rating already says where a player sits): the strongest group
  // gets +strengthOrderAmplitude Points, the weakest -strengthOrderAmplitude,
  // the rest evenly in between (a rank prior, independent of how many groups).
  // It fades linearly to 0 over strengthOrderDecayGames of a player's real games,
  // so actual results take over. Court NUMBERS carry no meaning: only the order
  // the organizer explicitly gives counts.
  strengthOrderAmplitude: 100,
  strengthOrderDecayGames: 8,
};

import { isCalibrationPhase } from "./openPlayPhases.js";

export const DEFAULT_SEED_POINTS = 1000;

const meanOf = (r, ids) => ids.reduce((s, id) => s + (r[id] ?? DEFAULT_SEED_POINTS), 0) / (ids.length || 1);
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

// Append one organizer-calibration match to the (bounded) evidence list.
export function recordCalibrationEvidence(evidence, rec, cfg = CALIBRATION_CONFIG) {
  const entry = {
    round: rec.round,
    teamA: [...rec.teamA],
    teamB: [...rec.teamB],
    winner: rec.winner ?? null,
    scoreA: rec.scoreA ?? null,
    scoreB: rec.scoreB ?? null,
    ratings: rec.ratings || {},
  };
  return [...(evidence || []), entry].slice(-cfg.maxEvidence);
}

function marginWeight(m, cfg) {
  if (m.scoreA == null || m.scoreB == null) return 1;
  const margin = Math.abs(m.scoreA - m.scoreB);
  const [lo, hi] = cfg.marginBand;
  return lo + (hi - lo) * Math.max(0, Math.min(1, margin / cfg.pointsToWin));
}

// Pure. `matchHistory` entries: { teamA, teamB, winner: "A"|"B"|null, scoreA, scoreB }.
export function fitSessionStrength({ evidence = [], matchHistory = [], seeds = {} }, cfg = CALIBRATION_CONFIG) {
  const obs = [];
  for (const m of matchHistory) {
    if (!m?.teamA || !m?.teamB || (m.winner !== "A" && m.winner !== "B")) continue;
    obs.push({ A: m.teamA, B: m.teamB, S: m.winner === "A" ? 1 : 0, w: marginWeight(m, cfg) });
  }
  for (const e of evidence) obs.push({ A: e.teamA, B: e.teamB, S: 0.5, w: cfg.tieWeight });
  const ids = new Set(Object.keys(seeds));
  for (const o of obs) [...o.A, ...o.B].forEach((id) => ids.add(id));
  const prior = {}, r = {};
  ids.forEach((id) => { prior[id] = seeds[id] ?? DEFAULT_SEED_POINTS; r[id] = prior[id]; });
  if (obs.length === 0) return r;
  for (let it = 0; it < cfg.iterations; it++) {
    const grad = {};
    for (const o of obs) {
      const resid = (o.S - expected(meanOf(r, o.A), meanOf(r, o.B))) * o.w;
      for (const id of o.A) grad[id] = (grad[id] || 0) + resid / 2;
      for (const id of o.B) grad[id] = (grad[id] || 0) - resid / 2;
    }
    ids.forEach((id) => { r[id] += cfg.step * (grad[id] || 0) - cfg.ridge * (r[id] - prior[id]); });
  }
  return r;
}

const fourKey = (ids) => [...ids].sort().join(",");

// Affinity from the organizer's calibration courts. Returns the engine context:
//   quartetAffinity(ids) -> 0..1 (mean pairwise affinity of the 4 players)
//   fourKeys             -> matchup-memory style keys of every calibration four,
//                           fed to the engine's same-four ban
export function buildCalibrationAffinity(evidence = [], cfg = CALIBRATION_CONFIG) {
  const court = []; // array of Set(playerIds)
  const fourKeys = [];
  for (const e of evidence) {
    const ids = [...e.teamA, ...e.teamB];
    court.push(new Set(ids));
    fourKeys.push(`${[...e.teamA].sort().join("|")}__vs__${[...e.teamB].sort().join("|")}`);
  }
  const partners = new Map(); // id -> Set(co-court ids)
  for (const c of court) for (const a of c) { if (!partners.has(a)) partners.set(a, new Set()); for (const b of c) if (a !== b) partners.get(a).add(b); }
  const pairAffinity = (a, b) => {
    const pa = partners.get(a), pb = partners.get(b);
    if (!pa || !pb) return cfg.affinityNeutral; // no evidence about one of them: neutral, never a penalty
    if (pa.has(b)) return cfg.affinityCoCourt;
    for (const x of pa) if (pb.has(x)) return cfg.affinityTwoHop;
    return cfg.affinityNeutral;
  };
  return {
    fourKeys,
    hasEvidence: court.length > 0,
    pairAffinity,
    quartetAffinity(ids) {
      let s = 0, n = 0;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { s += pairAffinity(ids[i], ids[j]); n++; }
      return n ? s / n : cfg.affinityNeutral;
    },
  };
}

// Calibration GROUP bookkeeping. Every organizer-locked calibration match is
// remembered as a group (round, court number as its identifier, players) so the
// organizer can later order the groups of a round by approximate strength.
export function recordCalibrationGroup(groups, entry) {
  return [...(groups || []).filter((g) => !(g.round === entry.round && g.courtNumber === entry.courtNumber)), { round: entry.round, courtNumber: entry.courtNumber, playerIds: [...entry.playerIds] }];
}
export function removeCalibrationGroup(groups, round, courtNumber) {
  return (groups || []).filter((g) => !(g.round === round && g.courtNumber === courtNumber));
}

// Normalises an order for one round: keeps only group ids that exist, once each.
export function cleanStrengthOrder(order, groups, round) {
  const known = new Set((groups || []).filter((g) => g.round === round).map((g) => g.courtNumber));
  const seen = new Set();
  return (order || []).filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
}

// player id -> average rank-prior offset (Points; stronger group = positive).
// `order` = { [round]: [groupId, ...] } strongest -> weakest (only rounds the
// organizer ordered; groups left out of an order are ignored). Pure.
export function strengthOrderOffsets(groups = [], order = {}, amplitude = CALIBRATION_CONFIG.strengthOrderAmplitude) {
  const sums = {};
  for (const [roundKey, ids] of Object.entries(order || {})) {
    const round = Number(roundKey);
    const ranked = cleanStrengthOrder(ids, groups, round);
    const n = ranked.length;
    if (n < 2) continue; // one group carries no relative information
    ranked.forEach((courtNumber, k) => {
      const u = ((n - 1) / 2 - k) / ((n - 1) / 2); // +1 strongest ... -1 weakest
      const g = groups.find((x) => x.round === round && x.courtNumber === courtNumber);
      for (const id of g.playerIds) (sums[id] ||= []).push(amplitude * u);
    });
  }
  return Object.fromEntries(Object.entries(sums).map(([id, v]) => [id, v.reduce((x, y) => x + y, 0) / v.length]));
}

// Recomputes the session-local profile onto the state: players[id].calibratedPoints
// (and confidence) + a compact state.calibrationProfile. Leaves rankingPoints,
// every persistent rating, and every non-Points-Adaptive session untouched.
export function applyCalibrationProfile(state, cfg = CALIBRATION_CONFIG) {
  if (state?.rotationMode !== "pointsAdaptive") return state;
  const players = state.players || {};
  const seeds = {};
  for (const id of Object.keys(players)) seeds[id] = typeof players[id].rankingPointsSeed === "number" ? players[id].rankingPointsSeed : DEFAULT_SEED_POINTS;
  // organizer strength order -> rank prior offsets (provisional players only, fading with their real games)
  if (state.calibrationStrengthOrder && Object.keys(state.calibrationStrengthOrder).length > 0) {
    const offs = strengthOrderOffsets(state.calibrationGroups || [], state.calibrationStrengthOrder, cfg.strengthOrderAmplitude);
    for (const id of Object.keys(offs)) {
      const p = players[id];
      if (!p || p.rankingSource === "rated") continue;
      const weight = Math.max(0, 1 - (p.games || 0) / cfg.strengthOrderDecayGames);
      seeds[id] += weight * offs[id];
    }
  }
  const strength = fitSessionStrength({ evidence: state.calibrationEvidence || [], matchHistory: state.matchHistory || [], seeds }, cfg);
  const next = {};
  for (const [id, p] of Object.entries(players)) {
    const v = strength[id];
    next[id] = typeof v === "number" ? { ...p, calibratedPoints: Math.round(v * 100) / 100 } : p;
  }
  return {
    ...state,
    players: next,
    calibrationProfile: { evidenceRounds: (state.calibrationEvidence || []).length, fours: (state.calibrationEvidence || []).map((e) => fourKey([...e.teamA, ...e.teamB])) },
  };
}

// The ONE way the organizer's strength order changes. Editable only while the
// session is still in the organizer-controlled calibration phase (check-in,
// Round 1, Round 2); once Adaptive Matchmaking has begun the order is FROZEN and
// this returns the state untouched (same object). `order` null/short (< 2 known
// groups) clears that round's order (skip). The profile is recomputed from
// scratch, so a cleared or replaced order leaves no stale prior behind.
export function isStrengthOrderEditable(state) {
  return state?.rotationMode === "pointsAdaptive" && isCalibrationPhase(state);
}
export function setStrengthOrder(state, round, order) {
  if (!isStrengthOrderEditable(state)) return state;
  const cleaned = cleanStrengthOrder(order, state.calibrationGroups, round);
  const next = { ...(state.calibrationStrengthOrder || {}) };
  if (cleaned.length >= 2) next[round] = cleaned; else delete next[round];
  return applyCalibrationProfile({ ...state, calibrationStrengthOrder: next });
}

// Engine context for refreshNextMatchups / regenerate (cheap, from evidence only).
export function calibrationEngineContext(state) {
  if (state?.rotationMode !== "pointsAdaptive") return null;
  return { calibration: buildCalibrationAffinity(state.calibrationEvidence || []) };
}
