// Headless simulation of a complete Open Play session under Progressive
// Skill Rotation. Reuses the exact same matchmaking/phase/pooling code the
// live app runs — getRotationEngine/refreshNextMatchups (which dispatches
// to ProgressiveSkillRotationStrategy and, per phase, BalancedRotationEngine
// / TransitionRotationEngine / CompetitiveRotationEngine), the phase-boundary
// calc, and the Winner Pool Rotation pooling mechanic that Mentorship phase
// borrows — not a reimplementation of the algorithm. What it DOES supply
// itself is the orchestration a live UI would normally drive one click at a
// time (assigning matchups to courts, "playing" a match to a final score,
// ending it) since that glue lives inside PickleballOpenPlay.jsx as React
// state setters, not as pure functions this engine can import.
//
// No UI. Call runSimulation(config) and it returns a structured result
// object; the CLI-friendly console report is a separate, optional step
// (printSimulationReport) so callers who just want the data can skip it.
import { getRotationEngine, refreshNextMatchups, recordRotationHistory } from "../utils.js";
import { resolveWinnerPoolMatch, isPoolingRotation, getPairPartnerIndex } from "../winnerPoolRound.js";
import { progressiveSkillPhaseFor } from "../progressiveSkillPhase.js";
import { calculatePerformanceRating } from "../performanceRating.js";
import { emptyCourt } from "../constants.js";
import { uid, shuffle } from "../random.js";

export const DEFAULT_SIMULATION_CONFIG = {
  playerCount: 16,
  skillSplit: 0.5, // fraction of players registered as "beginner"; the rest "intermediate"
  courtCount: 4,
  expectedGamesPerPlayer: 6,
  progressiveSkillThresholds: { mentorshipMax: 30, transitionMax: 60 },
  pointsToWin: 11,
  maxRounds: 300, // safety cap — real sessions converge in a handful of rounds; this only guards against a genuine deadlock (e.g. too few players for any court)
};

function buildPlayers(playerCount, skillSplit) {
  const players = {};
  const beginnerCount = Math.round(playerCount * skillSplit);
  const ids = [];
  for (let i = 0; i < playerCount; i++) {
    const id = uid();
    const skill = i < beginnerCount ? "beginner" : "intermediate";
    players[id] = {
      id,
      name: `Player ${i + 1}`,
      skill,
      checkedIn: true,
      skipped: false,
      games: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      lastResult: null,
      pointsFor: 0,
      pointsAgainst: 0,
      partnerCounts: {},
      recentPartnerIds: [],
      opponentCounts: {},
      lastOpponentIds: [],
      recentOpponentIds: [],
      courtCounts: {},
      lastCourt: null,
    };
    ids.push(id);
  }
  return { players, ids: shuffle(ids) };
}

// decides a plausible final score for a simulated match — a random winner,
// pointsToWin for them, a random plausible margin for the loser. There's no
// real gameplay to simulate, so this is intentionally simple; it exists
// only to produce a winner/loser and a point differential for the
// rotation engines' history-based scoring to react to on subsequent rounds.
function simulateScore(pointsToWin) {
  const aWins = Math.random() < 0.5;
  const loserScore = Math.floor(Math.random() * (pointsToWin - 1)); // 0..pointsToWin-2
  return aWins ? { scoreA: pointsToWin, scoreB: loserScore } : { scoreA: loserScore, scoreB: pointsToWin };
}

// mirrors PickleballOpenPlay.jsx's fillAllCourts: deploys as many pre-built
// nextMatchups onto open courts as will fit, consuming both.
function fillAllOpenCourts(state) {
  let queueIds = [...state.queueIds];
  let remainingMatchups = [...state.nextMatchups];
  let filledCount = 0;
  const courts = state.courts.map((c) => {
    if (c.status !== "open") return c;
    const nextMatch = remainingMatchups.shift();
    if (!nextMatch) return c;
    const { teamA, teamB } = nextMatch;
    const consumed = new Set([...teamA, ...teamB]);
    queueIds = queueIds.filter((id) => !consumed.has(id));
    filledCount++;
    return { ...c, status: "live", teamA, teamB, scoreA: 0, scoreB: 0 };
  });
  return { ...state, courts, queueIds, nextMatchups: remainingMatchups, filledCount };
}

