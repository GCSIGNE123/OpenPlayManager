// Points-Based Adaptive Matchmaking — session phases, calibration rounds and
// the round lock. Pure functions over the session state; nothing here touches
// React, storage or the network, so the whole flow is unit-testable.
//
// Only sessions whose rotationMode is "pointsAdaptive" use any of this. For
// every other rotation mode every function is a no-op / returns null, so
// existing sessions are untouched.
//
//   PHASE 0  checkIn             players arrive; the organizer has not yet
//                                started Round 1
//   PHASE 1  calibrationRound1   ORGANIZER builds every match by hand
//   PHASE 2  calibrationRound2   ORGANIZER builds every match by hand
//   PHASE 3  adaptive            SYSTEM generates matches (Round 3 onward)
//
// Transitions are automatic (the organizer never flips an engine switch):
//   first Round-1 court locked      checkIn           -> calibrationRound1
//   all Round-1 matches completed   calibrationRound1 -> calibrationRound2
//   all Round-2 matches completed   calibrationRound2 -> adaptive
//
// A "round" during calibration is one match per court the room can fill:
//   target = min(#courts, floor(players available / 4)), fixed when the round's
// first match starts. The ROUND LOCK closes once `target` matches have been
// assigned — from then on those players are fixed, and anyone who checks in
// after that simply joins the waiting queue for the NEXT round (a latecomer is
// never inserted into a locked match, and is never auto-promoted to the front:
// their queue standing is their arrival time, like every other waiting player).
const isTerminalPlayerStatus = (p) => p?.status === "CHECKED_OUT";

export const POINTS_ADAPTIVE_MODE = "pointsAdaptive";

export const SESSION_PHASES = {
  CHECK_IN: "checkIn",
  CALIBRATION_1: "calibrationRound1",
  CALIBRATION_2: "calibrationRound2",
  ADAPTIVE: "adaptive",
};

export const CALIBRATION_ROUNDS = 2;

export const usesPhases = (state) => state?.rotationMode === POINTS_ADAPTIVE_MODE;

// State fields to spread into a NEW session's state (empty for other modes).
export function createPhaseFields(rotationMode) {
  if (rotationMode !== POINTS_ADAPTIVE_MODE) return {};
  return {
    sessionPhase: SESSION_PHASES.CHECK_IN,
    calibration: { round: 1, target: null, started: 0, completed: 0 },
    roundLock: { round: 1, locked: false, playerIds: [] },
    // Calibration match groups (round, court number = identifier, players) and the
    // organizer's OPTIONAL strength order of them ({ [round]: [courtNumber, ...]
    // strongest -> weakest}). Session-local; awards no Points. Empty = skipped.
    // See lib/calibrationProfile.js.
    calibrationGroups: [],
    calibrationStrengthOrder: {},
  };
}

export function currentPhase(state) {
  if (!usesPhases(state)) return null;
  return state.sessionPhase || SESSION_PHASES.CHECK_IN;
}

// Organizer-controlled phases: rounds 1-2 (and the check-in before them).
export function isCalibrationPhase(state) {
  const p = currentPhase(state);
  return p !== null && p !== SESSION_PHASES.ADAPTIVE;
}

export function isAdaptivePhase(state) {
  return currentPhase(state) === SESSION_PHASES.ADAPTIVE;
}

function courtPlayerIds(courts) {
  return (courts || []).filter((c) => c.status !== "open").flatMap((c) => [...(c.teamA || []), ...(c.teamB || [])]);
}

// Players who could be put on a court right now: checked in, not held, not
// checked out, not already playing.
export function availablePlayerIds(state) {
  const busy = new Set(courtPlayerIds(state.courts));
  return Object.values(state.players || {})
    .filter((p) => p && p.checkedIn !== false && !p.held && !isTerminalPlayerStatus(p) && !busy.has(p.id))
    .map((p) => p.id);
}

export function calibrationTargetFor(state) {
  const courts = (state.courts || []).length;
  const players = availablePlayerIds(state).length;
  return Math.max(0, Math.min(courts, Math.floor(players / 4)));
}

