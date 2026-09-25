// Points-Based Adaptive Matchmaking with Organizer Calibration.
// Session phases, organizer calibration rounds, round lock, latecomers, one
// global waiting pool (no Beginner/Intermediate queues), fairness / match
// quality of the Round 3+ engine, and cold-start Points.
//
// Usage: node scripts/verify-points-adaptive-matchmaking.mjs
import fs from "node:fs";

globalThis.window = { storage: {} };
const P = await import("../src/lib/openPlayPhases.js");
const { PointsAdaptiveMatchmakingEngine, POINTS_ADAPTIVE_CONFIG } = await import("../src/engines/PointsAdaptiveMatchmakingEngine.js");
const { REASONS, WAIT_GUARD_GAP_MINUTES } = await import("../src/engines/AdaptiveRankingRotationEngine.js");
const { getRotationEngine, refreshNextMatchups, recordRotationHistory } = await import("../src/lib/utils.js");
const { dispatchAvailableCourts } = await import("../src/lib/courtDispatch.js");
const { emptyCourt, defaultState, SELECTABLE_ROTATION_MODES, RANKING_POINTS_MODES } = await import("../src/lib/constants.js");
const { applyProvisionalRankingDelta, applyRankingDelta, ratingKFor, PROVISIONAL_K_SCHEDULE, DEFAULT_RANKING_POINTS } = await import("../src/lib/rankingSnapshot.js");
const { matchupKeyFor, recordMatchupMemory } = await import("../src/lib/matchupMemory.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const NOW = 2_000_000_000_000;
const MIN = 60000;
const engine = new PointsAdaptiveMatchmakingEngine();
function mk(id, { wait = 10, pts = 1000, games = 0, skill = undefined, extra = {} } = {}) {
  return { id, name: id, ...(skill ? { skill } : {}), games, checkedIn: true, held: false, status: "ACTIVE", rankingPoints: pts, rankingSource: "provisional", checkedInAt: NOW - wait * MIN, partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [], ...extra };
}
const mapOf = (arr) => Object.fromEntries(arr.map((p) => [p.id, p]));
function gen(arr, extra = {}) { return engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players: mapOf(arr), existingMatchups: [], now: NOW, ...extra }); }
const idsOf = (m) => [...m.teamA, ...m.teamB];
const has = (m, r) => m.reasons.includes(r);

function session(n, { courts = 3, mode = "pointsAdaptive" } = {}) {
  const players = mapOf(Array.from({ length: n }, (_, i) => mk("p" + (i + 1), { wait: 30 - i * 0.1 })));
  return { rotationMode: mode, players, queueIds: Object.keys(players), nextMatchups: [], matchHistory: [], recentMatchups: [], courts: Array.from({ length: courts }, (_, i) => emptyCourt(i + 1)), ...P.createPhaseFields(mode) };
}
// organizer locks one manual court with players [a,b,c,d] (mirrors PickleballOpenPlay.lockManualCourt)
function lock(state, courtIdx, ids) {
  const v = P.validateManualAssignment({ ...state, courts: state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA: ids.slice(0, 2), teamB: ids.slice(2) } : c)) }, courtIdx, ids.slice(0, 2), ids.slice(2));
  if (!v.ok) return { state, error: v.error };
  const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, status: "live", teamA: ids.slice(0, 2), teamB: ids.slice(2), manualLocked: true } : c));
  const queueIds = state.queueIds.filter((id) => !ids.includes(id));
  return { state: P.noteCalibrationMatchStarted({ ...state, courts, queueIds }, ids) };
}
// mirrors endMatch for one court: player stats, requeue, phase bookkeeping
function end(state, courtIdx, aWon = true) {
  const c = state.courts[courtIdx];
  const ids = [...c.teamA, ...c.teamB];
  const players = { ...state.players };
  ids.forEach((id) => { players[id] = { ...players[id], games: players[id].games + 1, lastMatchEndAt: NOW }; });
  const won = aWon ? c.teamA : c.teamB, lost = aWon ? c.teamB : c.teamA;
  const withPts = state.rotationMode === "pointsAdaptive" ? applyProvisionalRankingDelta(players, won, lost) : players;
  const courts = state.courts.map((x, i) => (i === courtIdx ? emptyCourt(x.number) : x));
  const matchHistory = [...state.matchHistory, { teamA: c.teamA, teamB: c.teamB }];
  return P.noteMatchEnded({ ...state, players: withPts, courts, queueIds: [...state.queueIds, ...ids], matchHistory });
}
const gate = (s) => P.applyPhaseGate(s);
function runRound(state, ids12) {
  let s = gate(state);
  for (let i = 0; i < 3; i++) { const r = lock(s, i, ids12.slice(i * 4, i * 4 + 4)); if (r.error) throw new Error(r.error); s = gate(r.state); }
  return s;
}
function finishRound(state) {
  let s = state;
  for (let i = 0; i < 3; i++) s = gate(end(s, i, i % 2 === 0));
  return s;
}

