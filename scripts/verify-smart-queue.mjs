// Smart Queue Management — automated, headless, logic-layer coverage.
//
// Same approach as scripts/run-acceptance-test.mjs / verify-adaptive-skill.mjs:
// calls the real pure functions directly (src/lib/utils.js,
// src/lib/queueManagement.js, src/lib/constants.js) — no synthetic
// reimplementation.
//
// Usage: node scripts/verify-smart-queue.mjs
import { emptyCourt, QUEUE_STATUSES } from "../src/lib/constants.js";
import { maxUpcomingMatchups, refreshNextMatchups, regenerateNextMatchups, getRotationEngine, getPlayerQueueStatus } from "../src/lib/utils.js";
import {
  holdPlayer,
  resumePlayer,
  skipPlayer,
  holdMatch,
  resumeMatch,
  cancelMatch,
  regenerate,
  noteDissolvedHeldMatchups,
} from "../src/lib/queueManagement.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayers(count) {
  const players = {};
  for (let i = 0; i < count; i++) {
    const id = `p${i}`;
    players[id] = { id, name: `Player${i}`, skill: "beginner", games: 0, held: false, status: "ACTIVE" };
  }
  return players;
}

console.log("\n1. Limit Upcoming Match Queue — maxUpcomingMatchups");
{
  const openCourts = [emptyCourt(1), emptyCourt(2), emptyCourt(3), emptyCourt(4)];
  assert("before session starts (0 live courts): cap == total automatic courts (4)", maxUpcomingMatchups(openCourts) === 4);

  const twoLive = [
    { ...emptyCourt(1), status: "live" },
    { ...emptyCourt(2), status: "live" },
    emptyCourt(3),
    emptyCourt(4),
  ];
  assert("2 live courts -> cap == 1 (Live Courts - 1)", maxUpcomingMatchups(twoLive) === 1);

  const threeLive = [
    { ...emptyCourt(1), status: "live" },
    { ...emptyCourt(2), status: "live" },
    { ...emptyCourt(3), status: "finished" },
    emptyCourt(4),
  ];
  assert("3 occupied courts (live+finished) -> cap == 2", maxUpcomingMatchups(threeLive) === 2);

  const fourLive = [1, 2, 3, 4].map((n) => ({ ...emptyCourt(n), status: "live" }));
  assert("4 live courts -> cap == 3", maxUpcomingMatchups(fourLive) === 3);

  const oneLive = [{ ...emptyCourt(1), status: "live" }];
  assert("1 live court -> cap == 0 (literal Live Courts - 1, no artificial floor)", maxUpcomingMatchups(oneLive) === 0);

  const withManual = [
    { ...emptyCourt(1), status: "live" },
    { ...emptyCourt(2), status: "live" },
    { ...emptyCourt(3), assignmentMode: "manual" },
  ];
  assert("manual courts excluded from both the occupied count and the total", maxUpcomingMatchups(withManual) === 1);
}

console.log("\n2. refreshNextMatchups / regenerateNextMatchups respect the cap");
{
  const players = makePlayers(16); // enough waiting players to build many matchups
  const queueIds = Object.keys(players);
  const engine = getRotationEngine("continuous");

  const uncapped = refreshNextMatchups(queueIds, players, [], engine, null);
  assert("sanity: uncapped (no maxUpcoming arg) still builds multiple matchups", uncapped.length > 1);

  const capped = refreshNextMatchups(queueIds, players, [], engine, null, 1);
  assert("refreshNextMatchups never exceeds the cap", capped.length === 1);

  const cappedRegen = regenerateNextMatchups(queueIds, players, [], engine, null, 2);
  assert("regenerateNextMatchups never exceeds the cap", cappedRegen.length === 2);

  const zeroCap = refreshNextMatchups(queueIds, players, [], engine, null, 0);
  assert("a cap of 0 builds nothing", zeroCap.length === 0);
}

console.log("\n3. Hold Player / Resume Player — preserves stats, excludes from matchmaking");
{
  const players = makePlayers(4);
  players.p0.wins = 5;
  players.p0.streak = 3;
  players.p0.lastResult = "win";
  const state = {
    players,
    queueIds: Object.keys(players),
    nextMatchups: [{ id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }],
    courts: [],
  };

  const held = holdPlayer(state, "p0");
  assert("player marked held", held.players.p0.held === true);
  assert("stats/streaks fully preserved (wins, streak, lastResult untouched)", (
    held.players.p0.wins === 5 && held.players.p0.streak === 3 && held.players.p0.lastResult === "win"
  ));
  assert("player still in queueIds (remains checked in / in the queue)", held.queueIds.includes("p0"));
  assert("their reserved matchup was dissolved (freeing p1/i0/i1 back to the pool)", held.nextMatchups.length === 0);

  const noopHold = holdPlayer(held, "p0");
  assert("holding an already-held player is a no-op", noopHold === held);

  const resumed = resumePlayer(held, "p0");
  assert("resume clears held", resumed.players.p0.held === false);
  assert("stats still preserved after resume", resumed.players.p0.wins === 5 && resumed.players.p0.streak === 3);

  const noopResume = resumePlayer(resumed, "p0");
  assert("resuming an already-active player is a no-op", noopResume === resumed);
}