// Called (from lockManualCourt) right after an organizer locks a manual court
// during calibration. Counts the match, fixes the round's target on its first
// match, and locks the round once every court of the round is assigned.
export function noteCalibrationMatchStarted(state, matchPlayerIds = [], courtNumber = null) {
  if (!isCalibrationPhase(state)) return state;
  let phase = currentPhase(state);
  let cal = state.calibration || { round: 1, target: null, started: 0, completed: 0 };
  if (phase === SESSION_PHASES.CHECK_IN) {
    phase = SESSION_PHASES.CALIBRATION_1;
    cal = { round: 1, target: null, started: 0, completed: 0 };
  }
  // players available BEFORE this match's four were pulled onto the court
  const target = cal.target ?? Math.max(1, Math.min((state.courts || []).length, Math.floor((availablePlayerIds(state).length + matchPlayerIds.length) / 4)));
  const started = cal.started + 1;
  const locked = started >= target;
  const playerIds = locked ? courtPlayerIds(state.courts) : state.roundLock?.playerIds || [];
  const tiers = courtNumber == null ? state.calibrationGroups || [] : [...(state.calibrationGroups || []).filter((t) => !(t.round === cal.round && t.courtNumber === courtNumber)), { round: cal.round, courtNumber, playerIds: [...matchPlayerIds] }];
  return {
    ...state,
    sessionPhase: phase,
    calibrationGroups: tiers,
    calibration: { ...cal, round: cal.round, target, started },
    roundLock: { round: cal.round, locked, playerIds: locked ? [...new Set(playerIds)] : [] },
  };
}

// Called (from endMatch) after any match ends. During calibration, counts it;
// once every match of the round is done, advances the phase automatically.
export function noteMatchEnded(state) {
  if (!isCalibrationPhase(state)) return state;
  const cal = state.calibration;
  if (!cal || currentPhase(state) === SESSION_PHASES.CHECK_IN) return state;
  const completed = cal.completed + 1;
  const roundDone = state.roundLock?.locked && completed >= cal.started;
  if (!roundDone) return { ...state, calibration: { ...cal, completed } };
  if (cal.round >= CALIBRATION_ROUNDS) return enterAdaptive({ ...state, calibration: { ...cal, completed } });
  return {
    ...state,
    sessionPhase: SESSION_PHASES.CALIBRATION_2,
    calibration: { round: cal.round + 1, target: null, started: 0, completed: 0 },
    roundLock: { round: cal.round + 1, locked: false, playerIds: [] },
  };
}

// Round 2 finished -> the system takes over. Any organizer-draft (manual, open)
// courts are handed back to automatic dispatch; the engine starts filling them
// on the very next save().
export function enterAdaptive(state) {
  const courts = (state.courts || []).map((c) =>
    c.status === "open" && c.assignmentMode === "manual" ? { ...c, assignmentMode: "automatic", teamA: [], teamB: [] } : c
  );
  return { ...state, courts, queueingStarted: true, sessionPhase: SESSION_PHASES.ADAPTIVE, adaptiveStartedAtMatch: (state.matchHistory || []).length, roundLock: { round: (state.calibration?.round || CALIBRATION_ROUNDS) + 1, locked: false, playerIds: [] } };
}

// "Unlock court" during calibration: the match never happened, so give the
// round's started-count (and the round lock) back.
export function noteCalibrationMatchUnlocked(state, courtNumber = null) {
  if (!isCalibrationPhase(state) || !state.calibration || state.calibration.started <= 0) return state;
  return {
    ...state,
    calibrationGroups: courtNumber == null ? state.calibrationGroups : (state.calibrationGroups || []).filter((t) => !(t.round === state.calibration.round && t.courtNumber === courtNumber)),
    calibration: { ...state.calibration, started: state.calibration.started - 1 },
    roundLock: { round: state.calibration.round, locked: false, playerIds: [] },
  };
}

// Organizer override: finish the current calibration round even though fewer
// than `target` matches were played (e.g. a court closed). Only allowed when no
// calibration match is still running.
export function forceAdvanceCalibration(state) {
  if (!isCalibrationPhase(state)) return state;
  if ((state.courts || []).some((c) => c.status === "live" || c.status === "finished" || c.status === "dispatching")) return state;
  const cal = state.calibration || { round: 1, target: null, started: 0, completed: 0 };
  const phase = currentPhase(state);
  if (phase === SESSION_PHASES.CHECK_IN) return { ...state, sessionPhase: SESSION_PHASES.CALIBRATION_1 };
  if (cal.round >= CALIBRATION_ROUNDS) return enterAdaptive(state);
  return {
    ...state,
    sessionPhase: SESSION_PHASES.CALIBRATION_2,
    calibration: { round: cal.round + 1, target: null, started: 0, completed: 0 },
    roundLock: { round: cal.round + 1, locked: false, playerIds: [] },
  };
}

// Applied on every save(): while calibrating, every open court is an
// organizer-controlled MANUAL court (the automatic dispatcher skips those), and
// the phase / round bookkeeping self-heals if a field is missing.
export function applyPhaseGate(state) {
  if (!usesPhases(state)) return state;
  let next = state;
  if (!next.sessionPhase) next = { ...next, ...createPhaseFields(POINTS_ADAPTIVE_MODE) };
  if (isCalibrationPhase(next)) {
    let changed = false;
    const courts = (next.courts || []).map((c) => {
      if (c.status === "open" && c.assignmentMode !== "manual") { changed = true; return { ...c, assignmentMode: "manual" }; }
      return c;
    });
    if (changed) next = { ...next, courts };
  }
  return next;
}