console.log("\nA. Session phases");
let s0 = session(36);
{
  assert("1. a new pointsAdaptive session starts in the CHECK-IN phase with no round started", s0.sessionPhase === "checkIn" && P.isCalibrationPhase(s0) && s0.calibration.started === 0 && !s0.roundLock.locked);
  assert("   ...and other rotation modes get no phase fields at all (unchanged)", Object.keys(P.createPhaseFields("adaptiveSkill")).length === 0 && P.currentPhase({ rotationMode: "adaptiveSkill" }) === null);
  const g = gate(s0);
  assert("2. Round 1 is organizer-controlled: every open court is a MANUAL court", g.courts.every((c) => c.assignmentMode === "manual"));
  const withMatchups = { ...g, nextMatchups: [{ id: "m1", teamA: ["p1", "p2"], teamB: ["p3", "p4"] }] };
  const d = dispatchAvailableCourts({ courts: withMatchups.courts, nextMatchups: withMatchups.nextMatchups, queueIds: withMatchups.queueIds, players: withMatchups.players, autoFillCourts: true });
  assert("   ...so the automatic dispatcher cannot fill them (nothing is auto-generated for Round 1)", d.dispatched.length === 0);
  const app = read("src/PickleballOpenPlay.jsx");
  assert("   ...and the manual 'Generate remaining courts' / 'Regenerate' / 'Fill all open courts' actions are no-ops during calibration (found and fixed in browser testing)", (app.match(/if \(isCalibrationPhase\(state\)\) return;/g) || []).length >= 3);
  assert("   ...and the app never generates upcoming matchups or auto-dispatches during calibration", /queueingNotYetStarted \|\| next\.queueingStopped \|\| isCalibrationPhase\(next\)/.test(app) && /!isCalibrationPhase\(withMatchups\)/.test(app));
}
let r1 = runRound(s0, Object.keys(s0.players).slice(0, 12));
{
  assert("   first locked Round-1 court moves CHECK-IN -> CALIBRATION ROUND 1", r1.sessionPhase === "calibrationRound1");
  assert("   phase label reads 'Calibration — Round 1'", P.phaseLabel(r1) === "Calibration — Round 1" && P.rotationBanner(r1) === "CALIBRATION — ROUND 1");
  let mid = gate(end(r1, 0));
  assert("   one of three Round-1 matches finished: still Round 1", mid.sessionPhase === "calibrationRound1");
}
let r2;
{
  const done1 = finishRound(r1);
  assert("3. Round 1 completed -> ROUND 2 (still organizer-controlled, courts manual, no auto matchups)", done1.sessionPhase === "calibrationRound2" && done1.courts.every((c) => c.assignmentMode === "manual") && P.phaseLabel(done1) === "Round 2 — Calibration");
  assert("   the round lock resets (open) for Round 2", !done1.roundLock.locked && done1.roundLock.round === 2 && done1.calibration.started === 0);
  r2 = runRound(done1, Object.keys(done1.players).slice(12, 24));
  const done2 = finishRound(r2);
  assert("4. Round 2 completed -> ADAPTIVE MATCHMAKING becomes active automatically", done2.sessionPhase === "adaptive" && P.isAdaptivePhase(done2) && P.rotationBanner(done2) === "ADAPTIVE MATCHMAKING ACTIVE");
  assert("   courts are handed back to automatic dispatch; queueing started", done2.courts.every((c) => c.assignmentMode === "automatic") && done2.queueingStarted === true);
  assert("   label is 'Adaptive Matchmaking — Round 3'", P.phaseLabel(done2) === "Adaptive Matchmaking — Round 3");
  const after = gate(done2);
  const refreshed = refreshNextMatchups(after.queueIds, after.players, [], getRotationEngine(after.rotationMode), null, 3, null, after.recentMatchups);
  const dd = dispatchAvailableCourts({ courts: after.courts, nextMatchups: refreshed, queueIds: after.queueIds, players: after.players, autoFillCourts: true });
  assert("   Round 3 is system-generated: the engine builds matchups and dispatch fills all 3 courts", refreshed.length === 3 && dd.dispatched.length === 3);
  assert("5. the phase persists through a save/load JSON round trip", (() => { const rt = JSON.parse(JSON.stringify(done2)); return rt.sessionPhase === "adaptive" && rt.calibration && P.currentPhase(rt) === "adaptive"; })());
  const rt1 = JSON.parse(JSON.stringify(r1));
  assert("   ...including the calibration round bookkeeping and lock", rt1.calibration.started === 3 && rt1.roundLock.locked === true);
  assert("   the mode is selectable, labelled 'Adaptive Matchmaking', never the default", SELECTABLE_ROTATION_MODES.some((m) => m.value === "pointsAdaptive") && defaultState.rotationMode === "continuous");
  assert("   getRotationEngine('pointsAdaptive') is the new engine", getRotationEngine("pointsAdaptive") instanceof PointsAdaptiveMatchmakingEngine);
  const done2b = done2;
  r2 = done2b;
}

