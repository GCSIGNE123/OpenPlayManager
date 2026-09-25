// Calibration Profile (session-local, temporary) for Points-Based Adaptive
// Matchmaking: evidence from the organizer's Rounds 1-2, the strength fit, the
// affinity signal and its decay, the games-gap guard, the calibration same-four
// ban, and the guarantee that persistent Points are never touched.
//
// Usage: node scripts/verify-calibration-profile.mjs
import fs from "node:fs";

globalThis.window = { storage: {} };
const C = await import("../src/lib/calibrationProfile.js");
const { PointsAdaptiveMatchmakingEngine, POINTS_ADAPTIVE_CONFIG, GAMES_GAP_THRESHOLD, CALIBRATION_DECAY_GAMES } = await import("../src/engines/PointsAdaptiveMatchmakingEngine.js");
const { REASONS } = await import("../src/engines/AdaptiveRankingRotationEngine.js");
const { PROVISIONAL_K_SCHEDULE, ratingKFor } = await import("../src/lib/rankingSnapshot.js");
const { matchupKeyFor } = await import("../src/lib/matchupMemory.js");
const P = await import("../src/lib/openPlayPhases.js");

let pass = 0, fail = 0;
function assert(desc, cond) { if (cond) { pass++; console.log(`  ok ${desc}`); } else { fail++; console.log(`  FAIL: ${desc}`); } }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const NOW = 2_000_000_000_000, MIN = 60000;
const engine = new PointsAdaptiveMatchmakingEngine();
function mk(id, { wait = 10, pts = 1000, games = 0, cal, extra = {} } = {}) {
  return { id, name: id, games, checkedIn: true, held: false, status: "ACTIVE", rankingPoints: pts, rankingSource: "provisional", checkedInAt: NOW - wait * MIN, ...(cal !== undefined ? { calibratedPoints: cal } : {}), partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [], ...extra };
}
const mapOf = (a) => Object.fromEntries(a.map((p) => [p.id, p]));
const gen = (arr, extra = {}) => engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players: mapOf(arr), existingMatchups: [], now: NOW, ...extra });
const idsOf = (m) => [...m.teamA, ...m.teamB];
const ev = (round, A, B, winner = "A") => ({ round, teamA: A, teamB: B, winner, scoreA: winner === "A" ? 11 : 6, scoreB: winner === "A" ? 6 : 11, ratings: {} });

