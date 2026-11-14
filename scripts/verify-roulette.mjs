// Roulette (random-draw rounds) — automated, headless coverage of
// lib/roulette.js: the draw (sit-out rotation, no repeat partners, minimal
// repeat opponents), the round state machine, Start Round / Redraw, the
// round clock, the tie rule, a full 22-player / 4-court / 12-round
// simulation, the Roulette alert, plus source-level wiring checks.
// See FEATURES.md ("Roulette mode").
//
// Usage: node scripts/verify-roulette.mjs
import fs from "node:fs";
import {
  ROULETTE_MODE, ROULETTE_DEFAULTS, ROULETTE_PHASES, isRouletteMode, createRouletteFields, rouletteOf, seededRandom, pairHistory, sitCounts,
  roulettePool, rouletteRepeats, drawRouletteRound, rouletteAdvance, redrawRouletteRound, startRouletteRound, rouletteClock, formatClock,
  rouletteScoreProblem, rouletteStatusText, rouletteForecast,
  rouletteFinalists, createRouletteFinal, rouletteFinalScoreProblem, setRouletteFinalScore, clearRouletteFinal, rouletteFinalView,
} from "../src/lib/roulette.js";
import { buildStandingsRows, standingsOrderFor } from "../src/lib/performanceRating.js";
import { computePodium } from "../src/lib/podium.js";
import { computeSessionAnalyticsReport } from "../src/lib/sessionAnalytics.js";
import { buildSessionReportExportTable } from "../src/lib/sessionReportExport.js";
import { buildOpenPlayFinalSummary } from "../src/lib/publicFinalSummary.js";
import { computeAlerts } from "../src/lib/alerts.js";
import { getRotationEngine, refreshNextMatchups } from "../src/lib/utils.js";
import { ROTATION_MODES, ROTATION_MODE_DESCRIPTIONS, rotationModeLabelFor, defaultState, emptyCourt } from "../src/lib/constants.js";

let pass = 0;
let fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); } else { fail++; console.log(`  FAIL: ${desc}`); }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const NOW = 1_800_000_000_000;
const P = ROULETTE_PHASES;

const mkPlayers = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, { id: `p${i + 1}`, name: `P${i + 1}`, checkedIn: true, status: "ACTIVE", games: 0, wins: 0, losses: 0 }]));
const session = (n, courts, over = {}) => {
  const players = mkPlayers(n);
  return { ...defaultState, rotationMode: "roulette", ...createRouletteFields("roulette"), players, queueIds: Object.keys(players), courts: Array.from({ length: courts }, (_, i) => emptyCourt(i + 1)), nextMatchups: [], matchHistory: [], queueingStarted: true, ...over };
};
// What endMatch does that Roulette cares about: record the match, count the game, free the court, requeue the players.
function finishAllCourts(s) {
  const hist = [...s.matchHistory];
  const pl = { ...s.players };
  const q = [...s.queueIds];
  for (const c of s.courts) {
    if (c.status === "open") continue;
    hist.push({ round: hist.length + 1, teamA: c.teamA, teamB: c.teamB, winner: "A" });
    for (const id of [...c.teamA, ...c.teamB]) { pl[id] = { ...pl[id], games: pl[id].games + 1 }; q.push(id); }
  }
  return { ...s, players: pl, queueIds: q, matchHistory: hist, courts: s.courts.map((c) => emptyCourt(c.number)) };
}
function playWholeSession(n, courts, seed, over = {}) {
  const rng = seededRandom(seed);
  let s = session(n, courts, over);
  const drawRepeats = [];
  let t = NOW;
  for (let guard = 0; guard < 100 && rouletteOf(s).phase !== P.COMPLETE; guard++) {
    s = rouletteAdvance(s, t, rng);
    if (rouletteOf(s).phase !== P.DRAWN) break;
    drawRepeats.push(rouletteRepeats(s.nextMatchups, s.matchHistory));
    s = rouletteAdvance(startRouletteRound(s), t, rng);
    t += 12 * 60000;
    s = rouletteAdvance(finishAllCourts(s), t, rng);
  }
  return { s, drawRepeats };
}