console.log("\nB0. Manual picker shows each player's previous result (W/L) for winner-vs-winner / loser-vs-loser Round 2");
{
  const pk = read("src/components/PlayerPicker.jsx");
  assert("waiting-queue and upcoming rows both render a W/L tag from players[id].lastResult", (pk.match(/p\.lastResult === "win" \? "W" : "L"/g) || []).length === 2);
  assert("...fed by the same lastResult endMatch writes for every player of a finished match", /lastResult: aWon \? "win" : bWon \? "loss"/.test(read("src/PickleballOpenPlay.jsx")));
}

console.log("\nB. Organizer calibration");
{
  const s = gate(session(36));
  const a = lock(s, 0, ["p1", "p2", "p3", "p4"]);
  assert("6. the organizer can manually assign 2+2 players to a court", !a.error && a.state.courts[0].status === "live" && a.state.courts[0].teamA.join() === "p1,p2");
  const draft = { ...gate(a.state), courts: gate(a.state).courts.map((c, i) => (i === 1 ? { ...c, teamA: ["p5", "p6"], teamB: ["p7", "p8"] } : c)) };
  const dup = P.validateManualAssignment(draft, 2, ["p5", "p9"], ["p10", "p11"]);
  assert("7. a player already drafted on another court cannot be assigned to a second court", !dup.ok && /already assigned to court 2/.test(dup.error));
  const playing = P.validateManualAssignment(gate(a.state), 1, ["p1", "p9"], ["p10", "p11"]);
  assert("   ...nor a player who is already playing", !playing.ok && /not available/.test(playing.error));
  assert("   ...nor the same player twice in one match", !P.validateManualAssignment(s, 1, ["p9", "p9"], ["p10", "p11"]).ok);
  assert("8. incomplete assignments (1 or 3 players) are rejected", !P.validateManualAssignment(s, 1, ["p9"], ["p10", "p11"]).ok && !P.validateManualAssignment(s, 1, ["p9", "p10"], ["p11"]).ok);
  const cal = finishRound(runRound(gate(session(36)), Object.keys(session(36).players).slice(0, 12)));
  assert("9. recording the three Round-1 results advances the session (Round 2)", cal.sessionPhase === "calibrationRound2");
  const undo = P.noteCalibrationMatchUnlocked(runRound(gate(session(36)), Object.keys(session(36).players).slice(0, 12)));
  assert("   unlocking a court gives the round its slot back and reopens the lock", undo.calibration.started === 2 && !undo.roundLock.locked);
  const force = P.forceAdvanceCalibration(gate(session(36)));
  assert("   the organizer can also finish a round early when no match is running", force.sessionPhase === "calibrationRound1");
  const blocked = P.forceAdvanceCalibration(gate(a.state));
  assert("   ...but not while a calibration match is live", blocked === gate(a.state) || blocked.sessionPhase === gate(a.state).sessionPhase);
}