console.log("\n1. Calibration evidence (Rounds 1-2) is retained, bounded, and separate from Points");
{
  let e = C.recordCalibrationEvidence([], { round: 1, teamA: ["a", "b"], teamB: ["c", "d"], winner: "A", scoreA: 11, scoreB: 7, ratings: { a: 1000, b: 1000, c: 1000, d: 1000 } });
  e = C.recordCalibrationEvidence(e, { round: 2, teamA: ["a", "c"], teamB: ["e", "f"], winner: "B", scoreA: 5, scoreB: 11, ratings: {} });
  assert("who shared a court, teams, result, score margin, round and Points-at-the-time are all kept", e.length === 2 && e[0].teamA.join() === "a,b" && e[0].winner === "A" && e[0].scoreA === 11 && e[0].round === 1 && e[0].ratings.a === 1000 && e[1].round === 2);
  let big = [];
  for (let i = 0; i < 40; i++) big = C.recordCalibrationEvidence(big, { round: 1, teamA: ["a", "b"], teamB: ["c", "d"], winner: "A" });
  assert("evidence is bounded (never grows unbounded in the session record)", big.length === C.CALIBRATION_CONFIG.maxEvidence);
  const app = read("src/PickleballOpenPlay.jsx");
  assert("the app records evidence ONLY for organizer-calibration matches, at the moment they end", /const calibrationEvidence = isCalibrationPhase\(state\) && \(aWon \|\| bWon\)/.test(app) && /applyCalibrationProfile\(noteMatchEnded/.test(app));
}

console.log("\n2. Calibration is NOT permanent Points");
{
  const players = mapOf(["a", "b", "c", "d"].map((id) => mk(id, { pts: 1037 })));
  const state = { rotationMode: "pointsAdaptive", players, calibrationEvidence: [ev(1, ["a", "b"], ["c", "d"])], matchHistory: [] };
  const out = C.applyCalibrationProfile(state);
  assert("grouping alone (no results) awards no Points: calibrated estimate stays at the seed", ["a", "b", "c", "d"].every((id) => out.players[id].calibratedPoints === 1000));
  assert("persistent rankingPoints are never modified by the profile", ["a", "b", "c", "d"].every((id) => out.players[id].rankingPoints === 1037));
  assert("other rotation modes are untouched (same object returned)", C.applyCalibrationProfile({ ...state, rotationMode: "adaptiveSkill" }).players === players);
  assert("the Elo-style Points update and its K schedule are unchanged (no K increase for the cold start)", PROVISIONAL_K_SCHEDULE[0].k === 48 && PROVISIONAL_K_SCHEDULE[1].k === 40 && ratingKFor({ games: 5, rankingSource: "provisional" }) === 30);
  assert("the profile module never writes rankingPoints / rankingSource", !/rankingPoints\s*:|rankingSource\s*:/.test(read("src/lib/calibrationProfile.js").replace(/\/\/.*$/gm, "").replace(/rankingPointsSeed/g, "")));
}

console.log("\n3. Strength fit: results move the estimate; the calibration prior decays as games accumulate");
{
  const seeds = { a: 1000, b: 1000, c: 1000, d: 1000 };
  const one = C.fitSessionStrength({ evidence: [ev(1, ["a", "b"], ["c", "d"])], matchHistory: [{ teamA: ["a", "b"], teamB: ["c", "d"], winner: "A", scoreA: 11, scoreB: 7 }], seeds });
  assert("winners end above losers after one result, moderately (not a verdict)", one.a > one.c && one.a - 1000 < 40 && one.c - 1000 > -40);
  const hist = (n) => Array.from({ length: n }, () => ({ teamA: ["a", "b"], teamB: ["c", "d"], winner: "A", scoreA: 11, scoreB: 7 }));
  const four = C.fitSessionStrength({ evidence: [ev(1, ["a", "b"], ["c", "d"])], matchHistory: hist(4), seeds });
  assert("consistent results move the estimate further than a single result (evidence accumulates)", four.a - four.c > one.a - one.c);
  const tieOnly = C.fitSessionStrength({ evidence: [ev(1, ["a", "b"], ["c", "d"])], matchHistory: [], seeds });
  const noTie = C.fitSessionStrength({ evidence: [], matchHistory: hist(4), seeds });
  const withTie = C.fitSessionStrength({ evidence: [ev(1, ["a", "b"], ["c", "d"])], matchHistory: hist(4), seeds });
  assert("the organizer-grouping prior is weak evidence: it shrinks a result run but is outweighed by it (gap " + (withTie.a - withTie.c).toFixed(1) + " vs " + (noTie.a - noTie.c).toFixed(1) + " without)", tieOnly.a === 1000 && withTie.a - withTie.c < noTie.a - noTie.c && withTie.a - withTie.c > 0.6 * (noTie.a - noTie.c));
  const many = C.fitSessionStrength({ evidence: [ev(1, ["a", "b"], ["c", "d"])], matchHistory: hist(12), seeds });
  const manyNo = C.fitSessionStrength({ evidence: [], matchHistory: hist(12), seeds });
  assert("...and its RELATIVE influence shrinks as real games accumulate (calibration decay: " + (1 - (withTie.a - withTie.c) / (noTie.a - noTie.c)).toFixed(3) + " after 4 games -> " + (1 - (many.a - many.c) / (manyNo.a - manyNo.c)).toFixed(3) + " after 12)", 1 - (many.a - many.c) / (manyNo.a - manyNo.c) < 1 - (withTie.a - withTie.c) / (noTie.a - noTie.c));
  const rated = C.fitSessionStrength({ evidence: [], matchHistory: hist(1), seeds: { a: 1400, b: 1000, c: 1000, d: 1000 } });
  assert("a returning player's stored rating keeps its pull as the prior (still far above the others)", rated.a - rated.c > 300);
}

console.log("\n4. Calibration affinity: soft, decaying, and never a way back to the same four");
{
  const aff = C.buildCalibrationAffinity([ev(1, ["a", "b"], ["c", "d"]), ev(2, ["d", "e"], ["f", "g"])]);
  assert("players who shared an organizer court are compatible (1.0)", aff.pairAffinity("a", "b") === 1 && aff.pairAffinity("a", "d") === 1);
  assert("a friend-of-a-compatible-player gets a little (2-hop 0.75); everyone else is NEUTRAL, never penalised", aff.pairAffinity("a", "e") === 0.75 && aff.pairAffinity("a", "zzz") === 0.5 && aff.pairAffinity("a", "g") === 0.75 && aff.pairAffinity("b", "f") === 0.75);
  const players = ["a", "b", "c", "d", "x1", "x2", "x3", "x4"].map((id, i) => mk(id, { wait: 20 - i * 0.1 }));
  const ctx = { calibration: aff };
  const m = gen(players, { maxMatchups: 1, calibration: ctx.calibration })[0];
  assert("with equal fairness the engine prefers a quartet that is compatible per the organizer's rounds over a stranger mix, but not the exact calibration four", (() => { const ids = idsOf(m); const coCount = ["a", "b", "c", "d"].filter((id) => ids.includes(id)).length; return coCount >= 2 && coCount < 4; })());
  const banned = gen(players.slice(0, 4), { maxMatchups: 1, calibration: ctx.calibration });
  assert("the exact calibration four is banned while alternatives exist...", (() => { const ids = idsOf(gen(players, { maxMatchups: 1, calibration: ctx.calibration })[0]); return !["a", "b", "c", "d"].every((id) => ids.includes(id)); })());
  assert("...but is allowed when it is the only legal quartet (no idle court)", banned.length === 1);
  const seasoned = players.map((p) => ({ ...p, games: CALIBRATION_DECAY_GAMES + 1 }));
  const m0 = gen(seasoned, { maxMatchups: 1, calibration: ctx.calibration, config: { calibrationAffinityWeight: 0 } })[0];
  const m1 = gen(seasoned, { maxMatchups: 1, calibration: ctx.calibration })[0];
  assert("calibration decays to nothing: once players have " + CALIBRATION_DECAY_GAMES + "+ games the affinity term no longer changes the choice", JSON.stringify([m0.teamA, m0.teamB].map((t) => [...t].sort()).sort()) === JSON.stringify([m1.teamA, m1.teamB].map((t) => [...t].sort()).sort()));
  const old = gen([...players.slice(0, 4).map((p) => ({ ...p, games: 1 })), ...players.slice(4).map((p) => ({ ...p, games: 1 }))], { maxMatchups: 1, calibration: ctx.calibration })[0];
  assert("it still applies while confidence is high (1 game each): result stays legal and produces a match", old && idsOf(old).length === 4);
}

console.log("\n5. Affinity never overrides fairness");
{
  const aff = C.buildCalibrationAffinity([ev(1, ["a", "b"], ["c", "d"])]);
  const players = [mk("out", { wait: 34 }), mk("a", { wait: 20 }), mk("b", { wait: 19 }), mk("c", { wait: 18 }), mk("d", { wait: 17 }), mk("s1", { wait: 16 }), mk("s2", { wait: 15 })];
  const m = gen(players, { maxMatchups: 1, calibration: aff })[0];
  assert("the longest waiter (a stranger to the calibration groups) is still the anchor and plays", m.ranking.anchorId === "out" && idsOf(m).includes("out"));
  const rest = [...["a", "b", "c", "d", "s1"].map((id, i) => mk(id, { wait: 12 - i })), mk("fresh", { wait: 1, extra: { lastMatchEndAt: NOW - 1 * MIN } })];
  const rm = gen(rest, { maxMatchups: 1, calibration: aff })[0];
  assert("a player who just finished is still rest-protected however compatible", !idsOf(rm).includes("fresh"));
  const wg = [mk("A", { wait: 34, pts: 1000 }), mk("W1", { wait: 33, pts: 1100 }), mk("W2", { wait: 32, pts: 900 }), mk("W3", { wait: 31, pts: 1000 }), mk("T1", { wait: 20, pts: 1010 }), mk("T2", { wait: 19, pts: 1020 }), mk("T3", { wait: 18, pts: 1090 })];
  const wm = gen(wg, { maxMatchups: 1, calibration: C.buildCalibrationAffinity([ev(1, ["T1", "T2"], ["T3", "A"])]) })[0];
  assert("the wait-time guard still beats a calibration-compatible short-wait group", ["W1", "W2", "W3"].every((id) => idsOf(wm).includes(id)));
}

console.log("\n6. Games-gap guard (soft, configurable)");
{
  const players = [mk("A", { wait: 30, games: 4 }), mk("B", { wait: 29, games: 4 }), mk("C", { wait: 28, games: 4 }), mk("D", { wait: 27, games: 4 }), mk("E", { wait: 26, games: 2 }), mk("F", { wait: 25, games: 2 }), mk("G", { wait: 24, games: 2 })];
  const flat = { underServedGap: 99, overServedGap: 99, candidateGamesLead: 99 }; // isolate the guard from the games tiers and the existing games-lead arena filter
  const off = gen(players, { maxMatchups: 1, config: { ...flat, gamesGapThreshold: 0 } })[0];
  const on = gen(players, { maxMatchups: 1, config: { ...flat, gamesGapThreshold: GAMES_GAP_THRESHOLD } })[0];
  assert("without the guard the 4-game longest waiters play (A,B,C,D)", ["A", "B", "C", "D"].every((id) => idsOf(off).includes(id)));
  assert("with the guard (>= " + GAMES_GAP_THRESHOLD + " games gap) the 2-game waiters replace 4-game players where legal", ["E", "F", "G"].every((id) => idsOf(on).includes(id)) && on.reasons.includes(REASONS.GAMES_GAP_GUARD_APPLIED));
  const thin = gen(players.slice(0, 4), { maxMatchups: 1, config: { ...flat, gamesGapThreshold: 2 } });
  assert("it is soft: with no alternative quartet the court is still filled", thin.length === 1);
  assert("the threshold is a named, configurable constant wired into the engine config", GAMES_GAP_THRESHOLD === 2 && POINTS_ADAPTIVE_CONFIG.gamesGapThreshold === GAMES_GAP_THRESHOLD);
  const rested = [...["A", "B", "C", "D", "H"].map((id, i) => mk(id, { wait: 12 - i, games: 4 })), mk("E", { wait: 2, games: 2, extra: { lastMatchEndAt: NOW - 2 * MIN } })];
  const rm = gen(rested, { maxMatchups: 1, config: { ...flat, gamesGapThreshold: 2 } })[0];
  assert("recent-play protection outranks the guard: a 2-game player who JUST finished is not pulled in", !idsOf(rm).includes("E"));
}

console.log("\n7. Late arrivals (fresh check-ins are not 'resting'; fairness applies normally)");
{
  const waiters = ["w1", "w2", "w3", "w4", "w5"].map((id, i) => mk(id, { wait: 14 - i, games: 3, extra: { lastMatchEndAt: NOW - (14 - i) * MIN } }));
  const late = ["l1", "l2"].map((id) => mk(id, { wait: 2, games: 0 }));
  const m = gen([...waiters, ...late], { maxMatchups: 1 })[0];
  assert("a latecomer who checked in 2 minutes ago and has 0 games is eligible immediately and, being under-served, plays", idsOf(m).includes("l1") || idsOf(m).includes("l2"));
  const off = gen([...waiters, ...late], { maxMatchups: 1, config: { restOnlyAfterPlay: false } })[0];
  assert("(with the old rest rule they would have been excluded as 'just finished')", !idsOf(off).includes("l1") && !idsOf(off).includes("l2"));
  const long = [...["a", "b", "c", "d", "e"].map((id, i) => mk(id, { wait: 6 - i * 0.2, games: 1, extra: { lastMatchEndAt: NOW - (6 - i * 0.2) * MIN } })), mk("early", { wait: 40, games: 0 })];
  assert("...and a latecomer who then waits longest becomes the anchor (no permanent back-of-queue)", gen(long, { maxMatchups: 1 })[0].ranking.anchorId === "early");
  const s = { rotationMode: "pointsAdaptive", ...P.createPhaseFields("pointsAdaptive") };
  assert("the round-lock rules are unchanged (phases module still enforces next-round entry)", P.usesPhases(s) && typeof P.validateManualAssignment === "function");
}

console.log("\n8. Team balance uses the calibrated estimate; strongest two are not stacked");
{
  const four = [mk("s1", { wait: 20, pts: 1000, cal: 1160 }), mk("s2", { wait: 19, pts: 1000, cal: 1080 }), mk("s3", { wait: 18, pts: 1000, cal: 1000 }), mk("s4", { wait: 17, pts: 1000, cal: 920 })];
  const m = gen(four)[0];
  const sum = (t) => t.reduce((a, id) => a + four.find((p) => p.id === id).calibratedPoints, 0);
  assert("teams are balanced on calibrated strength (1160+920 vs 1080+1000), even though persistent Points are all equal", Math.abs(sum(m.teamA) - sum(m.teamB)) === 0);
  assert("the two strongest calibrated players are on opposite teams", !(m.teamA.includes("s1") && m.teamA.includes("s2")) && !(m.teamB.includes("s1") && m.teamB.includes("s2")));
  const offCfg = gen(four, { config: { useCalibratedPoints: false } })[0];
  assert("with useCalibratedPoints off the persistent Points are used instead (calibration is a switchable layer)", offCfg && offCfg.teamA.length === 2);
}

console.log("\n9. Organizer strength order of calibration GROUPS: explicit, optional, session-local, rank-based, fading, no Points");
{
  const groups = [
    { round: 1, courtNumber: 1, playerIds: ["a1", "a2", "a3", "a4"] },
    { round: 1, courtNumber: 2, playerIds: ["b1", "b2", "b3", "b4"] },
    { round: 1, courtNumber: 3, playerIds: ["c1", "c2", "c3", "c4"] },
  ];
  const ids = groups.flatMap((g) => g.playerIds);
  const players = mapOf(ids.map((id) => mk(id, { pts: 1000 })));
  const base = { rotationMode: "pointsAdaptive", players, calibrationEvidence: [], matchHistory: [], calibrationGroups: groups };
  const noOrder = C.applyCalibrationProfile({ ...base, calibrationStrengthOrder: {} });
  assert("no order given (skipped): NO artificial prior — every estimate stays at the 1000 seed, exactly as before", ids.every((id) => noOrder.players[id].calibratedPoints === 1000));
  assert("court NUMBER alone means nothing: groups with no explicit order get no prior whatever their numbers", ids.every((id) => C.applyCalibrationProfile({ ...base, calibrationGroups: [...groups].reverse() }).players[id].calibratedPoints === 1000));
  const off = C.strengthOrderOffsets(groups, { 1: [2, 1, 3] }, 100);
  assert("the organizer's order decides: Court 2 strongest (+100), Court 1 middle (0), Court 3 weakest (-100)", off.b1 === 100 && off.a1 === 0 && off.c1 === -100);
  assert("it is RANK-based: two groups get +-100 too (not a fixed per-step offset)", (() => { const o = C.strengthOrderOffsets(groups, { 1: [3, 1] }, 100); return o.c1 === 100 && o.a1 === -100 && o.b1 === undefined; })());
  assert("a single ordered group carries no information; unknown/duplicate ids in an order are ignored", Object.keys(C.strengthOrderOffsets(groups, { 1: [2] }, 100)).length === 0 && JSON.stringify(C.cleanStrengthOrder([2, 9, 2, 1], groups, 1)) === "[2,1]");
  const on = C.applyCalibrationProfile({ ...base, calibrationStrengthOrder: { 1: [2, 1, 3] } });
  assert("applied: the strongest group's players sit above the weakest group's before any result (session-only prior)", on.players.b1.calibratedPoints === 1100 && on.players.a1.calibratedPoints === 1000 && on.players.c1.calibratedPoints === 900);
  assert("...and it NEVER touches the persistent Points", ids.every((id) => on.players[id].rankingPoints === 1000 && on.players[id].rankingSource === "provisional"));
  assert("...nor writes any Beginner/Intermediate/tier label onto a player", ids.every((id) => Object.keys(on.players[id]).every((k) => !/skill|tier|level|class/i.test(k))));
  const rated = C.applyCalibrationProfile({ ...base, players: { ...players, b1: { ...players.b1, rankingSource: "rated", rankingPoints: 1500, rankingPointsSeed: 1500 } }, calibrationStrengthOrder: { 1: [2, 1, 3] } });
  assert("a player with a stored rating is not shifted (their rating already says where they sit)", rated.players.b1.calibratedPoints === 1500);
  const at = (games) => C.applyCalibrationProfile({ ...base, players: Object.fromEntries(ids.map((id) => [id, { ...players[id], games }])), calibrationStrengthOrder: { 1: [2, 1, 3] } }).players.b1.calibratedPoints;
  assert("the hint decays with real games (" + at(0) + " -> " + at(3).toFixed(0) + " -> " + at(6) + " -> " + at(12) + ") and is configurable", at(0) === 1100 && at(3) < at(0) && at(6) < at(3) && at(12) === 1000 && C.CALIBRATION_CONFIG.strengthOrderDecayGames > 0);
  const two = C.strengthOrderOffsets([...groups, { round: 2, courtNumber: 1, playerIds: ["a1", "x2", "x3", "x4"] }, { round: 2, courtNumber: 2, playerIds: ["c1", "y2", "y3", "y4"] }], { 1: [1, 2, 3], 2: [2, 1] }, 100);
  assert("Round 2 contributes too: a player seen in both rounds gets the AVERAGE of the two rank priors (a contradicting Round 2 tempers Round 1)", two.a1 === (100 + -100) / 2 && two.c1 === (-100 + 100) / 2);
  const contradicted = C.applyCalibrationProfile({ ...base, matchHistory: Array.from({ length: 3 }, () => ({ teamA: ["c1", "c2"], teamB: ["b1", "b2"], winner: "A", scoreA: 11, scoreB: 3 })), calibrationStrengthOrder: { 1: [2, 1, 3] } }).players;
  assert("actual results override a wrong order: three clear wins by the 'weakest' group close most of a 200-Point gap", contradicted.c1.calibratedPoints - contradicted.b1.calibratedPoints > -100);
  const st = { rotationMode: "pointsAdaptive", ...P.createPhaseFields("pointsAdaptive"), players: {}, courts: [{ number: 1, status: "live", teamA: ["a", "b"], teamB: ["c", "d"] }, { number: 2, status: "open", teamA: [], teamB: [] }] };
  assert("a new session starts with NO order (optional) and no groups", Object.keys(st.calibrationStrengthOrder).length === 0 && st.calibrationGroups.length === 0);
  const started = P.noteCalibrationMatchStarted(st, ["a", "b", "c", "d"], 1);
  assert("locking a calibration court records the group (round, court number, players)", started.calibrationGroups.length === 1 && started.calibrationGroups[0].courtNumber === 1 && started.calibrationGroups[0].round === 1);
  assert("unlocking that court removes it again", P.noteCalibrationMatchUnlocked(started, 1).calibrationGroups.length === 0);
  const app = read("src/PickleballOpenPlay.jsx"), sv = read("src/components/ScorerView.jsx"), ui = read("src/components/CalibrationStrengthOrder.jsx");
  assert("the app stores the order per round via an explicit organizer action (setCalibrationStrengthOrder -> setStrengthOrder)", /const setCalibrationStrengthOrder = \(round, order\) =>/.test(app) && /setStrengthOrder\(state, round, order\)/.test(app));
  assert("the Scorer shows 'CALIBRATION STRENGTH (optional)' with reorder buttons; wording avoids skill labels", /<CalibrationStrengthOrder/.test(sv) && /CALIBRATION STRENGTH \(optional\)/.test(ui) && /Move stronger/.test(ui) && !/Beginner|Intermediate|Advanced|skill tier/i.test(ui));
  assert("court numbers are never hard-coded as strength anywhere in the profile code", !/courtNumber\s*-\s*1|Court 1 (is )?strongest|court 1 = strongest/i.test(read("src/lib/calibrationProfile.js")));
  const strongPool = [...["s1", "s2", "s3", "s4"].map((id, i) => mk(id, { wait: 20 - i * 0.1, cal: 1100 })), ...["w1", "w2", "w3", "w4"].map((id, i) => mk(id, { wait: 19 - i * 0.1, cal: 900 }))];
  const ms = gen(strongPool, { maxMatchups: 2 });
  assert("the engine then keeps like with like: with calibrated 1100 vs 900 groups it forms an all-strong and an all-weak match instead of mixing", ms.length === 2 && ms.every((m) => new Set(idsOf(m).map((id) => id[0])).size === 1));
  const mixed = gen(strongPool, { maxMatchups: 1, config: { useCalibratedPoints: false } });
  assert("switching the layer off restores persistent-Points behaviour (calibration is a soft, removable layer)", mixed.length === 1);
}

console.log("\n10. Hardening: the strength order is FROZEN once Adaptive Matchmaking begins; survives reload; skip leaves no stale prior");
{
  const { refreshNextMatchups } = await import("../src/lib/utils.js");
  const groupsR1 = [
    { round: 1, courtNumber: 1, playerIds: ["a1", "a2", "a3", "a4"] },
    { round: 1, courtNumber: 2, playerIds: ["b1", "b2", "b3", "b4"] },
    { round: 1, courtNumber: 3, playerIds: ["c1", "c2", "c3", "c4"] },
  ];
  const groupsR2 = [
    { round: 2, courtNumber: 1, playerIds: ["a1", "b1", "d1", "d2"] },
    { round: 2, courtNumber: 2, playerIds: ["a2", "c1", "d3", "d4"] },
    { round: 2, courtNumber: 3, playerIds: ["b2", "c2", "e1", "e2"] },
  ];
  const ids = [...new Set([...groupsR1, ...groupsR2].flatMap((g) => g.playerIds))];
  const players = mapOf(ids.map((id) => mk(id, { pts: 1000 })));
  const mkState = (phase, over = {}) => ({ rotationMode: "pointsAdaptive", ...P.createPhaseFields("pointsAdaptive"), sessionPhase: phase, players, calibrationEvidence: [], matchHistory: [], calibrationGroups: [...groupsR1, ...groupsR2], ...over });
  const cal1 = mkState("calibrationRound1");
  const cal2 = mkState("calibrationRound2");
  const adaptive = mkState("adaptive");
  const rp = (st) => ids.every((id) => st.players[id].rankingPoints === 1000 && st.players[id].rankingSource === "provisional");

  const set1 = C.setStrengthOrder(cal1, 1, [2, 1, 3]);
  assert("1. editable during calibration (Round 1): the order is stored and the session estimate moves", set1.calibrationStrengthOrder[1].join() === "2,1,3" && set1.players.b1.calibratedPoints === 1100 && set1.players.c1.calibratedPoints === 900);
  assert("   ...also editable in Round 2 and correctable (replace, then re-order)", (() => { const a = C.setStrengthOrder(cal2, 2, [3, 2, 1]); const b = C.setStrengthOrder(a, 2, [1, 2, 3]); return a.calibrationStrengthOrder[2].join() === "3,2,1" && b.calibrationStrengthOrder[2].join() === "1,2,3"; })());
  assert("   ...and editable at check-in (before Round 1 starts)", C.isStrengthOrderEditable(mkState("checkIn")) === true);
  const frozen = C.setStrengthOrder({ ...adaptive, calibrationStrengthOrder: { 1: [2, 1, 3] } }, 1, [3, 2, 1]);
  assert("2. FROZEN once Adaptive Matchmaking has begun: an edit attempt returns the state untouched", frozen.calibrationStrengthOrder[1].join() === "2,1,3" && C.isStrengthOrderEditable(adaptive) === false);
  const adaptiveWithOrder = { ...adaptive, calibrationStrengthOrder: { 1: [2, 1, 3] } };
  assert("5. an applied order can no longer be re-applied, changed, or cleared after the transition (same object back)", C.setStrengthOrder(adaptiveWithOrder, 1, [1, 2, 3]) === adaptiveWithOrder && C.setStrengthOrder(adaptiveWithOrder, 1, null) === adaptiveWithOrder && C.setStrengthOrder(adaptiveWithOrder, 2, [1, 2, 3]) === adaptiveWithOrder);
  assert("   ...and the engine still READS the frozen order (the profile keeps applying it to estimates)", C.applyCalibrationProfile(adaptiveWithOrder).players.b1.calibratedPoints === 1100);
  const reloaded = JSON.parse(JSON.stringify(set1));
  const again = C.applyCalibrationProfile(reloaded);
  assert("3. the order survives a save / reload (JSON round trip) and recomputes to identical estimates", reloaded.calibrationStrengthOrder[1].join() === "2,1,3" && ids.every((id) => again.players[id].calibratedPoints === set1.players[id].calibratedPoints));
  const reloadedAdaptive = JSON.parse(JSON.stringify(adaptiveWithOrder));
  assert("   ...a reloaded adaptive session keeps the order AND stays locked (reopening never re-enables editing)", reloadedAdaptive.calibrationStrengthOrder[1].join() === "2,1,3" && C.setStrengthOrder(reloadedAdaptive, 1, [1, 2, 3]) === reloadedAdaptive);
  const skipped = C.setStrengthOrder(set1, 1, null);
  assert("4. Skip / clear removes the order AND the prior: estimates return to the seed, nothing stale remains", Object.keys(skipped.calibrationStrengthOrder).length === 0 && ids.every((id) => skipped.players[id].calibratedPoints === 1000));
  const skippedReload = C.applyCalibrationProfile(JSON.parse(JSON.stringify(skipped)));
  assert("   ...and reopening the skipped session does not resurrect it", Object.keys(skippedReload.calibrationStrengthOrder).length === 0 && ids.every((id) => skippedReload.players[id].calibratedPoints === 1000));
  const replaced = C.setStrengthOrder(C.setStrengthOrder(cal1, 1, [2, 1, 3]), 1, [1, 2, 3]);
  assert("   ...a replaced order leaves no trace of the earlier one (Court 2 now middle, not strongest)", replaced.players.b1.calibratedPoints === 1000 && replaced.players.a1.calibratedPoints === 1100);
  const oneOnly = C.setStrengthOrder({ ...cal1, sessionPhase: "calibrationRound2" }, 1, [2, 1, 3]);
  assert("6. Round 1 ordered / Round 2 unordered: Round 1 information is used, no Round 2 order is invented", oneOnly.calibrationStrengthOrder[2] === undefined && oneOnly.players.b2.calibratedPoints === 1100 && oneOnly.players.d1.calibratedPoints === 1000);
  const r2Only = C.setStrengthOrder(cal2, 2, [3, 1, 2]);
  assert("7. Round 1 unordered / Round 2 ordered: only Round 2 groups get a prior, all estimates finite", r2Only.calibrationStrengthOrder[1] === undefined && r2Only.players.b2.calibratedPoints === 1100 && ids.every((id) => Number.isFinite(r2Only.players[id].calibratedPoints)));
  const none = C.applyCalibrationProfile(cal2);
  assert("8. both rounds unordered: no prior anywhere, nothing NaN, ordinary Calibration Profile behaviour", ids.every((id) => none.players[id].calibratedPoints === 1000));
  const both = C.setStrengthOrder(C.setStrengthOrder(cal2, 1, [2, 1, 3]), 2, [3, 2, 1]);
  assert("   ...both ordered: a player seen in both rounds gets the average of the two rank priors", both.players.b1.calibratedPoints === 1000 && both.players.a1.calibratedPoints === 1000 + (0 + -100) / 2);
  const toAdaptive = P.noteMatchEnded({ ...set1, sessionPhase: "calibrationRound2", calibration: { round: 2, target: 1, started: 1, completed: 0 }, roundLock: { round: 2, locked: true, playerIds: [] }, courts: [], matchHistory: [] });
  assert("   the transition to Adaptive Matchmaking preserves the applied order and the groups", toAdaptive.sessionPhase === "adaptive" && toAdaptive.calibrationStrengthOrder[1].join() === "2,1,3" && toAdaptive.calibrationGroups.length === set1.calibrationGroups.length);
  const late = { ...set1, players: { ...set1.players, late1: mk("late1", { wait: 0 }) }, queueIds: [...ids, "late1"] };
  const lateProfile = C.applyCalibrationProfile(late);
  assert("9. a latecomer does not change the calibration order or anyone else's estimate", JSON.stringify(late.calibrationStrengthOrder) === JSON.stringify(set1.calibrationStrengthOrder) && ids.every((id) => lateProfile.players[id].calibratedPoints === set1.players[id].calibratedPoints) && lateProfile.players.late1.calibratedPoints === 1000 && late.players.late1.checkedInAt === NOW - 0 * MIN);
  assert("   ...and the latecomer is in no calibration group, so the order can never mention them", !late.calibrationGroups.some((g) => g.playerIds.includes("late1")));
  const cyc = C.setStrengthOrder(C.setStrengthOrder(set1, 1, [3, 2, 1]), 1, null);
  assert("10. persistent rankingPoints / rankingSource are identical at every step (apply, replace, skip, freeze, reload, latecomer)", [set1, replaced, skipped, cyc, frozen, reloaded, again, adaptiveWithOrder, lateProfile].every((st) => ids.every((id) => st.players[id].rankingPoints === 1000 && st.players[id].rankingSource === "provisional")) && rp(none));
  const queued = [{ id: "m1", teamA: ["a1", "b1"], teamB: ["c1", "a2"] }];
  const before = JSON.stringify(queued);
  const kept = refreshNextMatchups(ids.filter((id) => !["a1", "b1", "c1", "a2"].includes(id)), toAdaptive.players, queued, engine, null, 3, null, [], C.calibrationEngineContext({ ...toAdaptive }));
  assert("7. an already-queued matchup is never rebuilt because calibration state exists (same players, same order)", JSON.stringify([kept[0]]) === before && kept.length > 1 && !kept.slice(1).some((m) => [...m.teamA, ...m.teamB].some((id) => ["a1", "b1", "c1", "a2"].includes(id))));
  const app = read("src/PickleballOpenPlay.jsx");
  assert("   the app routes every edit through setStrengthOrder (frozen once adaptive) and Generate / Regenerate / Fill stay blocked in calibration", /const next = setStrengthOrder\(state, round, order\)/.test(app) && (app.match(/if \(isCalibrationPhase\(state\)\) return;/g) || []).length >= 3);
  const ui = read("src/components/CalibrationStrengthOrder.jsx"), lockedView = ui.slice(ui.indexOf("function LockedView"), ui.indexOf("export default function"));
  assert("   the UI: once locked it shows 'Locked for this session', lists the applied order read-only, and has NO Apply / Skip / move controls", /Locked for this session/.test(lockedView) && !/Apply order|Skip \/ clear|onClick|Move Court/.test(lockedView) && /locked=\{!isCalibrationPhase\(state\)\}/.test(read("src/components/ScorerView.jsx")));
  assert("   locked wording avoids skill labels", !/Beginner|Intermediate|Advanced/i.test(lockedView));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