// mirrors PickleballOpenPlay.jsx's endMatch for one court: records stats
// and rotation history, then either requeues players normally or — for
// Winner Pool Rotation / Progressive Skill Rotation's Mentorship phase —
// holds/pools via resolveWinnerPoolMatch, exactly like the live app.
function endMatchAt(state, courtIdx, pointsToWin, matchLog) {
  const preMatchPlayers = state.players;
  const court = state.courts[courtIdx];
  const { teamA, teamB, scoreA, scoreB } = court;
  const playedIds = [...teamA, ...teamB];
  let players = { ...state.players };
  const aWon = scoreA > scoreB;
  const bWon = scoreB > scoreA;

  teamA.forEach((id) => {
    const p = players[id];
    players[id] = {
      ...p,
      games: p.games + 1,
      wins: p.wins + (aWon ? 1 : 0),
      losses: p.losses + (bWon ? 1 : 0),
      streak: aWon ? p.streak + 1 : 0,
      lastResult: aWon ? "win" : "loss",
      pointsFor: p.pointsFor + scoreA,
      pointsAgainst: p.pointsAgainst + scoreB,
    };
  });
  teamB.forEach((id) => {
    const p = players[id];
    players[id] = {
      ...p,
      games: p.games + 1,
      wins: p.wins + (bWon ? 1 : 0),
      losses: p.losses + (aWon ? 1 : 0),
      streak: bWon ? p.streak + 1 : 0,
      lastResult: bWon ? "win" : "loss",
      pointsFor: p.pointsFor + scoreB,
      pointsAgainst: p.pointsAgainst + scoreA,
    };
  });
  players = recordRotationHistory(players, teamA, teamB, court.number);

  const phasePlayed = progressiveSkillPhaseFor(
    state.rotationMode,
    preMatchPlayers,
    state.expectedGamesPerPlayer,
    state.progressiveSkillThresholds
  );
  matchLog.push({
    round: state.round,
    court: court.number,
    teamA,
    teamB,
    winner: aWon ? "A" : "B",
    scoreA,
    scoreB,
    phase: phasePlayed,
  });

  const partnerIdx = getPairPartnerIndex(state.courts, courtIdx);
  const partnerAwaitingPair = partnerIdx !== null && state.courts[partnerIdx]?.awaitingPair;
  if (isPoolingRotation(state.rotationMode, phasePlayed) || partnerAwaitingPair) {
    const { courts, requeueIds, newMatchups } = resolveWinnerPoolMatch(state.courts, players, courtIdx);
    const queueIds = [...state.queueIds, ...requeueIds];
    const nextMatchups = [...state.nextMatchups, ...newMatchups];
    return { ...state, courts, players, queueIds, nextMatchups };
  }

  const queueIds = [...state.queueIds, ...playedIds];
  const courts = state.courts.map((c, i) => (i === courtIdx ? emptyCourt(c.number) : c));
  return { ...state, courts, players, queueIds };
}

// Winner Pool Rotation's pairwise hold (court finishes, waits for its pair
// partner) assumes the partner will eventually finish too. That's true in
// the live app (every court always has enough waiting players eventually),
// but a simulation can configure more courts than the player count can
// ever fill simultaneously — e.g. 4 courts with 12 players can only ever
// run 3 matches at once, so whichever court in a pair doesn't get a 4th
// match will sit "open" forever, and its partner would otherwise hold its
// finished players in awaitingPair permanently (they'd never be requeued,
// so they'd never play again — a real deadlock, not just a slow round).
// Called once per round after that round's matches end: any court still
// awaitingPair whose partner is (still) "open" — meaning this round's fill
// pass already had its chance and the partner didn't get deployed — is
// released back to the queue instead of holding indefinitely. This is
// simulation-only orchestration, not a change to how pooling itself works.
function releaseStalePairings(state) {
  let queueIds = state.queueIds;
  const courts = state.courts.map((c, i) => {
    if (!c.awaitingPair) return c;
    const partnerIdx = getPairPartnerIndex(state.courts, i);
    const partner = partnerIdx !== null ? state.courts[partnerIdx] : null;
    if (!partner || partner.status === "open") {
      queueIds = [...queueIds, ...c.teamA, ...c.teamB];
      return emptyCourt(c.number);
    }
    return c;
  });
  return { ...state, courts, queueIds };
}