console.log("\nC. Round lock");
let lockedState;
{
  let s = gate(session(20));
  s = lock(s, 0, ["p1", "p2", "p3", "p4"]).state;
  assert("10. the round is OPEN until every court of the round is assigned", !s.roundLock.locked && P.roundLockStatus(s).label === "ROUND OPEN");
  s = gate(s); s = lock(s, 1, ["p5", "p6", "p7", "p8"]).state; s = gate(s); s = lock(s, 2, ["p9", "p10", "p11", "p12"]).state;
  lockedState = gate(s);
  assert("   ...and LOCKED once all courts are assigned", lockedState.roundLock.locked && P.roundLockStatus(lockedState).label === "ROUND LOCKED" && lockedState.calibration.target === 3);
  assert("11. the locked players are fixed (recorded in the lock)", ["p1", "p6", "p12"].every((id) => P.isPlayerLocked(lockedState, id)) && lockedState.roundLock.playerIds.length === 12);
  const displace = P.validateManualAssignment(lockedState, 0, ["p13", "p14"], ["p15", "p1"]);
  assert("   a locked player can't be pulled into another match", !displace.ok);
  const late = { ...lockedState, players: { ...lockedState.players, late1: mk("late1", { wait: 0 }) }, queueIds: [...lockedState.queueIds, "late1"] };
  assert("12. a player arriving after the lock is NOT in the locked round and goes to the waiting queue", !P.isPlayerLocked(late, "late1") && late.queueIds.includes("late1") && late.courts.every((c) => ![...c.teamA, ...c.teamB].includes("late1")));
}