// Adaptive-phase round number: Rounds 1-2 are calibration; every `courts`
// matches completed since the system took over is one further round.
export function currentRoundNumber(state) {
  const phase = currentPhase(state);
  if (phase === null) return null;
  if (phase === SESSION_PHASES.CHECK_IN || phase === SESSION_PHASES.CALIBRATION_1) return 1;
  if (phase === SESSION_PHASES.CALIBRATION_2) return 2;
  const courts = Math.max(1, (state.courts || []).length);
  const sinceAdaptive = Math.max(0, (state.matchHistory || []).length - (state.adaptiveStartedAtMatch || 0));
  return CALIBRATION_ROUNDS + 1 + Math.floor(sinceAdaptive / courts);
}

export function phaseLabel(state) {
  switch (currentPhase(state)) {
    case null: return null;
    case SESSION_PHASES.CHECK_IN: return "Check-in";
    case SESSION_PHASES.CALIBRATION_1: return "Calibration — Round 1";
    case SESSION_PHASES.CALIBRATION_2: return "Round 2 — Calibration";
    default: return `Adaptive Matchmaking — Round ${currentRoundNumber(state)}`;
  }
}

export function rotationBanner(state) {
  const phase = currentPhase(state);
  if (phase === null) return null;
  if (phase === SESSION_PHASES.ADAPTIVE) return "ADAPTIVE MATCHMAKING ACTIVE";
  if (phase === SESSION_PHASES.CHECK_IN) return "CHECK-IN — organizer builds Round 1";
  return phase === SESSION_PHASES.CALIBRATION_1 ? "CALIBRATION — ROUND 1" : "ROUND 2 — CALIBRATION";
}

// ROUND OPEN / ROUND LOCKED for the banner. During calibration it reads the
// stored roundLock; in the adaptive phase every live court and every queued
// matchup is protected (locked).
export function roundLockStatus(state) {
  const phase = currentPhase(state);
  if (phase === null) return null;
  if (phase === SESSION_PHASES.ADAPTIVE) {
    const live = courtPlayerIds(state.courts);
    const queued = (state.nextMatchups || []).flatMap((m) => [...m.teamA, ...m.teamB]);
    const playerIds = [...new Set([...live, ...queued])];
    return { locked: playerIds.length > 0, round: currentRoundNumber(state), playerIds, label: playerIds.length > 0 ? "ROUND LOCKED" : "ROUND OPEN" };
  }
  const lock = state.roundLock || { locked: false, playerIds: [], round: 1 };
  return { locked: Boolean(lock.locked), round: lock.round, playerIds: lock.playerIds || [], label: lock.locked ? "ROUND LOCKED" : "ROUND OPEN" };
}

// Is this player fixed in a locked match (so a new arrival / edit must not
// displace them)?
export function isPlayerLocked(state, playerId) {
  const s = roundLockStatus(state);
  return Boolean(s && s.locked && s.playerIds.includes(playerId));
}

// Manual (organizer) court assignment validation — the same rules the Lock
// Court button enforces, as a pure function: exactly 2+2 distinct players,
// everyone real, available and not already placed elsewhere.
export function validateManualAssignment(state, courtIdx, teamA, teamB) {
  const court = (state.courts || [])[courtIdx];
  if (!court) return { ok: false, error: "No such court." };
  if (court.status !== "open") return { ok: false, error: "That court is already in use." };
  const a = (teamA || []).filter(Boolean), b = (teamB || []).filter(Boolean);
  if (a.length !== 2 || b.length !== 2) return { ok: false, error: "Each team needs exactly 2 players." };
  const all = [...a, ...b];
  if (new Set(all).size !== all.length) return { ok: false, error: "A player can't be on both teams / twice." };
  const available = new Set(availablePlayerIds(state));
  const otherDrafts = new Map();
  (state.courts || []).forEach((c, i) => { if (i !== courtIdx && c.status === "open" && c.assignmentMode === "manual") [...(c.teamA || []), ...(c.teamB || [])].forEach((id) => otherDrafts.set(id, c.number)); });
  for (const id of all) {
    if (!state.players?.[id]) return { ok: false, error: `Unknown player ${id}.` };
    if (!available.has(id)) return { ok: false, error: `${state.players[id].name || id} is not available (already playing, held or checked out).` };
    if (otherDrafts.has(id)) return { ok: false, error: `${state.players[id].name || id} is already assigned to court ${otherDrafts.get(id)}.` };
  }
  return { ok: true };
}