// Runs a complete simulated session and returns a structured result. Does
// not print anything — see printSimulationReport for that.
export function runSimulation(config = {}) {
  const cfg = { ...DEFAULT_SIMULATION_CONFIG, ...config };
  const { players, ids: queueIds } = buildPlayers(cfg.playerCount, cfg.skillSplit);

  let state = {
    players,
    queueIds,
    courts: Array.from({ length: cfg.courtCount }, (_, i) => emptyCourt(i + 1)),
    nextMatchups: [],
    rotationMode: "progressiveSkill",
    expectedGamesPerPlayer: cfg.expectedGamesPerPlayer,
    progressiveSkillThresholds: cfg.progressiveSkillThresholds,
    round: 0,
  };

  const matchLog = [];
  const roundLog = [];
  let round = 0;
  let stopReason = "all players reached their expected games";

  while (round < cfg.maxRounds) {
    round++;
    state.round = round;

    const allPlayersDone = Object.values(state.players).every((p) => p.games >= cfg.expectedGamesPerPlayer);
    if (allPlayersDone) {
      round--;
      break;
    }

    const engine = getRotationEngine(state.rotationMode);
    const phase = progressiveSkillPhaseFor(
      state.rotationMode,
      state.players,
      state.expectedGamesPerPlayer,
      state.progressiveSkillThresholds
    );
    state.nextMatchups = refreshNextMatchups(state.queueIds, state.players, state.nextMatchups, engine, phase);

    const beforeFill = state;
    state = fillAllOpenCourts(state);
    const courtsFilledThisRound = state.filledCount;

    const liveCourtIdxs = state.courts.map((c, i) => (c.status === "live" ? i : -1)).filter((i) => i !== -1);
    for (const idx of liveCourtIdxs) {
      const { scoreA, scoreB } = simulateScore(cfg.pointsToWin);
      state.courts[idx] = { ...state.courts[idx], scoreA, scoreB, status: "finished" };
    }
    for (const idx of liveCourtIdxs) {
      state = endMatchAt(state, idx, cfg.pointsToWin, matchLog);
    }
    state = releaseStalePairings(state);

    roundLog.push({
      round,
      phase,
      matchesPlayed: liveCourtIdxs.length,
      waitingAfterRound: state.queueIds.length,
    });

    // deadlock guard: nothing got deployed, nothing got played, and no one
    // is left to progress (e.g. an unpoolable leftover of <4 players who
    // will never form a full court) — stop rather than spin uselessly
    const nobodyProgressed = courtsFilledThisRound === 0 && liveCourtIdxs.length === 0;
    if (nobodyProgressed && !allPlayersDone) {
      stopReason = `stalled — ${state.queueIds.length} player(s) waiting can't fill a court (need ${
        cfg.courtCount > 0 ? 4 : "any"
      } per matchup); ending simulation early`;
      break;
    }
  }
  if (round >= cfg.maxRounds) {
    stopReason = `reached the ${cfg.maxRounds}-round safety cap`;
  }

  const playerSummaries = Object.values(state.players)
    .map((p) => {
      const diff = p.pointsFor - p.pointsAgainst;
      const performance = calculatePerformanceRating(p);
      return {
        id: p.id,
        name: p.name,
        skill: p.skill,
        games: p.games,
        wins: p.wins,
        losses: p.losses,
        winPct: p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0,
        pointDiff: diff,
        rating: performance.rating,
      };
    })
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.wins - a.wins || a.name.localeCompare(b.name));

  const phaseCounts = { mentorship: 0, transition: 0, competitive: 0 };
  matchLog.forEach((m) => {
    if (m.phase && phaseCounts[m.phase] !== undefined) phaseCounts[m.phase] += 1;
  });

  return {
    config: cfg,
    roundsRun: round,
    stopReason,
    endedCleanly: stopReason === "all players reached their expected games",
    totalMatches: matchLog.length,
    phaseCounts,
    matchLog,
    roundLog,
    playerSummaries,
    // players sitting in the queue when the simulation stopped -- normal
    // and expected on a clean finish (every round fully resolves before
    // the next begins, so everyone who just played is back in the queue
    // at a round boundary); only worth flagging when the session stalled
    finalQueueLength: state.queueIds.length,
  };
}

// Optional: prints a human-readable report of a runSimulation() result to
// the console (console.table for the per-player breakdown). Kept separate
// from runSimulation so the data can be consumed programmatically too.
export function printSimulationReport(result) {
  console.log("\n=== Rotation Simulation Report ===");
  console.log(`Players: ${result.config.playerCount} (skill split ${Math.round(result.config.skillSplit * 100)}% beginner)`);
  console.log(`Courts: ${result.config.courtCount}  |  Expected games/player: ${result.config.expectedGamesPerPlayer}`);
  console.log(`Phase thresholds: Mentorship ≤${result.config.progressiveSkillThresholds.mentorshipMax}% · Transition ≤${result.config.progressiveSkillThresholds.transitionMax}% · Competitive beyond`);
  console.log(`Rounds run: ${result.roundsRun}  |  Total matches: ${result.totalMatches}`);
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(
    `Matches per phase: Mentorship ${result.phaseCounts.mentorship} · Transition ${result.phaseCounts.transition} · Competitive ${result.phaseCounts.competitive}`
  );
  if (!result.endedCleanly && result.finalQueueLength > 0) {
    console.log(`Players left waiting when the simulation stopped: ${result.finalQueueLength}`);
  }

  console.log("\n-- Final standings --");
  console.table(
    result.playerSummaries.map((p, i) => ({
      "#": i + 1,
      Name: p.name,
      Skill: p.skill,
      GP: p.games,
      W: p.wins,
      L: p.losses,
      "Win%": p.winPct,
      "+/-": p.pointDiff,
      RTG: p.rating ?? "—",
    }))
  );
  console.log("=== End of report ===\n");
}