console.log("\nD. Latecomers");
{
  const late = { ...lockedState, players: { ...lockedState.players, late1: mk("late1", { wait: 0 }) }, queueIds: [...lockedState.queueIds, "late1"] };
  assert("13. a latecomer cannot be put on a court that is already locked/live", !P.validateManualAssignment(late, 0, ["late1", "p13"], ["p14", "p15"]).ok);
  const app = read("src/PickleballOpenPlay.jsx");
  assert("14. every check-in path records an arrival timestamp (checkedInAt: Date.now())", (app.match(/checkedInAt: Date\.now\(\)/g) || []).length >= 3);
  assert("15. the latecomer is available for the NEXT round (in the pool once the round finishes)", (() => { const done = finishRound(late); return P.availablePlayerIds(done).includes("late1"); })());
  const pool = [...["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => mk(id, { wait: 20 - i })), mk("late", { wait: 1 })];
  const m = gen(pool, { maxMatchups: 1 })[0];
  assert("16. a brand-new latecomer is NOT automatically placed at the front", !idsOf(m).includes("late"));
  const long = [...["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => mk(id, { wait: 6 - i * 0.2 })), mk("earlyLate", { wait: 40 })];
  const m2 = gen(long, { maxMatchups: 1 })[0];
  assert("   ...but once they have waited longest, that wait counts (they become the anchor)", idsOf(m2).includes("earlyLate") && m2.ranking.anchorId === "earlyLate");
}

console.log("\nE. No skill queues");
{
  const base = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => mk(id, { wait: 20 - i, pts: 1000 + i * 5 }));
  const labelled = base.map((p, i) => ({ ...p, skill: i < 5 ? "beginner" : "intermediate" }));
  const swapped = base.map((p, i) => ({ ...p, skill: i % 2 ? "beginner" : "intermediate" }));
  const norm = (arr) => JSON.stringify(gen(arr).map((m) => [[...m.teamA].sort(), [...m.teamB].sort()]));
  assert("17. Beginner/Intermediate labels never change the matchups (same teams for none / 5B+3I / alternating labels)", norm(base) === norm(labelled) && norm(base) === norm(swapped));
  const skewed = gen(labelled);
  assert("18. ONE global pool: 5 Beginners + 3 Intermediates still make TWO matchups (a skill-fenced engine could only make one)", skewed.length === 2 && skewed.some((m) => new Set(idsOf(m).map((id) => labelled.find((p) => p.id === id).skill)).size > 1));
  assert("   the engine is configured to ignore labels and is not division-based", POINTS_ADAPTIVE_CONFIG.useSkillLabels === false && !/beginnerIds|intermediateIds/.test(read("src/engines/PointsAdaptiveMatchmakingEngine.js")));
}

console.log("\nF. Matchmaking fairness");
{
  const recent = [mk("r1", { wait: 12 }), mk("r2", { wait: 11 }), mk("r3", { wait: 10 }), mk("r4", { wait: 9 }), mk("r5", { wait: 8 }), mk("fresh", { wait: 1 })];
  assert("19. recent-play protection: a player who just finished (<5 min) sits out while 4+ rested players exist", !idsOf(gen(recent)[0]).includes("fresh"));
  const wait = [mk("Z", { wait: 30, pts: 1000 }), mk("B", { wait: 18, pts: 1010 }), mk("A", { wait: 6, pts: 1035 }), mk("C", { wait: 17, pts: 1005 }), mk("D", { wait: 16, pts: 1002 }), mk("E", { wait: 15, pts: 1004 })];
  const wm = gen(wait, { maxMatchups: 1 })[0];
  assert("20. wait-time priority: the longest waiter anchors the first match", wm.ranking.anchorId === "Z");
  assert("22. a substantially longer wait beats a slightly better Points fit (A: 1035 Points, 6 min is left out for B/C/D/E)", !idsOf(wm).includes("A") && has(wm, REASONS.WAIT_GUARD_APPLIED));
  const games = [...["g1", "g2", "g3", "g4"].map((id) => mk(id, { wait: 15, games: 4 })), ...["g5", "g6", "g7", "g8"].map((id) => mk(id, { wait: 15, games: 2 }))];
  const gm = gen(games, { maxMatchups: 1 })[0];
  assert("21. games-played fairness: the 2-game players are picked ahead of the 4-game players", ["g5", "g6", "g7", "g8"].every((id) => idsOf(gm).includes(id)));
  const far = [mk("Z", { wait: 30, pts: 1000 }), mk("X", { wait: 29, pts: 2600 }), mk("T1", { wait: 20, pts: 1010 }), mk("T2", { wait: 19, pts: 1020 }), mk("T3", { wait: 18, pts: 1030 }), mk("T4", { wait: 17, pts: 990 })];
  const fm = gen(far, { maxMatchups: 1 })[0];
  assert("23. an extreme skill mismatch is NOT forced by wait time when legal alternatives exist", !idsOf(fm).includes("X") && (fm.ranking.pointsRange[1] - fm.ranking.pointsRange[0]) <= 100);
  const twelve = Array.from({ length: 12 }, (_, i) => mk("q" + i, { wait: 20 - i, pts: 700 + i * 110 }));
  const out = gen(twelve);
  assert("   no court is idle solely to optimise Points: 12 widely spread players still fill 3 courts", out.length === 3 && new Set(out.flatMap(idsOf)).size === 12);
}

console.log("\nG. Match quality");
{
  const tight = [mk("A", { wait: 20, pts: 1000 }), mk("W1", { wait: 19, pts: 1500 }), mk("W2", { wait: 18, pts: 1450 }), mk("T1", { wait: 17.5, pts: 1010 }), mk("T2", { wait: 17, pts: 1020 }), mk("T3", { wait: 16.5, pts: 1030 })];
  const tm = gen(tight, { maxMatchups: 1 })[0];
  assert("24. Points compatibility is considered: the anchor plays with the nearby-Points group, not the 500-Points-away pair", ["T1", "T2", "T3"].every((id) => idsOf(tm).includes(id)));
  const hist = (partner, opps) => ({ recentPartnerIds: [partner], partnerCounts: { [partner]: 1 }, lastOpponentIds: opps, recentOpponentIds: opps, opponentCounts: Object.fromEntries(opps.map((o) => [o, 1])) });
  const prev = [mk("p1", { wait: 12, extra: hist("p2", ["p3", "p4"]) }), mk("p2", { wait: 12, extra: hist("p1", ["p3", "p4"]) }), mk("p3", { wait: 12, extra: hist("p4", ["p1", "p2"]) }), mk("p4", { wait: 12, extra: hist("p3", ["p1", "p2"]) }), ...["p5", "p6", "p7", "p8"].map((id) => mk(id, { wait: 11 }))];
  const key = matchupKeyFor(["p1", "p2"], ["p3", "p4"]);
  const pm = gen(prev, { maxMatchups: 1, recentMatchups: [key] })[0];
  assert("25. partner repetition is avoided: last game's teammates are not teamed again", ![pm.teamA, pm.teamB].some((t) => (t.includes("p1") && t.includes("p2")) || (t.includes("p3") && t.includes("p4"))));
  assert("26. same-four repetition is avoided when alternatives exist", !["p1", "p2", "p3", "p4"].every((id) => idsOf(pm).includes(id)) && has(pm, REASONS.REPEAT_QUARTET_AVOIDED));
  assert("27. an immediate rematch (identical teams) is avoided", !(new Set([...pm.teamA, ...pm.teamB]).size === 4 && ["p1", "p2", "p3", "p4"].every((id) => idsOf(pm).includes(id))));
  const bal = [mk("s1", { wait: 20, pts: 1200 }), mk("s2", { wait: 19, pts: 1100 }), mk("s3", { wait: 18, pts: 1000 }), mk("s4", { wait: 17, pts: 900 })];
  const bm = gen(bal)[0];
  const sum = (t) => t.reduce((a, id) => a + bal.find((p) => p.id === id).rankingPoints, 0);
  assert("28. teams are balanced by Points-sum, NOT top-two vs bottom-two (best split 1200+900 vs 1100+1000)", Math.abs(sum(bm.teamA) - sum(bm.teamB)) === 0 && !(bm.teamA.includes("s1") && bm.teamA.includes("s2")) && !(bm.teamB.includes("s1") && bm.teamB.includes("s2")));
  // multi-round variety over a small room, with and without the same-four rule
  const variety = (cfg) => {
    let pl = mapOf(Array.from({ length: 12 }, (_, i) => mk("v" + i, { wait: 30 - i * 0.3, pts: 1000 + (i % 4) * 5 })));
    let recent = [];
    let sameFour = 0, partnerRepeat = 0, exact = 0;
    let lastFour = new Set();
    for (let round = 0; round < 10; round++) {
      const ms = engine.generateMatchups({ waitingIds: Object.keys(pl), players: pl, existingMatchups: [], now: NOW, recentMatchups: recent, config: cfg });
      const fours = new Set(ms.map((m) => idsOf(m).sort().join(",")));
      for (const f of fours) if (lastFour.has(f)) sameFour++;
      lastFour = fours;
      for (const m of ms) {
        for (const t of [m.teamA, m.teamB]) if (pl[t[0]].recentPartnerIds?.[0] === t[1]) partnerRepeat++;
        if (recent.slice(0, 3).includes(matchupKeyFor(m.teamA, m.teamB))) exact++; // same teams as the previous round
        pl = recordRotationHistory(pl, m.teamA, m.teamB, 1);
        recent = recordMatchupMemory(recent, m.teamA, m.teamB);
        idsOf(m).forEach((id) => (pl[id] = { ...pl[id], games: pl[id].games + 1 }));
      }
    }
    return { sameFour, partnerRepeat, exact };
  };
  const withRule = variety({}), withoutRule = variety({ recentSameFourWindow: 0 });
  assert("   over 10 rounds of a 12-player room: zero immediate partner repeats and zero repeats of the previous round's matchups", withRule.partnerRepeat === 0 && withRule.exact === 0);
  assert("   ...and same-four repeats are no worse than with the rule disabled (" + withRule.sameFour + " vs " + withoutRule.sameFour + ")", withRule.sameFour <= withoutRule.sameFour);
}

console.log("\nH. Cold start");
{
  const s = session(36);
  const cal1 = finishRound(runRound(gate(s), Object.keys(s.players).slice(0, 12)));
  assert("29. brand-new players with no Points (everyone at 1000) complete Round 1", cal1.sessionPhase === "calibrationRound2" && Object.values(cal1.players).filter((p) => p.games === 1).length === 12);
  const cal2 = finishRound(runRound(cal1, Object.keys(cal1.players).slice(12, 24)));
  assert("30. ...and Round 2, after which the system takes over", cal2.sessionPhase === "adaptive");
  const pts = Object.values(cal2.players).filter((p) => p.games > 0).map((p) => p.rankingPoints);
  assert("31. early results start separating relative strength (winners above 1000, losers below)", Math.max(...pts) > DEFAULT_RANKING_POINTS && Math.min(...pts) < DEFAULT_RANKING_POINTS);
  const untouched = Object.values(cal2.players).filter((p) => p.games === 0);
  assert("   ...while players who have not played yet stay at the 1000 baseline (provisional)", untouched.length === 12 && untouched.every((p) => p.rankingPoints === 1000 && p.rankingSource === "provisional"));
  const p1 = { a: mk("a", { games: 1 }), b: mk("b", { games: 1 }) };
  const one = applyProvisionalRankingDelta(p1, ["a"], ["b"]);
  assert("32. ONE result moves a provisional player only a little (±" + ratingKFor(p1.a) + " Points) — well inside the 100-Point neighbourhood, never a permanent verdict", one.a.rankingPoints === 1024 && one.b.rankingPoints === 976 && Math.abs(one.a.rankingPoints - 1000) < 100);
  const bounce = applyProvisionalRankingDelta({ ...one, a: { ...one.a, games: 2 } }, ["b"], ["a"]);
  assert("   ...and a following result the other way pulls them straight back toward the baseline (a=" + bounce.a.rankingPoints.toFixed(1) + ")", Math.abs(bounce.a.rankingPoints - 1000) < 5);
  const evenAt = (games, src) => { const r = applyProvisionalRankingDelta({ a: mk("a", { games, extra: { rankingSource: src } }), b: mk("b", { games, extra: { rankingSource: src } }) }, ["a"], ["b"]); return r.a.rankingPoints - 1000; };
  assert("   an even-odds win is worth +24 at the 1st-2nd game, +20 at the 3rd-4th, and the standard +15 from the 5th; rated players always +15", evenAt(1, "provisional") === 24 && evenAt(3, "provisional") === 20 && evenAt(5, "provisional") === 15 && evenAt(1, "rated") === 15 && PROVISIONAL_K_SCHEDULE[0].k > 30);
  const strong = { a: mk("a", { games: 1, pts: 1200 }), b: mk("b", { games: 1, pts: 1000 }) };
  const expectedWin = applyProvisionalRankingDelta(strong, ["a"], ["b"]).a.rankingPoints - 1200;
  const upset = applyProvisionalRankingDelta(strong, ["b"], ["a"]).b.rankingPoints - 1000;
  assert("   results are judged against what the Points predicted: an upset moves a player more than an expected win (" + upset.toFixed(1) + " vs " + expectedWin.toFixed(1) + ")", upset > 2 * expectedWin);
  const blow = applyProvisionalRankingDelta({ a: mk("a", { games: 1 }), b: mk("b", { games: 1 }) }, ["a"], ["b"], { margin: 11 }).a.rankingPoints - 1000;
  const squeak = applyProvisionalRankingDelta({ a: mk("a", { games: 1 }), b: mk("b", { games: 1 }) }, ["a"], ["b"], { margin: 1 }).a.rankingPoints - 1000;
  assert("   the score margin only nudges the swing (blow-out " + blow.toFixed(1) + " vs squeaker " + squeak.toFixed(1) + ", within ±15% of the base 24)", blow > squeak && blow <= 24 * 1.15 + 0.01 && squeak >= 24 * 0.85 - 0.01);
  const std = applyRankingDelta({ a: mk("a", { games: 5 }), b: mk("b", { games: 5 }) }, ["a"], ["b"]);
  const prov = applyProvisionalRankingDelta({ a: mk("a", { games: 5 }), b: mk("b", { games: 5 }) }, ["a"], ["b"]);
  assert("   after the provisional period it equals the Club Rating Engine's mirror exactly", std.a.rankingPoints === prov.a.rankingPoints && std.b.rankingPoints === prov.b.rankingPoints);
  assert("   the Points modes share the snapshot loader (RANKING_POINTS_MODES)", RANKING_POINTS_MODES.includes("pointsAdaptive") && /RANKING_POINTS_MODES\.includes\(state\.rotationMode\)/.test(read("src/PickleballOpenPlay.jsx")));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
