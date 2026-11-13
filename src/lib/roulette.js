// Roulette (random-draw rounds) — see FEATURES.md ("Roulette mode").
//
// A round-based rotation the organizer ran by hand with 22 players on 4
// courts: every round the whole room is DRAWN at once — random partners and
// opponents, one mixed pool, no fixed pairs — everyone plays at the same
// time, and players are ranked individually. Pure functions over the
// session record; no React, storage or network, so the whole flow is
// unit-testable and simulated in scripts/verify-roulette.mjs.
//
// Only sessions whose rotationMode is "roulette" use any of this; for every
// other mode each function is a no-op, so existing sessions are untouched.
//
// THE DRAW (drawRouletteRound)
//   1. Who plays: courts × 4 players; the rest sit out. Sit-outs go to the
//      players who have sat the FEWEST rounds so far, so nobody sits a
//      second time before everyone has sat once (ties: most games played
//      sits first, then random).
//   2. Who with / against: random, but
//        - NEVER the same partner twice (strict — weighted so heavily the
//          search only accepts it when no other arrangement exists), and
//        - as few repeat opponents as mathematically possible (soft — with
//          ~8 games each a player meets 16-18 of only 21 others, so a
//          perfect draw may not exist late in the session; each repeat is
//          reported so the organizer and the alert bell can see it).
//      Found by randomized restarts + pairwise-swap hill climbing over the
//      seating; a 16-player draw settles in a few milliseconds.
//   Partner/opponent history is derived from state.matchHistory, never
//   stored twice.
//
// THE ROUND FLOW (rouletteAdvance, called from save())
//   waiting  --draw-->  drawn  --Start Round-->  playing  --all courts done-->
//   waiting (next round) ... until `totalRounds` are played -> complete.
//   A drawn round sits in state.nextMatchups, where the organizer can edit
//   it with the existing matchup controls (substitute, swap) or Redraw it,
//   before pressing Start Round. Nothing is dispatched automatically.
//
// GAME LENGTH: a game ends at `gamePoints` (11) or when the round's
// `roundMinutes` (11) run out, whichever comes first; a tie at the buzzer is
// settled by one more point. The app shows the countdown and sounds the
// buzzer; a tied score cannot be confirmed (see rouletteScoreProblem).
import { uid } from "./random.js";
import { isEligibleForMatchmaking, manuallyReservedIds } from "./utils.js";
import { dispatchAvailableCourts } from "./courtDispatch.js";

export const ROULETTE_MODE = "roulette";
export const ROULETTE_DEFAULTS = { totalRounds: 12, roundMinutes: 11, gamePoints: 11 };
export const ROULETTE_PHASES = { WAITING: "waiting", DRAWN: "drawn", PLAYING: "playing", COMPLETE: "complete" };

const PARTNER_REPEAT_COST = 1_000_000;
const OPPONENT_REPEAT_COSTS = [0, 10, 200, 4000]; // by how many times they have ALREADY faced each other

export const isRouletteMode = (state) => state?.rotationMode === ROULETTE_MODE;

const positiveIntOr = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

// State fields to spread into a NEW session's state ({} for other modes).
export function createRouletteFields(rotationMode) {
  if (rotationMode !== ROULETTE_MODE) return {};
  return { roulette: { ...ROULETTE_DEFAULTS, round: 0, phase: ROULETTE_PHASES.WAITING, roundStartedAt: null, rounds: [] } };
}

// Always a complete object, whatever the stored record looks like.
export function rouletteOf(state) {
  const r = state?.roulette || {};
  return {
    totalRounds: positiveIntOr(r.totalRounds, ROULETTE_DEFAULTS.totalRounds),
    roundMinutes: positiveIntOr(r.roundMinutes, ROULETTE_DEFAULTS.roundMinutes),
    gamePoints: positiveIntOr(r.gamePoints, ROULETTE_DEFAULTS.gamePoints),
    round: Number.isInteger(r.round) && r.round >= 0 ? r.round : 0,
    phase: Object.values(ROULETTE_PHASES).includes(r.phase) ? r.phase : ROULETTE_PHASES.WAITING,
    roundStartedAt: typeof r.roundStartedAt === "number" ? r.roundStartedAt : null,
    rounds: Array.isArray(r.rounds) ? r.rounds : [],
  };
}