console.log("\n1. Mode registration");
assert("Roulette is a selectable standard mode, last in the list, never the default", ROTATION_MODES[ROTATION_MODES.length - 1].value === "roulette" && defaultState.rotationMode === "adaptiveSkill" && ROULETTE_MODE === "roulette");
assert("it has a label and a plain-language description", /Roulette/.test(rotationModeLabelFor("roulette")) && /never the same partner twice/.test(ROTATION_MODE_DESCRIPTIONS.roulette) && /11 points or the round timer/.test(ROTATION_MODE_DESCRIPTIONS.roulette));
assert("createRouletteFields honours Create Session's rounds / timer and falls back on garbage", createRouletteFields("roulette", { totalRounds: 8, roundMinutes: 9 }).roulette.totalRounds === 8 && createRouletteFields("roulette", { totalRounds: 8, roundMinutes: 9 }).roulette.roundMinutes === 9 && createRouletteFields("roulette", { totalRounds: "x", roundMinutes: 0 }).roulette.totalRounds === 12 && createRouletteFields("roulette", { roundMinutes: 0 }).roulette.roundMinutes === 11);
assert("rouletteForecast: 22 players, 4 courts, 12 rounds of 11 min -> 16 play, 6 sit, 8-9 games, 132 min", JSON.stringify(rouletteForecast({ players: 22, courts: 4, totalRounds: 12, roundMinutes: 11 })) === JSON.stringify({ courtsUsed: 4, playPerRound: 16, sitPerRound: 6, gamesMin: 8, gamesMax: 9, playMinutes: 132 }));
assert("rouletteForecast: 16 players / 4 courts -> nobody sits, 12 games each; 9 players / 4 courts -> 2 courts; under 4 players -> null", rouletteForecast({ players: 16, courts: 4, totalRounds: 12, roundMinutes: 11 }).sitPerRound === 0 && rouletteForecast({ players: 16, courts: 4, totalRounds: 12, roundMinutes: 11 }).gamesMin === 12 && rouletteForecast({ players: 9, courts: 4, totalRounds: 6, roundMinutes: 10 }).courtsUsed === 2 && rouletteForecast({ players: 3, courts: 4, totalRounds: 12, roundMinutes: 11 }) === null);
{
  const cs = strip(read("src/components/CreateSessionScreen.jsx"));
  assert("Create Session: Session Duration only for Progressive Skill; Rounds section + forecast for Roulette", /const needsDuration = !isTournament && rotationMode === "progressiveSkill";/.test(cs) && /\{needsDuration && \(/.test(cs) && /\{isRoulette && \(/.test(cs) && /data-testid="roulette-forecast"/.test(cs));
  assert("Create Session passes the Roulette choices to startSession, which seeds the session with them", /isRoulette \? \{ roulette: \{ totalRounds: Math\.round\(Number\(rouletteRounds\)\), roundMinutes: Math\.round\(Number\(rouletteMinutes\)\) \} \} : null/.test(cs) && /createRouletteFields\(rotationMode, sessionOptions\?\.roulette\)/.test(strip(read("src/PickleballOpenPlay.jsx"))));
}
assert("defaults: 12 rounds, 11 minutes, games to 11", ROULETTE_DEFAULTS.totalRounds === 12 && ROULETTE_DEFAULTS.roundMinutes === 11 && ROULETTE_DEFAULTS.gamePoints === 11);
assert("createRouletteFields: fields for roulette, {} for every other mode", createRouletteFields("roulette").roulette.phase === P.WAITING && createRouletteFields("roulette").roulette.round === 0 && Object.keys(createRouletteFields("adaptiveSkill")).length === 0);
assert("rouletteOf tolerates a missing / garbage record", rouletteOf({}).totalRounds === 12 && rouletteOf({ roulette: { totalRounds: "x", phase: "??", round: -3 } }).phase === P.WAITING && rouletteOf({ roulette: { totalRounds: "x" } }).round === 0);
assert("the engine interface is inert for Roulette (no engine path can add a matchup)", getRotationEngine("roulette").generateMatchups({ waitingIds: ["a", "b", "c", "d"], players: {}, existingMatchups: [] }).length === 0 && refreshNextMatchups(["p1", "p2", "p3", "p4"], mkPlayers(4), [], getRotationEngine("roulette")).length === 0);
assert("every Roulette function is a no-op for other modes", (() => { const s = { ...session(8, 2), rotationMode: "adaptiveSkill" }; return rouletteAdvance(s, NOW) === s && startRouletteRound(s) === s && redrawRouletteRound(s) === s && rouletteClock(s, NOW) === null && rouletteScoreProblem(s, 5, 5) === null && rouletteStatusText(s) === "" && !isRouletteMode(s); })());

console.log("\n2. The draw");
{
  const s = session(22, 4);
  const d = drawRouletteRound(s, { rng: seededRandom(7) });
  const ids = d.matchups.flatMap((m) => [...m.teamA, ...m.teamB]);
  assert("22 players, 4 courts -> 4 matchups of 2 v 2, 16 distinct players, 6 sit", d.matchups.length === 4 && d.matchups.every((m) => m.teamA.length === 2 && m.teamB.length === 2) && new Set(ids).size === 16 && d.sat.length === 6);
  assert("nobody both plays and sits; everyone is accounted for", d.sat.every((id) => !ids.includes(id)) && new Set([...ids, ...d.sat]).size === 22);
  assert("matchups carry the round number and unique ids", d.matchups.every((m) => m.rouletteRound === 1) && new Set(d.matchups.map((m) => m.id)).size === 4);
  assert("first draw has no repeats", d.repeats.length === 0);
  assert("same seed -> same seating (reproducible)", JSON.stringify(drawRouletteRound(s, { rng: seededRandom(7) }).matchups.map((m) => [m.teamA, m.teamB])) === JSON.stringify(d.matchups.map((m) => [m.teamA, m.teamB])));
  assert("different seed -> different seating (it is random)", JSON.stringify(drawRouletteRound(s, { rng: seededRandom(8) }).matchups.map((m) => [m.teamA, m.teamB])) !== JSON.stringify(d.matchups.map((m) => [m.teamA, m.teamB])));
  assert("fewer than 4 players -> no draw", drawRouletteRound(session(3, 4)).matchups.length === 0);
  assert("more courts than players can fill -> only full courts are used (9 players, 4 courts -> 2 courts, 1 sits)", (() => { const x = drawRouletteRound(session(9, 4), { rng: seededRandom(1) }); return x.matchups.length === 2 && x.sat.length === 1; })());
  assert("exactly 16 players on 4 courts -> nobody sits", drawRouletteRound(session(16, 4), { rng: seededRandom(1) }).sat.length === 0);
  const held = session(22, 4); held.players.p1 = { ...held.players.p1, held: true }; held.players.p2 = { ...held.players.p2, status: "CHECKED_OUT" }; held.players.p3 = { ...held.players.p3, playStatus: "on_break" };
  const hd = drawRouletteRound(held, { rng: seededRandom(3) });
  assert("held, checked-out and on-break players are never drawn or counted as sitting", ![...hd.matchups.flatMap((m) => [...m.teamA, ...m.teamB]), ...hd.sat].some((id) => ["p1", "p2", "p3"].includes(id)) && roulettePool(held).length === 19);
  assert("Beginner / Intermediate tags are ignored (one mixed pool)", (() => { const x = session(8, 2); Object.values(x.players).forEach((p, i) => { p.skill = i < 4 ? "beginner" : "intermediate"; }); return drawRouletteRound(x, { rng: seededRandom(2) }).matchups.length === 2; })());
}

console.log("\n3. Pair history + repeats");
{
  const hist = [{ teamA: ["a", "b"], teamB: ["c", "d"] }, { teamA: ["a", "c"], teamB: ["b", "e"] }];
  const h = pairHistory(hist);
  assert("partners counted per team, opponents across teams", h.partners["a|b"] === 1 && h.partners["c|d"] === 1 && h.partners["a|c"] === 1 && h.opponents["a|c"] === 1 && h.opponents["a|d"] === 1 && h.opponents["b|c"] === 2 && h.opponents["a|b"] === 1 && !h.opponents["d|e"]);
  const rep = rouletteRepeats([{ id: "m", teamA: ["a", "b"], teamB: ["c", "f"] }], hist);
  assert("rouletteRepeats flags the repeat partner and the repeat opponents, with how often before", rep.some((x) => x.kind === "partner" && x.ids.join() === "a,b" && x.times === 1) && rep.some((x) => x.kind === "opponent" && [...x.ids].sort().join() === "b,c" && x.times === 2) && !rep.some((x) => x.ids.includes("f")));
  // strict partner rule: 4 players who have each partnered one other -> the draw must pick a new pairing
  const s = session(4, 1, { matchHistory: [{ teamA: ["p1", "p2"], teamB: ["p3", "p4"] }] });
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = drawRouletteRound(s, { rng: seededRandom(seed) }).matchups[0];
    const teams = [m.teamA.slice().sort().join(), m.teamB.slice().sort().join()];
    if (teams.includes("p1,p2") || teams.includes("p3,p4")) { fail++; console.log(`  FAIL: seed ${seed} repeated a partner`); }
  }
  assert("with a non-repeating seating available, a partner is never repeated (6 seeds)", true);
}

console.log("\n4. Round state machine");
{
  let s = session(22, 4, { queueingStarted: false });
  assert("nothing is drawn before Start Queuing", rouletteAdvance(s, NOW, seededRandom(1)) === s && /Start Queuing/.test(rouletteStatusText(s)));
  s = { ...s, queueingStarted: true };
  s = rouletteAdvance(s, NOW, seededRandom(1));
  assert("waiting -> drawn: Round 1 sits in nextMatchups, nothing on court, no clock yet", rouletteOf(s).phase === P.DRAWN && rouletteOf(s).round === 1 && s.nextMatchups.length === 4 && s.courts.every((c) => c.status === "open") && rouletteClock(s, NOW) === null && /is drawn/.test(rouletteStatusText(s)));
  assert("advance is a no-op while the draw awaits review (same object)", rouletteAdvance(s, NOW, seededRandom(2)) === s);
  const redrawn = redrawRouletteRound(s, seededRandom(99));
  assert("Redraw: same round number, 4 fresh matchups, still drawn", rouletteOf(redrawn).round === 1 && rouletteOf(redrawn).phase === P.DRAWN && redrawn.nextMatchups.length === 4 && JSON.stringify(redrawn.nextMatchups.map((m) => m.id)) !== JSON.stringify(s.nextMatchups.map((m) => m.id)));
  const before = s;
  s = startRouletteRound(s);
  assert("Start Round: all 4 courts go LIVE at once (never 'dispatching'), queue drained of the 16", s.courts.every((c) => c.status === "live" && c.teamA.length === 2 && c.teamB.length === 2) && s.nextMatchups.length === 0 && s.queueIds.length === 6);
  assert("...with exactly the matchups that were drawn", JSON.stringify(s.courts.map((c) => [c.teamA, c.teamB])) === JSON.stringify(before.nextMatchups.map((m) => [m.teamA, m.teamB])));
  s = rouletteAdvance(s, NOW, seededRandom(1));
  assert("drawn -> playing: clock starts, the 6 sitters are recorded for the round", rouletteOf(s).phase === P.PLAYING && rouletteOf(s).roundStartedAt === NOW && rouletteOf(s).rounds.length === 1 && rouletteOf(s).rounds[0].sat.length === 6 && rouletteOf(s).rounds[0].round === 1);
  assert("Start Round / Redraw do nothing once the round is in play", startRouletteRound(s) === s && redrawRouletteRound(s) === s);
  {
    // part of a round started by hand: the same action starts the rest
    let x = rouletteAdvance(session(8, 2), NOW, seededRandom(1));
    const m = x.nextMatchups[0];
    x = rouletteAdvance({ ...x, nextMatchups: x.nextMatchups.slice(1), queueIds: x.queueIds.filter((id) => ![...m.teamA, ...m.teamB].includes(id)), courts: x.courts.map((c, i) => (i === 0 ? { ...c, status: "live", teamA: m.teamA, teamB: m.teamB } : c)) }, NOW, seededRandom(1));
    const rest = startRouletteRound(x);
    assert("a half-started round: Start remaining courts puts the queued matchup live without restarting the clock", rouletteOf(x).phase === P.PLAYING && x.nextMatchups.length === 1 && rest.nextMatchups.length === 0 && rest.courts.every((c) => c.status === "live") && rouletteOf(rouletteAdvance(rest, NOW + 5000, seededRandom(1))).roundStartedAt === NOW);
  }
  const clock = rouletteClock(s, NOW + 4 * 60000);
  assert("clock: 11:00 round, 7:00 left after 4 minutes, not expired", clock.remainingMs === 7 * 60000 && !clock.expired && formatClock(clock.remainingMs) === "7:00" && clock.endsAt === NOW + 11 * 60000);
  assert("clock: expired at 11 minutes and stays at 0", rouletteClock(s, NOW + 11 * 60000).expired && rouletteClock(s, NOW + 30 * 60000).remainingMs === 0 && formatClock(0) === "0:00" && formatClock(61500) === "1:02");
  // one court finishes: round continues
  const partial = { ...s, courts: s.courts.map((c, i) => (i === 0 ? emptyCourt(c.number) : c)) };
  assert("a court finishing early does not end the round or draw anything", rouletteAdvance(partial, NOW, seededRandom(1)) === partial);
  s = rouletteAdvance(finishAllCourts(s), NOW + 12 * 60000, seededRandom(5));
  assert("all courts done -> Round 2 is drawn immediately, clock cleared", rouletteOf(s).phase === P.DRAWN && rouletteOf(s).round === 2 && s.nextMatchups.length === 4 && rouletteOf(s).roundStartedAt === null);
  const r1sat = rouletteOf(s).rounds[0].sat;
  const r2ids = s.nextMatchups.flatMap((m) => [...m.teamA, ...m.teamB]);
  assert("everyone who sat Round 1 plays Round 2", r1sat.every((id) => r2ids.includes(id)));
  // undo: a finished match is put back on court after the next round was drawn
  const undone = { ...s, courts: s.courts.map((c, i) => (i === 0 ? { ...c, status: "live", teamA: r2ids.slice(0, 2), teamB: r2ids.slice(2, 4) } : c)) };
  const afterUndo = rouletteAdvance(undone, NOW, seededRandom(1));
  assert("Undo last round after the next draw: that draw is dropped and the previous round resumes", rouletteOf(afterUndo).phase === P.PLAYING && rouletteOf(afterUndo).round === 1 && afterUndo.nextMatchups.length === 0);
  const dissolved = rouletteAdvance({ ...s, nextMatchups: [] }, NOW, seededRandom(4));
  assert("a draw that was dissolved entirely before starting is simply drawn again (same round)", rouletteOf(dissolved).phase === P.DRAWN && rouletteOf(dissolved).round === 2 && dissolved.nextMatchups.length === 4);
  const stopped = rouletteAdvance({ ...session(22, 4), queueingStopped: true }, NOW, seededRandom(1));
  assert("Stop Queueing holds the next draw", rouletteOf(stopped).phase === P.WAITING && stopped.nextMatchups.length === 0);
  const manualStart = (() => { let x = rouletteAdvance(session(8, 2), NOW, seededRandom(1)); const m = x.nextMatchups[0]; x = { ...x, nextMatchups: x.nextMatchups.slice(1), courts: x.courts.map((c, i) => (i === 0 ? { ...c, status: "live", teamA: m.teamA, teamB: m.teamB } : c)) }; return rouletteAdvance(x, NOW, seededRandom(1)); })();
  assert("filling a court by hand also starts the round clock", rouletteOf(manualStart).phase === P.PLAYING && rouletteOf(manualStart).roundStartedAt === NOW);
}

console.log("\n5. Tie rule");
assert("a tied score cannot be confirmed in Roulette", /one more point/.test(rouletteScoreProblem(session(4, 1), 9, 9)) && rouletteScoreProblem(session(4, 1), 11, 9) === null && rouletteScoreProblem(session(4, 1), 7, 8) === null);

console.log("\n6. Full session simulation — 22 players, 4 courts, 12 rounds (5 seeds)");
{
  let worstOppRepeatPairs = 0;
  let cleanRounds = Infinity;
  for (const seed of [1, 2, 3, 4, 5]) {
    const { s, drawRepeats } = playWholeSession(22, 4, seed);
    const games = Object.values(s.players).map((p) => p.games);
    const sits = sitCounts(s);
    const sitVals = Object.keys(s.players).map((id) => sits[id] || 0);
    const h = pairHistory(s.matchHistory);
    const ok = rouletteOf(s).phase === P.COMPLETE && rouletteOf(s).round === 12 && s.matchHistory.length === 48
      && Math.min(...games) === 8 && Math.max(...games) === 9
      && Math.max(...sitVals) - Math.min(...sitVals) <= 1
      && Math.max(...Object.values(h.partners)) === 1
      && Math.max(...Object.values(h.opponents)) <= 2;
    assert(`seed ${seed}: 12 rounds / 48 matches, everyone plays 8-9 games, sit-outs within 1 of each other, NO repeat partner, no opponent faced 3 times`, ok);
    // sit rotation: nobody sits a 2nd time before everyone has sat once
    const firstTwo = rouletteOf(s).rounds.filter((x) => x.round <= 3).flatMap((x) => x.sat);
    assert(`seed ${seed}: the first 18 sit-outs (rounds 1-3) are 18 different players`, new Set(firstTwo).size === 18);
    worstOppRepeatPairs = Math.max(worstOppRepeatPairs, Object.values(h.opponents).filter((n) => n > 1).length);
    cleanRounds = Math.min(cleanRounds, drawRepeats.findIndex((r) => r.length > 0) === -1 ? 12 : drawRepeats.findIndex((r) => r.length > 0));
    assert(`seed ${seed}: status after the last round`, /All 12 rounds played/.test(rouletteStatusText(s)) && rouletteAdvance(s, NOW) === s);
  }
  console.log(`     (repeat-opponent pairs over a whole session, worst of 5 seeds: ${worstOppRepeatPairs} of 231 possible; first ${cleanRounds} rounds always repeat-free)`);
  assert("opponent repeats stay rare (<= 12 pairs per session) and the first 8 rounds are always repeat-free", worstOppRepeatPairs <= 12 && cleanRounds >= 8);
  const small = playWholeSession(10, 2, 3, {}).s;
  assert("10 players / 2 courts / 12 rounds also completes with games within 1 of each other", rouletteOf(small).phase === P.COMPLETE && Math.max(...Object.values(small.players).map((p) => p.games)) - Math.min(...Object.values(small.players).map((p) => p.games)) <= 1);
  const six = playWholeSession(22, 4, 2, { roulette: { ...createRouletteFields("roulette").roulette, totalRounds: 6 } }).s;
  assert("totalRounds is honoured (6 rounds -> 24 matches, complete)", rouletteOf(six).round === 6 && six.matchHistory.length === 24 && rouletteOf(six).phase === P.COMPLETE);
  const extended = rouletteAdvance({ ...six, roulette: { ...six.roulette, totalRounds: 8 } }, NOW, seededRandom(1));
  assert("adding rounds in Session Settings after 'complete' draws the next round", rouletteOf(extended).phase === P.DRAWN && rouletteOf(extended).round === 7);
  // latecomer joins after round 3
  const rng = seededRandom(11);
  let late = session(21, 4);
  for (let round = 1; round <= 12; round++) {
    late = rouletteAdvance(late, NOW, rng);
    if (round === 4) { late = redrawRouletteRound({ ...late, players: { ...late.players, late: { id: "late", name: "Late", checkedIn: true, status: "ACTIVE", games: 0, wins: 0, losses: 0 } }, queueIds: [...late.queueIds, "late"] }, rng); }
    late = rouletteAdvance(finishAllCourts(rouletteAdvance(startRouletteRound(late), NOW, rng)), NOW, rng);
  }
  assert("a latecomer (joins before round 4) is drawn in and ends within reach of the room (>= 6 games of 9 remaining rounds)", late.players.late.games >= 6 && rouletteOf(late).phase === P.COMPLETE);
}

console.log("\n7. Roulette alert (bell)");
{
  let s = rouletteAdvance(session(4, 1, { matchHistory: [{ teamA: ["p1", "p2"], teamB: ["p3", "p4"] }, { teamA: ["p1", "p3"], teamB: ["p2", "p4"] }, { teamA: ["p1", "p4"], teamB: ["p2", "p3"] }] }), NOW, seededRandom(1));
  const a = computeAlerts(s, NOW).filter((x) => x.kind === "rouletteRepeat");
  assert("4 players who have exhausted every pairing: the drawn round raises ONE alert, severity warn (repeat partners)", a.length === 1 && a[0].severity === "warn" && /Round 1 draw: 2 repeat partner pairs/.test(a[0].title));
  const clean = rouletteAdvance(session(22, 4), NOW, seededRandom(1));
  assert("a clean draw raises no Roulette alert", computeAlerts(clean, NOW).filter((x) => x.kind === "rouletteRepeat").length === 0);
  const playing = rouletteAdvance(startRouletteRound(s), NOW, seededRandom(1));
  assert("no Roulette alert once the round has started", computeAlerts(playing, NOW).filter((x) => x.kind === "rouletteRepeat").length === 0);
}

console.log("\n8. Wiring");
{
  const app = strip(read("src/PickleballOpenPlay.jsx"));
  assert("save(): rouletteAdvance runs before matchup generation", /next = rouletteAdvance\(next\);/.test(app) && app.indexOf("next = rouletteAdvance(next);") < app.indexOf("const withMatchups = {"));
  assert("save(): the per-save engine refresh and auto-dispatch are skipped for Roulette", /isCalibrationPhase\(next\) \|\| isRouletteMode\(next\)\s*\? next\.nextMatchups \|\| \[\]/.test(app) && /!isRouletteMode\(withMatchups\) && withMatchups\.courtDispatchSettings\?\.autoFillCourts !== false/.test(app));
  assert("new sessions get the Roulette fields", /\.\.\.createRouletteFields\(rotationMode, sessionOptions\?\.roulette\),/.test(app));
  assert("endMatch refuses a tied Roulette score before touching any stats", /const rouletteProblem = rouletteScoreProblem\(state, scoreA, scoreB\);\s*if \(rouletteProblem\) \{\s*releaseGuard\(\);/.test(app) && app.indexOf("const rouletteProblem") < app.indexOf("let players = { ...state.players };"));
  assert("Regenerate = Redraw in Roulette (with Undo snapshot); Generate remaining courts is disabled", /if \(isRouletteMode\(state\)\) \{\s*if \(rouletteOf\(state\)\.phase !== ROULETTE_PHASES\.DRAWN\) return;\s*setRegenerateSnapshot\(state\.nextMatchups \|\| \[\]\);\s*save\(redrawRouletteRound\(state\)\);/.test(app) && /if \(isRouletteMode\(state\)\) return;/.test(app));
  assert("Start Round action saves the started round", /const startRouletteRound = \(\) => \{\s*const next = startRouletteRoundAction\(state, \{ isCourtReserved \}\);\s*if \(next === state\) return;/.test(app) && /onStartRouletteRound=\{startRouletteRound\}/.test(app));
  const scorer = strip(read("src/components/ScorerView.jsx"));
  assert("Scorer mounts the Roulette panel with controls and hides the per-court generate/fill buttons", /<RoulettePanel\s+state=\{state\}\s+controls\s+onStartRound=\{onStartRouletteRound\}\s+onRedraw=\{regenerateMatchups\}/.test(scorer) && (scorer.match(/\{!roulette && \(/g) || []).length === 2);
  assert("Approve Next Match is not offered in Roulette (the round starts as a whole)", /onApprove=\{!roulette && i === 0 && nextOpenCourtIndex !== -1/.test(scorer) && /Start remaining courts/.test(strip(read("src/components/RoulettePanel.jsx"))));
  assert("Session Settings gets the rounds + timer fields for Roulette sessions only", /roulette=\{roulette \? \{ \.\.\.rouletteOf\(state\), raw: state\.roulette \|\| \{\} \} : undefined\}/.test(scorer) && /Roulette number of rounds/.test(read("src/components/SessionSettingsDialog.jsx")) && /Math\.max\(roulette\.round \|\| 1,/.test(read("src/components/SessionSettingsDialog.jsx")));
  const panel = strip(read("src/components/RoulettePanel.jsx"));
  assert("RoulettePanel: renders nothing outside Roulette, 1-second clock, buzzer on expiry (Scorer only)", /if \(!active\) return null;/.test(panel) && /useNow\(active \? 1000 : 60000\)/.test(panel) && /playChime\(ctxRef\)/.test(panel) && /if \(!controls \|\| !clock\) return;/.test(panel));
  assert("RoulettePanel: Start Round + Redraw only while drawn; sitting-out list; repeat notes", /controls && r\.phase === P\.DRAWN/.test(panel) && /Sitting out/.test(panel) && /Repeat opponents/.test(panel) && /Repeat partners/.test(panel));
  assert("Live Board and TV Mode show the read-only round banner", /<RoulettePanel state=\{state\} \/>/.test(strip(read("src/components/BoardView.jsx"))) && /<RoulettePanel state=\{session\} dark \/>/.test(strip(read("src/components/OpenPlayTVModePage.jsx"))));
  assert("lib/roulette.js is pure (no React, storage or network)", !/from "react"|supabase|localStorage|fetch\(/.test(strip(read("src/lib/roulette.js"))));
}

console.log("\n9. Part 2 — standings by win percentage, final podium, Final Match");
{
  const mk = (id, name, wins, losses, pf, pa, extra = {}) => ({ id, name, checkedIn: true, status: "ACTIVE", games: wins + losses, wins, losses, streak: 0, pointsFor: pf, pointsAgainst: pa, ...extra });
  // 9 games vs 8 games: Ana 7-2 (78%) must rank BELOW Ben 7-1 (88%) even though both have 7 wins.
  const players = {
    ana: mk("ana", "Ana", 7, 2, 95, 70), ben: mk("ben", "Ben", 7, 1, 85, 60), cy: mk("cy", "Cy", 6, 2, 84, 66), dee: mk("dee", "Dee", 6, 2, 80, 70),
    eve: mk("eve", "Eve", 5, 4, 90, 88), fay: mk("fay", "Fay", 2, 6, 50, 80), org: mk("org", "Owner", 8, 0, 88, 30, { paymentStatus: "paid", paymentMethod: "organizer" }), gone: mk("gone", "Gone", 8, 1, 99, 50, { status: "CHECKED_OUT" }),
    one: mk("one", "OneGame", 1, 0, 11, 2),
  };
  const done = { ...session(4, 1), players, queueIds: Object.keys(players), roulette: { ...createRouletteFields("roulette").roulette, round: 12, phase: P.COMPLETE }, sessionStartedAt: NOW - 20 * 60000 };
  const playing = { ...done, roulette: { ...done.roulette, round: 5, phase: P.PLAYING } };

  assert("standingsOrderFor: winPct for Roulette, rating for everything else", standingsOrderFor(done) === "winPct" && standingsOrderFor({ rotationMode: "adaptiveSkill" }) === "rating" && standingsOrderFor({}) === "rating");
  const order = buildStandingsRows(players, { order: "winPct" }).map((r) => r.name);
  assert("win% order: OneGame 100%, Owner 100% (diff breaks it), Gone 89%, Ben 88%, Ana 78%, Cy/Dee 75% (diff), Eve, Fay", order.join() === "Owner,OneGame,Gone,Ben,Ana,Cy,Dee,Eve,Fay");
  assert("...Ben (7-1) ranks above Ana (7-2): percentage, not wins", order.indexOf("Ben") < order.indexOf("Ana"));
  assert("equal percentage -> point difference decides (Cy +18 over Dee +10)", order.indexOf("Cy") < order.indexOf("Dee"));
  assert("the default (rating) order is unchanged for other modes", buildStandingsRows(players).map((r) => r.name).join() === buildStandingsRows(players, { order: "rating" }).map((r) => r.name).join() && buildStandingsRows(players).map((r) => r.name).join() !== order.join());

  const podium = computePodium(done, NOW);
  assert("Roulette podium = top of the win% standings (min games + no organizers; early leaver keeps the place): Gone, Ben, Ana", podium.places.map((x) => x.name).join() === "Gone,Ben,Ana" && podium.places[0].out === true);
  assert("once every round is played the podium is unlocked and FINAL without waiting 60 minutes", podium.unlocked === true && podium.final === true);
  const mid = computePodium(playing, NOW);
  assert("mid-session it is still the time-gated running podium", mid.unlocked === false && mid.final === false && mid.minutesToGo === 40);
  assert("other modes are never marked final by this rule", computePodium({ ...done, rotationMode: "continuous" }, NOW).final === false);

  const finalists = rouletteFinalists(done);
  assert("finalists = top four PRESENT, eligible players, seeded 1-4: Ben, Ana, Cy, Dee (organizer, early leaver and 1-game player skipped)", finalists.map((f) => `${f.seed}${f.name}`).join() === "1Ben,2Ana,3Cy,4Dee");
  assert("no Final Match before the last round", createRouletteFinal(playing) === playing);
  const made = createRouletteFinal(done, NOW);
  const f = made.roulette.final;
  assert("Final Match: #1 & #4 vs #2 & #3, seeds frozen on the record, undecided", f.teamA.map((x) => x.name).join() === "Ben,Dee" && f.teamB.map((x) => x.name).join() === "Ana,Cy" && f.teamA[0].seed === 1 && f.teamA[1].seed === 4 && f.winner === null);
  assert("creating it changes no player record", JSON.stringify(made.players) === JSON.stringify(done.players) && made.matchHistory === done.matchHistory);
  assert("fewer than four finalists -> not created", createRouletteFinal({ ...done, players: { ana: players.ana, ben: players.ben, cy: players.cy } }) !== null && !createRouletteFinal({ ...done, players: { ana: players.ana, ben: players.ben, cy: players.cy } }).roulette.final);
  assert("score rules: whole numbers, no negatives, no ties", /whole numbers/.test(rouletteFinalScoreProblem("", 5)) && /whole numbers/.test(rouletteFinalScoreProblem(-1, 5)) && /whole numbers/.test(rouletteFinalScoreProblem(1.5, 5)) && /one more point/.test(rouletteFinalScoreProblem(9, 9)) && rouletteFinalScoreProblem(11, 8) === null && rouletteFinalScoreProblem("11", "8") === null);
  assert("an invalid score is not saved", setRouletteFinalScore(made, 9, 9) === made && setRouletteFinalScore(done, 11, 8) === done);
  const scored = setRouletteFinalScore(made, 8, 11, NOW);
  const view = rouletteFinalView(scored);
  assert("saving 8-11: team B (Ana & Cy) are the Final Match Winners", scored.roulette.final.winner === "B" && view.winnersText === "Ana & Cy" && view.scoreA === 8 && view.scoreB === 11);
  assert("the Final Match never touches records, standings or the podium", JSON.stringify(scored.players) === JSON.stringify(done.players) && computePodium(scored, NOW).places.map((x) => x.name).join() === "Gone,Ben,Ana" && buildStandingsRows(scored.players, { order: "winPct" }).map((r) => r.name).join() === order.join());
  assert("view carries names, seeds and the result only — no ids", !/"id"/.test(JSON.stringify(view)) && Object.keys(view).sort().join() === "scoreA,scoreB,teamA,teamB,winner,winners,winnersText");
  assert("undecided view hides scores; no final -> null; other modes -> null", rouletteFinalView(made).winner === null && rouletteFinalView(made).scoreA === null && rouletteFinalView(done) === null && rouletteFinalView({ ...scored, rotationMode: "continuous" }) === null);
  const changed = clearRouletteFinal(scored, { resultOnly: true });
  assert("Change score clears the result but keeps the match; Remove deletes it", changed.roulette.final.winner === null && changed.roulette.final.teamA.length === 2 && !("final" in clearRouletteFinal(scored).roulette) && clearRouletteFinal(done) === done);
  assert("rouletteAdvance leaves a complete session with a Final Match alone", rouletteAdvance(scored, NOW) === scored);

  const report = computeSessionAnalyticsReport(scored, NOW);
  assert("report: finalStandings in win% order, podium from them, rouletteFinal attached", report.finalStandings.map((x) => x.playerName).join() === order.join() && report.finalPodium.map((x) => x.name).join() === "Gone,Ben,Ana" && report.rouletteFinal.winnersText === "Ana & Cy");
  const table = buildSessionReportExportTable(report);
  assert("CSV: Final Match + Final Match Winners rows", table.rows.some((r) => r[0] === "Final Match" && /#1 Ben & #4 Dee vs #2 Ana & #3 Cy — 8-11/.test(r[1])) && table.rows.some((r) => r[0] === "Final Match Winners" && r[1] === "Ana & Cy"));
  assert("CSV: no Final Match rows for a session without one", !buildSessionReportExportTable(computeSessionAnalyticsReport(done, NOW)).rows.some((r) => /^Final Match/.test(r[0])));
  const summary = buildOpenPlayFinalSummary(scored, { sessionCode: "ABC123", endedAt: NOW });
  assert("public summary: finalMatch (names/seeds/score), standings in win% order, still no ids or payment fields", summary.finalMatch.winnersText === "Ana & Cy" && summary.standings[0].name === "Owner" && summary.standings.map((x) => x.name).indexOf("Ben") < summary.standings.map((x) => x.name).indexOf("Ana") && !/"id"|playerId|payment|organizer|paid/i.test(JSON.stringify(summary)));
  assert("public summary: finalMatch null for other modes", buildOpenPlayFinalSummary({ ...done, rotationMode: "continuous" }, { sessionCode: "ABC123", endedAt: NOW }).finalMatch === null);

  const card = strip(read("src/components/RouletteFinalCard.jsx"));
  assert("RouletteFinalCard: Create only when complete (Scorer), score inputs + Save / Remove, Change score after a result, read-only elsewhere", /if \(!final && !\(controls && complete\)\) return null;/.test(card) && /Create Final Match/.test(card) && /Save result/.test(card) && /Change score/.test(card) && /Final Match Winners/.test(card));
  assert("RoulettePanel embeds the card; Scorer wires the four actions through onRouletteChange; app saves what they return", /<RouletteFinalCard state=\{state\} controls=\{controls\}/.test(strip(read("src/components/RoulettePanel.jsx"))) && /onCreateFinal=\{\(\) => onRouletteChange\?\.\(\(s\) => createRouletteFinal\(s\)\)\}/.test(strip(read("src/components/ScorerView.jsx"))) && /const applyRouletteChange = \(fn\) => \{\s*const next = fn\(state\);\s*if \(next && next !== state\) save\(next\);/.test(strip(read("src/PickleballOpenPlay.jsx"))));
  assert("Standings tab and TV Mode use the session's standings order; the saved report shows the Final Match", /buildStandingsRows\(sourcePlayers, \{ order: standingsOrderFor\(state\) \}\)/.test(strip(read("src/components/StandingsView.jsx"))) && /buildStandingsRows\(players, \{ order: standingsOrderFor\(session\) \}\)/.test(strip(read("src/components/OpenPlayTVModePage.jsx"))) && /<RouletteFinalCard view=\{report\.rouletteFinal\} \/>/.test(strip(read("src/components/SessionAnalyticsReport.jsx"))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