console.log("\n4. Skip Player — reorders only, stays eligible");
{
  const players = makePlayers(4);
  const state = { players, queueIds: ["p0", "p1", "p2", "p3"], nextMatchups: [], courts: [] };
  const skipped = skipPlayer(state, "p0");
  assert("skipped player moved to the back of queueIds", skipped.queueIds.join(",") === "p1,p2,p3,p0");
  assert("skipped player's `held` flag is untouched (stays eligible for matchmaking)", !skipped.players.p0.held);

  const noop = skipPlayer(state, "not-in-queue");
  assert("skipping a player not in the queue is a no-op", noop === state);
}

console.log("\n5. Hold Match / Resume Match — retains original queue position");
{
  const state = {
    players: makePlayers(12),
    queueIds: [],
    courts: [],
    nextMatchups: [
      { id: "m1", teamA: ["a"], teamB: ["b"] },
      { id: "m2", teamA: ["c"], teamB: ["d"] },
      { id: "m3", teamA: ["e"], teamB: ["f"] },
    ],
  };

  const held = holdMatch(state, "m2");
  assert("m2 marked held", held.nextMatchups.find((m) => m.id === "m2").held === true);
  assert("array order unchanged by holding (m1, m2, m3)", held.nextMatchups.map((m) => m.id).join(",") === "m1,m2,m3");
  assert("holding does not rebuild/dissolve any other matchup", held.nextMatchups.length === 3);

  // simulate m1 being dispatched to a court while m2 stays held, THEN resume m2
  const afterDispatch = { ...held, nextMatchups: held.nextMatchups.filter((m) => m.id !== "m1") };
  const resumed = resumeMatch(afterDispatch, "m2");
  assert("m2 no longer held after resume", resumed.nextMatchups.find((m) => m.id === "m2").held === false);
  assert(
    "m2 keeps its original relative position (still before m3, not moved to the back)",
    resumed.nextMatchups.map((m) => m.id).join(",") === "m2,m3"
  );
}