// Small seedable PRNG so tests and simulations are reproducible.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const idsOf = (m) => [...(m?.teamA || []), ...(m?.teamB || [])];

// { partners: {"a|b": n}, opponents: {"a|b": n} } from every match played.
export function pairHistory(matchHistory) {
  const partners = {};
  const opponents = {};
  for (const m of matchHistory || []) {
    const A = m.teamA || [];
    const B = m.teamB || [];
    if (A.length === 2) partners[pairKey(A[0], A[1])] = (partners[pairKey(A[0], A[1])] || 0) + 1;
    if (B.length === 2) partners[pairKey(B[0], B[1])] = (partners[pairKey(B[0], B[1])] || 0) + 1;
    for (const a of A) for (const b of B) opponents[pairKey(a, b)] = (opponents[pairKey(a, b)] || 0) + 1;
  }
  return { partners, opponents };
}

// How many rounds each player has sat out so far (from the committed rounds).
export function sitCounts(state) {
  const counts = {};
  for (const r of rouletteOf(state).rounds) for (const id of r.sat || []) counts[id] = (counts[id] || 0) + 1;
  return counts;
}

// Everyone who could be drawn right now: waiting, not held / checked out /
// on break, not reserved by a manual court.
export function roulettePool(state) {
  const manual = manuallyReservedIds(state?.courts);
  return (state?.queueIds || []).filter((id) => isEligibleForMatchmaking(state.players?.[id]) && !manual.has(id));
}

const automaticCourtCount = (state) => (state?.courts || []).filter((c) => c.assignmentMode !== "manual").length;

// Repeats inside a set of matchups, against the history: [{ kind:
// "partner"|"opponent", ids:[a,b], times }] — `times` = how many times they
// had ALREADY been partners / opponents before this round.
export function rouletteRepeats(matchups, matchHistory) {
  const { partners, opponents } = pairHistory(matchHistory);
  const out = [];
  for (const m of matchups || []) {
    const A = m.teamA || [];
    const B = m.teamB || [];
    for (const team of [A, B]) {
      if (team.length === 2 && partners[pairKey(team[0], team[1])]) out.push({ kind: "partner", ids: [team[0], team[1]], times: partners[pairKey(team[0], team[1])], matchupId: m.id });
    }
    for (const a of A) for (const b of B) if (opponents[pairKey(a, b)]) out.push({ kind: "opponent", ids: [a, b], times: opponents[pairKey(a, b)], matchupId: m.id });
  }
  return out;
}

function seatingCost(seats, partners, opponents) {
  let cost = 0;
  for (let i = 0; i + 3 < seats.length; i += 4) {
    const [a, b, c, d] = [seats[i], seats[i + 1], seats[i + 2], seats[i + 3]];
    cost += (partners[pairKey(a, b)] || 0) * PARTNER_REPEAT_COST + (partners[pairKey(c, d)] || 0) * PARTNER_REPEAT_COST;
    for (const [x, y] of [[a, c], [a, d], [b, c], [b, d]]) {
      const n = opponents[pairKey(x, y)] || 0;
      cost += OPPONENT_REPEAT_COSTS[Math.min(n, OPPONENT_REPEAT_COSTS.length - 1)];
    }
  }
  return cost;
}

