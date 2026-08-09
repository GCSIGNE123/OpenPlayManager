// Double Elimination — automated, headless, logic-layer coverage. Exercises
// the REAL production functions end to end (bracket generation, real
// Winners Bracket loser seating, Losers Bracket advancement/elimination,
// Grand Final + Reset, court assignment, score-correction safety) — no
// synthetic reimplementation. window.storage is stubbed to a no-op so
// saveTournament's one `await window.storage.set(...)` call succeeds
// without needing real Supabase network access; everything else is the
// actual app code.
//
// Usage: node scripts/verify-double-elimination.mjs
globalThis.window = {
  storage: {
    set: async () => {},
    get: async () => { throw new Error("not found"); },
    list: async () => ({ keys: [] }),
    delete: async () => {},
    subscribeToKey: () => () => {},
  },
};

import { buildAndSaveDoubleEliminationTournament, saveDoubleEliminationMatchResult, saveDoubleEliminationLosersMatchResult, saveGrandFinalMatchResult, saveGrandFinalWalkover } from "../src/lib/tournament.js";
import { computeTournamentStatus } from "../src/lib/tournamentModel.js";
import { CourtAssignmentService } from "../src/engines/CourtAssignmentService.js";
import { DoubleEliminationEngine } from "../src/engines/DoubleEliminationEngine.js";

const deEngine = new DoubleEliminationEngine();
const courtService = new CourtAssignmentService();

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayers(n) {
  const players = [];
  for (let i = 1; i <= n; i++) players.push({ id: `p${i}`, name: `Team${i}` });
  return players;
}

// deterministic PRNG so results are reproducible across runs
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allDeMatches(t) {
  const b = t.doubleEliminationBracket;
  return [
    ...b.winnersBracket.rounds.flatMap((r) => r.matches),
    ...b.losersBracket.rounds.flatMap((r) => r.matches),
    b.grandFinal.game1,
    ...(b.grandFinal.game2 ? [b.grandFinal.game2] : []),
  ];
}

// Plays every currently-pending Winners/Losers Bracket match (lowest team A
// always wins, for determinism) until only the Grand Final remains — the
// caller decides Game 1/Game 2's winner explicitly from there, since that's
// exactly the branch point (no reset vs. reset) these tests exist to cover.
async function playToGrandFinal(t, rng) {
  let safety = 0;
  while (safety < 500) {
    safety++;
    const wb = t.doubleEliminationBracket.winnersBracket;
    const lb = t.doubleEliminationBracket.losersBracket;
    const pendingWb = wb.rounds.flatMap((r) => r.matches).find((m) => m.teamA && m.teamB && m.status !== "completed");
    if (pendingWb) {
      t = await saveDoubleEliminationMatchResult(t, pendingWb.id, { scoreA: 11, scoreB: Math.floor(rng() * 8), winnerId: pendingWb.teamA.participantId });
      continue;
    }
    const pendingLb = lb.rounds.flatMap((r) => r.matches).find((m) => m.teamA && m.teamB && m.status !== "completed");
    if (pendingLb) {
      t = await saveDoubleEliminationLosersMatchResult(t, pendingLb.id, { scoreA: 11, scoreB: Math.floor(rng() * 8), winnerId: pendingLb.teamA.participantId });
      continue;
    }
    break; // Grand Final Game 1 is the only thing left pending
  }
  return t;
}