console.log("\n6. Cancel Match — dissolves the matchup, players already back in the queue");
{
  const state = {
    players: makePlayers(4),
    queueIds: ["p0", "p1", "p2", "p3"],
    courts: [],
    nextMatchups: [{ id: "m1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }],
  };
  const cancelled = cancelMatch(state, "m1");
  assert("matchup removed", cancelled.nextMatchups.length === 0);
  assert("all 4 players still in queueIds (were never removed)", ["p0", "p1", "p2", "p3"].every((id) => cancelled.queueIds.includes(id)));
}

console.log("\n7. Regenerate — held AND locked matchups both survive, cap respected");
{
  const players = makePlayers(20);
  const state = {
    players,
    queueIds: Object.keys(players),
    rotationMode: "continuous",
    expectedGamesPerPlayer: 6,
    progressiveSkillThresholds: {},
    courts: [emptyCourt(1), emptyCourt(2), emptyCourt(3)], // 0 live -> cap == 3 (pre-start rule)
    nextMatchups: [
      { id: "locked1", teamA: ["p0", "p1"], teamB: ["p2", "p3"], locked: true },
      { id: "held1", teamA: ["p4", "p5"], teamB: ["p6", "p7"], held: true },
    ],
  };
  const result = regenerate(state);
  assert("locked matchup survives regenerate", result.nextMatchups.some((m) => m.id === "locked1"));
  assert("held matchup survives regenerate (not dissolved)", result.nextMatchups.some((m) => m.id === "held1"));
  assert("total never exceeds the cap (3)", result.nextMatchups.length <= 3);
}

console.log("\n8. Queue Status — reusable canonical statuses");
{
  const players = makePlayers(5);
  players.p1.status = "CHECKED_OUT";
  players.p2.held = true;
  const state = {
    players,
    courts: [{ ...emptyCourt(1), status: "live", teamA: ["p0"], teamB: [] }],
    nextMatchups: [{ id: "m1", teamA: ["p3"], teamB: [] }],
  };
  assert("on a live court -> Playing", getPlayerQueueStatus(players.p0, state) === QUEUE_STATUSES.PLAYING);
  assert("checked out -> Checked Out", getPlayerQueueStatus(players.p1, state) === QUEUE_STATUSES.CHECKED_OUT);
  assert("held -> Held", getPlayerQueueStatus(players.p2, state) === QUEUE_STATUSES.HELD);
  assert("reserved in an upcoming matchup -> Upcoming", getPlayerQueueStatus(players.p3, state) === QUEUE_STATUSES.UPCOMING);
  assert("none of the above -> Waiting", getPlayerQueueStatus(players.p4, state) === QUEUE_STATUSES.WAITING);
  assert("exactly 5 canonical statuses: Playing/Upcoming/Waiting/Held/Checked Out", Object.keys(QUEUE_STATUSES).length === 5);
}

console.log("\n9. Held Match dissolution notice — noteDissolvedHeldMatchups");
{
  const namedPlayers = {
    a: { name: "John" }, b: { name: "Mike" }, c: { name: "Peter" }, d: { name: "Carl" },
    e: { name: "Enzo" }, f: { name: "Fara" }, g: { name: "Gwen" }, h: { name: "Hank" },
  };
  const state1 = { queueActivityLog: [] };
  const before1 = [
    { id: "held1", teamA: ["a", "b"], teamB: ["c", "d"], held: true },
    { id: "m2", teamA: ["e", "f"], teamB: ["g", "h"] },
  ];
  const after1 = [{ id: "m2", teamA: ["e", "f"], teamB: ["g", "h"] }]; // held1 dissolved
  const noted1 = noteDissolvedHeldMatchups(state1, before1, after1, "John checked out", {
    players: namedPlayers,
    affectedPlayer: "John",
  });
  assert("a dissolved HELD matchup produces a new queueActivityLog entry", noted1.queueActivityLog.length === 1);
  const entry1 = noted1.queueActivityLog[0];
  assert("entry has the matchupId, reason, and a timestamp", (
    entry1.matchupId === "held1" &&
    entry1.reason === "John checked out" &&
    typeof entry1.timestamp === "number"
  ));
  assert("entry captures the full matchup — team A names resolved from ids", entry1.teamA.join(",") === "John,Mike");
  assert("entry captures the full matchup — team B names resolved from ids", entry1.teamB.join(",") === "Peter,Carl");
  assert("entry records which player was responsible (affectedPlayer)", entry1.affectedPlayer === "John");
  assert("caller can detect it happened via reference inequality", noted1.queueActivityLog !== state1.queueActivityLog);

  // dissolving an ORDINARY (not-held) matchup is expected/unremarkable — no log entry
  const state2 = { queueActivityLog: [] };
  const before2 = [{ id: "ordinary1", teamA: ["a", "b"], teamB: ["c", "d"] }];
  const after2 = [];
  const noted2 = noteDissolvedHeldMatchups(state2, before2, after2, "Sarah was substituted", { players: namedPlayers });
  assert("dissolving a non-held matchup logs nothing", noted2.queueActivityLog.length === 0);
  assert("no-op returns the exact same state reference", noted2 === state2);

  // nothing dissolved at all (before === after in content) -- no-op
  const state3 = { queueActivityLog: [] };
  const same = [{ id: "held2", teamA: ["a", "b"], teamB: ["c", "d"], held: true }];
  const noted3 = noteDissolvedHeldMatchups(state3, same, same, "irrelevant", { players: namedPlayers });
  assert("nothing dissolved -- no-op, same reference", noted3 === state3);

  // multiple held matchups dissolved in one action
  const state4 = { queueActivityLog: [] };
  const before4 = [
    { id: "held3", teamA: ["a"], teamB: ["b"], held: true },
    { id: "held4", teamA: ["c"], teamB: ["d"], held: true },
  ];
  const noted4 = noteDissolvedHeldMatchups(state4, before4, [], "session reset", { players: namedPlayers });
  assert("multiple dissolved held matchups each get their own entry", noted4.queueActivityLog.length === 2);

  // a player no longer in the map (e.g. removed from the session) at capture time
  const state5 = { queueActivityLog: [] };
  const before5 = [{ id: "held5", teamA: ["ghost"], teamB: ["b"], held: true }];
  const noted5 = noteDissolvedHeldMatchups(state5, before5, [], "ghost was removed from the session", {
    players: namedPlayers,
  });
  assert("an unresolvable id falls back to a placeholder name rather than crashing", noted5.queueActivityLog[0].teamA[0] === "Unknown player");

  // affectedPlayer is optional -- callers that don't pass it (or `players`) still work
  const state6 = { queueActivityLog: [] };
  const before6 = [{ id: "held6", teamA: ["a"], teamB: ["b"], held: true }];
  const noted6 = noteDissolvedHeldMatchups(state6, before6, [], "no extra context supplied");
  assert("affectedPlayer defaults to null when not supplied", noted6.queueActivityLog[0].affectedPlayer === null);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