function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Draws one round. Returns { matchups, sat, repeats } — matchups in court
// order ([] when fewer than 4 players or no courts).
export function drawRouletteRound(state, { rng = Math.random, round = rouletteOf(state).round + 1 } = {}) {
  const pool = roulettePool(state);
  const courts = Math.min(automaticCourtCount(state), Math.floor(pool.length / 4));
  if (courts <= 0) return { matchups: [], sat: pool, repeats: [] };

  // 1. sit-outs: fewest sits so far first; ties -> most games, then random
  const sits = sitCounts(state);
  const order = shuffled(pool, rng).sort((x, y) => (sits[x] || 0) - (sits[y] || 0) || (state.players[y]?.games || 0) - (state.players[x]?.games || 0));
  const sitN = pool.length - courts * 4;
  const sat = order.slice(0, sitN);
  const playing = order.slice(sitN);

  // 2. seating: randomized restarts + pairwise-swap hill climbing
  const { partners, opponents } = pairHistory(state.matchHistory);
  let best = null;
  let bestCost = Infinity;
  for (let restart = 0; restart < 60 && bestCost > 0; restart++) {
    const seats = shuffled(playing, rng);
    let cost = seatingCost(seats, partners, opponents);
    for (let step = 0; step < 4000 && cost > 0; step++) {
      const i = Math.floor(rng() * seats.length);
      const j = Math.floor(rng() * seats.length);
      if (i === j) continue;
      [seats[i], seats[j]] = [seats[j], seats[i]];
      const next = seatingCost(seats, partners, opponents);
      if (next <= cost) cost = next;
      else [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = [...seats];
    }
  }
  const matchups = [];
  for (let i = 0; i + 3 < best.length; i += 4) {
    matchups.push({ id: uid(), teamA: [best[i], best[i + 1]], teamB: [best[i + 2], best[i + 3]], rouletteRound: round });
  }
  return { matchups, sat, repeats: rouletteRepeats(matchups, state.matchHistory) };
}

const occupiedCourts = (state) => (state?.courts || []).filter((c) => c.status !== "open");

// The round state machine. Called from save() on every write; returns the
// SAME state object whenever there is nothing to do.
export function rouletteAdvance(state, now = Date.now(), rng = Math.random) {
  if (!isRouletteMode(state)) return state;
  const r = rouletteOf(state);
  const occupied = occupiedCourts(state);
  const queued = state.nextMatchups || [];
  const P = ROULETTE_PHASES;

  if (r.phase === P.DRAWN && occupied.length > 0) {
    const onCourt = new Set(occupied.flatMap(idsOf));
    const queuedIds = new Set(queued.flatMap(idsOf));
    // "Undo last round" put a finished match back on court after the next
    // round had already been drawn: drop that draw and resume the round.
    if ([...onCourt].some((id) => queuedIds.has(id))) {
      return { ...state, nextMatchups: [], roulette: { ...r, round: Math.max(1, r.round - 1), phase: P.PLAYING } };
    }
    // The drawn round has started (Start Round, or the organizer filled a
    // court by hand): start the clock and record who is sitting this round.
    const sat = roulettePool(state).filter((id) => !onCourt.has(id) && !queuedIds.has(id));
    return { ...state, roulette: { ...r, phase: P.PLAYING, roundStartedAt: now, rounds: [...r.rounds.filter((x) => x.round !== r.round), { round: r.round, sat, startedAt: now }] } };
  }

  // The whole drawn round was dissolved before it started (e.g. players
  // held or checked out of every matchup): forget that draw and draw again.
  if (r.phase === P.DRAWN && occupied.length === 0 && queued.length === 0) {
    return rouletteAdvance({ ...state, roulette: { ...r, round: Math.max(0, r.round - 1), phase: P.WAITING } }, now, rng);
  }

  if (r.phase === P.PLAYING && occupied.length === 0 && queued.length === 0) {
    const done = r.round >= r.totalRounds;
    const next = { ...state, roulette: { ...r, phase: done ? P.COMPLETE : P.WAITING, roundStartedAt: null } };
    return done ? next : rouletteAdvance(next, now, rng);
  }

  if (r.phase === P.WAITING && r.round < r.totalRounds && occupied.length === 0 && queued.length === 0 && state.queueingStarted !== false && !state.queueingStopped) {
    const { matchups } = drawRouletteRound(state, { rng, round: r.round + 1 });
    if (matchups.length === 0) return state;
    return { ...state, nextMatchups: matchups, roulette: { ...r, round: r.round + 1, phase: P.DRAWN, roundStartedAt: null } };
  }

  // more rounds were added in Session Settings after the last one finished
  if (r.phase === P.COMPLETE && r.round < r.totalRounds) {
    return rouletteAdvance({ ...state, roulette: { ...r, phase: P.WAITING } }, now, rng);
  }
  return state;
}

// "Redraw": throws away the drawn (not yet started) round and draws again.
export function redrawRouletteRound(state, rng = Math.random) {
  if (!isRouletteMode(state)) return state;
  const r = rouletteOf(state);
  if (r.phase !== ROULETTE_PHASES.DRAWN) return state;
  const cleared = { ...state, nextMatchups: [] };
  const { matchups } = drawRouletteRound(cleared, { rng, round: r.round });
  return matchups.length === 0 ? state : { ...cleared, nextMatchups: matchups };
}

// "Start Round": puts every drawn matchup on a court, live, at once. The
// clock starts in rouletteAdvance (save()) when it sees the courts occupied.
export function startRouletteRound(state, { isCourtReserved } = {}) {
  if (!isRouletteMode(state)) return state;
  if (rouletteOf(state).phase !== ROULETTE_PHASES.DRAWN) return state;
  const result = dispatchAvailableCourts({ courts: state.courts, nextMatchups: state.nextMatchups, queueIds: state.queueIds, players: state.players, autoFillCourts: true, isCourtReserved });
  if (result.dispatched.length === 0) return state;
  const started = new Set(result.dispatched.map((d) => d.courtNumber));
  const courts = result.courts.map((c) => (started.has(c.number) && c.status === "dispatching" ? { ...c, status: "live" } : c));
  return { ...state, courts, nextMatchups: result.nextMatchups, queueIds: result.queueIds };
}

// Countdown for the round in play: { endsAt, remainingMs, expired } or null.
export function rouletteClock(state, now = Date.now()) {
  if (!isRouletteMode(state)) return null;
  const r = rouletteOf(state);
  if (r.phase !== ROULETTE_PHASES.PLAYING || r.roundStartedAt === null) return null;
  const endsAt = r.roundStartedAt + r.roundMinutes * 60000;
  const remainingMs = Math.max(0, endsAt - now);
  return { endsAt, remainingMs, expired: remainingMs === 0 };
}

export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Why a Roulette result can't be confirmed yet (null = fine). A game must
// have a winner: a tie at the buzzer is settled by one more point.
export function rouletteScoreProblem(state, scoreA, scoreB) {
  if (!isRouletteMode(state)) return null;
  if (scoreA === scoreB) return "Roulette games can't end tied — play one more point to decide it, then enter the final score.";
  return null;
}

// One-line status for the Scorer panel, Live Board and TV.
export function rouletteStatusText(state) {
  if (!isRouletteMode(state)) return "";
  const r = rouletteOf(state);
  const P = ROULETTE_PHASES;
  if (r.phase === P.COMPLETE) return `All ${r.totalRounds} rounds played — standings are final.`;
  if (r.phase === P.PLAYING) return `Round ${r.round} of ${r.totalRounds} in play — games to ${r.gamePoints} or ${r.roundMinutes} minutes.`;
  if (r.phase === P.DRAWN) return `Round ${r.round} of ${r.totalRounds} is drawn — review it, then Start Round.`;
  if (state.queueingStarted === false) return `Roulette: ${r.totalRounds} rounds of ${r.roundMinutes} minutes. Press Start Queuing to draw Round 1.`;
  if (roulettePool(state).length < 4) return `Waiting for at least 4 players to draw Round ${r.round + 1}.`;
  return `Round ${r.round + 1} of ${r.totalRounds} will be drawn when the courts are free.`;
}