for (const n of [4, 8, 16]) {
  console.log(`\n=== ${n}-team standalone Double Elimination bracket ===`);
  const rng = mulberry32(1000 + n);
  let t = await buildAndSaveDoubleEliminationTournament({
    sessionCode: `DE${n}`,
    players: makePlayers(n),
    mode: "singles",
    courtsCount: 4,
    seedingMethod: "random",
    seedContext: { seedValue: n },
  });

  assert("tournament.format is doubleElimination", t.format === "doubleElimination");
  assert("tournament.pools is empty (no Round Robin pool stage)", t.pools.length === 0);
  assert("tournament.entrants holds all registered players", t.entrants.length === n);
  assert("tournament starts with status 'ready' (not vacuously completed)", computeTournamentStatus(t) === "ready");

  const wbMatchesInit = t.doubleEliminationBracket.winnersBracket.rounds.flatMap((r) => r.matches);
  assert(`Winners Bracket Round 1 has ${n / 2} real matches, all seeded`, wbMatchesInit.filter((m) => m.round === 1).length === n / 2 && wbMatchesInit.filter((m) => m.round === 1).every((m) => m.teamA && m.teamB));
  assert("every later Winners Bracket round starts empty (no placeholder teams)", wbMatchesInit.filter((m) => m.round !== 1).every((m) => !m.teamA && !m.teamB));
  const lbMatchesInit = t.doubleEliminationBracket.losersBracket.rounds.flatMap((r) => r.matches);
  assert("every Losers Bracket match starts completely empty", lbMatchesInit.every((m) => !m.teamA && !m.teamB));
  assert("Grand Final starts empty, no game2 yet", !t.doubleEliminationBracket.grandFinal.game1.teamA && t.doubleEliminationBracket.grandFinal.game2 === null);

  t = await playToGrandFinal(t, rng);

  assert("Winners Bracket has a champion", t.doubleEliminationBracket.winnersBracket.champion !== null);
  assert("Losers Bracket has a champion", t.doubleEliminationBracket.losersBracket.champion !== null);
  assert("Winners Bracket champion != Losers Bracket champion", t.doubleEliminationBracket.winnersBracket.champion.participantId !== t.doubleEliminationBracket.losersBracket.champion.participantId);
  assert("Grand Final Game 1 is seeded with both champions", t.doubleEliminationBracket.grandFinal.game1.teamA && t.doubleEliminationBracket.grandFinal.game1.teamB);

  // Elimination structural check: every Losers-Bracket-eliminated team
  // (a match loser there, who by construction gets no further seating
  // anywhere) never appears in any still-open or future match.
  const stillOpenOrFuture = allDeMatches(t).filter((m) => m.status !== "completed");
  const lbCompleted = t.doubleEliminationBracket.losersBracket.rounds.flatMap((r) => r.matches).filter((m) => m.status === "completed");
  const trulyEliminatedIds = lbCompleted.map((m) => (m.winner === m.teamA?.participantId ? m.teamB?.participantId : m.teamA?.participantId)).filter(Boolean);
  const eliminatedButReappearing = trulyEliminatedIds.filter((id) =>
    stillOpenOrFuture.some((m) => m.teamA?.participantId === id || m.teamB?.participantId === id)
  );
  assert(`no Losers-Bracket-eliminated team reappears in any pending/future match (${n} teams)`, eliminatedButReappearing.length === 0);

  const eliminatedSet = deEngine.getEliminatedParticipants(t.doubleEliminationBracket);
  assert(`exactly ${n - 2} teams structurally eliminated before the Grand Final (everyone except the 2 finalists)`, eliminatedSet.size === n - 2);
  assert("neither Grand Finalist is marked eliminated", !eliminatedSet.has(t.doubleEliminationBracket.winnersBracket.champion.participantId) && !eliminatedSet.has(t.doubleEliminationBracket.losersBracket.champion.participantId));

  const liveSeatedIds = allDeMatches(t).filter((m) => m.status !== "completed" && m.teamA && m.teamB).flatMap((m) => [m.teamA.participantId, m.teamB.participantId]);
  const dupeLive = liveSeatedIds.filter((id, i) => liveSeatedIds.indexOf(id) !== i);
  assert(`no team is live in two simultaneous matches (${n} teams)`, dupeLive.length === 0);

  // Grand Final: Winners Bracket champion wins Game 1 -> no reset
  const wbChampParticipantId = t.doubleEliminationBracket.winnersBracket.champion.participantId;
  const lbChampParticipantId = t.doubleEliminationBracket.losersBracket.champion.participantId;
  const noResetTournament = await saveGrandFinalMatchResult(t, t.doubleEliminationBracket.grandFinal.game1.id, { scoreA: 11, scoreB: 4, winnerId: wbChampParticipantId });
  assert("WB champion wins Game 1 -> tournament completed immediately, no reset", noResetTournament.doubleEliminationBracket.grandFinal.status === "completed" && noResetTournament.doubleEliminationBracket.grandFinal.game2 === null);
  assert("champion is the Winners Bracket champion", noResetTournament.doubleEliminationBracket.grandFinal.champion.participantId === wbChampParticipantId);
  assert("tournament.status rolls up to completed", computeTournamentStatus(noResetTournament) === "completed");

  // Grand Final: Losers Bracket champion wins Game 1 -> reset created
  const resetTournament1 = await saveGrandFinalMatchResult(t, t.doubleEliminationBracket.grandFinal.game1.id, { scoreA: 4, scoreB: 11, winnerId: lbChampParticipantId });
  assert("LB champion wins Game 1 -> Grand Final Reset (game2) created", resetTournament1.doubleEliminationBracket.grandFinal.game2 !== null);
  assert("Grand Final not yet completed (reset pending)", resetTournament1.doubleEliminationBracket.grandFinal.status === "running");
  assert("tournament.status is 'running', not completed, mid-reset", computeTournamentStatus(resetTournament1) === "running");
  const resetTournament2 = await saveGrandFinalMatchResult(resetTournament1, resetTournament1.doubleEliminationBracket.grandFinal.game2.id, { scoreA: 11, scoreB: 9, winnerId: wbChampParticipantId });
  assert("Game 2 decides the champion (WB champion wins the reset)", resetTournament2.doubleEliminationBracket.grandFinal.champion.participantId === wbChampParticipantId);
  assert("Grand Final now completed", resetTournament2.doubleEliminationBracket.grandFinal.status === "completed");
  const resetTournament3 = await saveGrandFinalMatchResult(resetTournament1, resetTournament1.doubleEliminationBracket.grandFinal.game2.id, { scoreA: 6, scoreB: 11, winnerId: lbChampParticipantId });
  assert("Game 2 winner-takes-all: LB champion can also win it and become overall champion", resetTournament3.doubleEliminationBracket.grandFinal.champion.participantId === lbChampParticipantId);

  // Grand Final Reset walkover
  {
    const wReset = await saveGrandFinalMatchResult(t, t.doubleEliminationBracket.grandFinal.game1.id, { scoreA: 4, scoreB: 11, winnerId: lbChampParticipantId });
    assert("reset created ahead of walkover test", wReset.doubleEliminationBracket.grandFinal.game2 !== null);
    const wDecided = await saveGrandFinalWalkover(wReset, wReset.doubleEliminationBracket.grandFinal.game2.id, wbChampParticipantId);
    assert("Grand Final Reset walkover actually decides the champion", wDecided.doubleEliminationBracket.grandFinal.champion?.participantId === wbChampParticipantId);
    assert("Grand Final Reset walkover marks the game completed", wDecided.doubleEliminationBracket.grandFinal.game2.status === "completed");
  }

  // Known formula check: 2N-2 (no reset) / 2N-1 (with reset)
  const totalMatchesNoReset = allDeMatches(noResetTournament).filter((m) => m.status === "completed").length;
  const totalMatchesWithReset = allDeMatches(resetTournament2).filter((m) => m.status === "completed").length;
  assert(`${n} teams, no reset: total completed matches == 2N-2 (${2 * n - 2})`, totalMatchesNoReset === 2 * n - 2);
  assert(`${n} teams, with reset: total completed matches == 2N-1 (${2 * n - 1})`, totalMatchesWithReset === 2 * n - 1);

  // Score correction safety — re-saving an already-completed bracket match
  // is REJECTED outright by the reused PlayoffAdvancementService.
  // validateAdvancement (same precedent single-elimination already has),
  // so duplicate advancement/seating is structurally impossible.
  {
    let ct2 = await buildAndSaveDoubleEliminationTournament({
      sessionCode: `DEcorrect${n}`,
      players: makePlayers(n),
      mode: "singles",
      courtsCount: 4,
      seedingMethod: "random",
      seedContext: { seedValue: n + 1 },
    });
    const firstMatch = ct2.doubleEliminationBracket.winnersBracket.rounds[0].matches[0];
    ct2 = await saveDoubleEliminationMatchResult(ct2, firstMatch.id, { scoreA: 11, scoreB: 3, winnerId: firstMatch.teamA.participantId });
    let rejectedReSave = false;
    try {
      await saveDoubleEliminationMatchResult(ct2, firstMatch.id, { scoreA: 11, scoreB: 2, winnerId: firstMatch.teamA.participantId });
    } catch (e) {
      rejectedReSave = true;
    }
    assert("re-saving an already-completed Winners Bracket match's result is REJECTED outright — can never duplicate advancement/seating", rejectedReSave);
  }

  // Court assignment integration
  let ct = t;
  const availableCourts = courtService.getAvailableCourts(ct);
  assert("all 4 courts available (nothing in play right now)", availableCourts.length === 4);
  const queue = courtService.getPlayableMatches(ct);
  assert("Grand Final Game 1 is in the playable queue (both champions seated, pending, no court yet)", queue.some((e) => e.match.id === ct.doubleEliminationBracket.grandFinal.game1.id));
  ct = courtService.assignMatchToCourt(ct, ct.doubleEliminationBracket.grandFinal.game1.id, 1);
  assert("Grand Final Game 1 assigned to Court 1", ct.doubleEliminationBracket.grandFinal.game1.court === 1);
  assert("Court 1 now occupied", !courtService.getAvailableCourts(ct).some((c) => c.number === 1));
  const anyEmptyOffered = courtService.getPlayableMatches(ct).some((e) => !e.match.teamA || !e.match.teamB);
  assert("no empty/unpopulated future bracket slot is ever offered as playable", !anyEmptyOffered);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
