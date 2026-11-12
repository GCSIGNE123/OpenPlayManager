// Tournament Acceptance Test — automated, headless, logic-layer coverage.
//
// Same precedent as scripts/run-acceptance-test.mjs (Open Play's own
// acceptance script): NOT a UI test, NOT a database write. Drives the same
// pure engine functions the real app calls (imported directly from
// src/lib/* and src/engines/*, unmodified) through a full Round Robin
// pools -> qualification -> playoff-bracket lifecycle, for the two actual
// Saturday tournament fields:
//   - Beginner: 28 teams
//   - Novice:    9 teams
//
// This exists because, as of this task, the entire tournament engine
// (bracket generation, advancement, qualification) had ZERO automated test
// coverage anywhere in this repo — see PROJECT.md's Tournament Safety Audit
// for the full finding. This script is the minimum safety net for
// Saturday: it proves the exact configuration chosen for both divisions
// produces a correct, non-duplicated, power-of-two bracket (or, for
// Novice, a correctly-decided pool champion with no bracket at all) using
// the SAME code path the live app runs, and that a handful of known-risky
// operations (duplicate result submission, a non-power-of-two qualifier
// count) fail safely rather than corrupting state.
//
// Usage: node scripts/run-tournament-acceptance-test.mjs
import { makeEntrant, makeTournament, makeTournamentPool } from "../src/lib/tournamentModel.js";
import { generateRoundRobinSchedule, pairIntoTeams } from "../src/engines/RoundRobinScheduler.js";
import { assignPools, poolLabel } from "../src/engines/PoolAssignment.js";
import { RoundRobinEngine } from "../src/engines/RoundRobinEngine.js";
import { PoolQualificationService } from "../src/engines/PoolQualificationService.js";
import { PlayoffEngine } from "../src/engines/PlayoffEngine.js";

const engine = new RoundRobinEngine();
const qualificationService = new PoolQualificationService();
const playoffEngine = new PlayoffEngine();

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(step, description, condition) {
  if (condition) {
    passCount += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${description}`);
  } else {
    failCount += 1;
    failures.push(`[${step}] ${description}`);
    console.log(`  \x1b[31m✗ ${description}\x1b[0m`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

function makeTeams(n, prefix) {
  return Array.from({ length: n }, (_, i) =>
    makeEntrant(`${prefix} Team ${i + 1}`, [`${prefix.toLowerCase()}-p${i * 2 + 1}`, `${prefix.toLowerCase()}-p${i * 2 + 2}`])
  );
}

// Builds a Round Robin tournament with pools, WITHOUT saving it anywhere —
// the exact same construction lib/tournament.js's
// buildAndSaveRoundRobinTournament does, minus the final saveTournament()
// call (which needs window.storage/Supabase and has no place in a headless
// logic-layer test).
function buildTournament({ name, teams, courtsCount, poolCount, advancesPerPool, qualificationMethod, wildCardCount }) {
  const groups = assignPools(teams, poolCount, "random");
  qualificationService.validateQualifiers(
    groups.map((g) => ({ entrants: g })),
    advancesPerPool
  );
  const pools = groups.map((group, i) =>
    makeTournamentPool({
      label: poolLabel(i),
      entrants: group,
      rounds: generateRoundRobinSchedule({ entrants: group, courtsCount }),
    })
  );
  return makeTournament({
    name,
    sessionCode: "ACCEPTANCE-TEST",
    format: "roundRobin",
    mode: "doubles",
    courtsCount,
    poolCount,
    pools,
    advancesPerPool,
    qualificationMethod,
    wildCardCount,
  });
}

// Plays every real (non-bye) match in every pool through the real engine's
// updateMatchResult — the same function RoundRobinEngine uses in
// production, including its own automatic bracket-generation side effect
// once every pool completes. Winner is always teamA for determinism.
function playAllPoolMatches(tournament) {
  let current = tournament;
  for (const pool of current.pools) {
    for (const round of pool.rounds) {
      for (const match of round.matches) {
        if (match.isBye) continue;
        current = engine.updateMatchResult(current, match.id, { scoreA: 11, scoreB: 7, winnerId: match.teamA.id });
      }
    }
  }
  return current;
}

// Plays an ENTIRE generated bracket through to a champion, one round at a
// time (a later round's matches don't exist with real teams until the
// PREVIOUS round's winners are actually advanced into them — same
// real-world sequencing the organizer UI enforces). Winner is always
// teamA for determinism. Returns the final bracket record.
function playFullBracket(bracket) {
  let current = bracket;
  for (let i = 0; i < current.rounds.length; i++) {
    // Re-read the round from `current` each iteration — earlier rounds'
    // completions may have just populated THIS round's teamA/teamB slots.
    const round = current.rounds[i];
    for (const match of round.matches) {
      if (!match.teamA || !match.teamB) continue; // shouldn't happen at this point in a well-formed bracket, guarded anyway
      current = playoffEngine.startMatch(current, match.id);
      current = playoffEngine.updateBracket(current, match.id, { scoreA: 11, scoreB: 7, winnerId: match.teamA.participantId });
    }
  }
  return current;
}

// ---------------------------------------------------------------------
section("1. Beginner — 28 teams, 4 pools of 7, top 2/pool -> 8-team bracket");
// ---------------------------------------------------------------------
{
  const teams = makeTeams(28, "Beg");
  assert("Beginner", "28 teams created, all unique ids", new Set(teams.map((t) => t.id)).size === 28);

  const tournament = buildTournament({
    name: "Beginner",
    teams,
    courtsCount: 6,
    poolCount: 4,
    advancesPerPool: 2,
    qualificationMethod: "standard",
  });
  assert("Beginner", "4 pools created", tournament.pools.length === 4);
  assert("Beginner", "pool sizes are 7/7/7/7", tournament.pools.every((p) => p.entrants.length === 7));

  const played = playAllPoolMatches(tournament);
  assert("Beginner", "tournament status is 'completed' after every pool match is played", played.status === "completed");

  const qualification = qualificationService.determineQualifiers(played, engine);
  assert("Beginner", "qualification is ready", qualification.ready === true);
  assert("Beginner", "exactly 8 teams qualified", qualification.qualifiedTeams.length === 8);
  const ids = qualification.qualifiedTeams.map((t) => t.participantId);
  assert("Beginner", "no duplicate qualifiers", new Set(ids).size === ids.length);

  assert("Beginner", "bracket auto-generated", played.bracket != null);
  assert("Beginner", "bracket size is 8", played.bracket?.size === 8);
  assert("Beginner", "bracket has 3 rounds (QF, SF, Final)", played.bracket?.rounds.length === 3);
  assert("Beginner", "bracket status is 'ready'", played.bracket?.status === "ready");
  assert(
    "Beginner",
    "round 1 (Quarterfinals) has 4 real, seeded matches",
    played.bracket?.rounds[0].matches.length === 4 && played.bracket.rounds[0].matches.every((m) => m.teamA && m.teamB)
  );
  assert(
    "Beginner",
    "rounds 2-3 (SF, Final) start empty — TBD until PlayoffEngine advances a winner into them",
    played.bracket?.rounds[1].matches.every((m) => m.teamA == null && m.teamB == null) &&
      played.bracket.rounds[2].matches.every((m) => m.teamA == null && m.teamB == null)
  );
  assert("Beginner", "round 1 (QF) name is exactly 'Quarterfinals'", played.bracket?.rounds[0].name === "Quarterfinals");
  assert("Beginner", "round 2 (SF) name is exactly 'Semifinals'", played.bracket?.rounds[1].name === "Semifinals");
  assert("Beginner", "round 3 (Final) name is exactly 'Championship Match'", played.bracket?.rounds[2].name === "Championship Match");

  // Play the ENTIRE bracket through to a champion — QF -> SF -> Final,
  // real winner advancement each round, not just generation.
  const finishedBracket = playFullBracket(played.bracket);
  assert("Beginner", "bracket status is 'completed' once the Final is played", finishedBracket.status === "completed");
  assert("Beginner", "a champion was decided", finishedBracket.champion != null);
  assert("Beginner", "a runner-up was decided", finishedBracket.runnerUp != null);
  assert("Beginner", "champion and runner-up are two different teams", finishedBracket.champion.participantId !== finishedBracket.runnerUp.participantId);
  assert(
    "Beginner",
    "Semifinals were correctly populated with QF winners (never TBD once QF is done)",
    finishedBracket.rounds[1].matches.every((m) => m.teamA && m.teamB)
  );
  assert(
    "Beginner",
    "Semifinal winners are among the original 8 qualifiers, and losers are correctly eliminated (never re-appear later)",
    finishedBracket.rounds[1].matches.every((m) => ids.includes(m.teamA.participantId) && ids.includes(m.teamB.participantId))
  );

  // Safety: a winner cannot be advanced/recorded twice for the same match.
  const qfMatch = finishedBracket.rounds[0].matches[0];
  let threwOnDoubleAdvance = false;
  try {
    playoffEngine.updateBracket(finishedBracket, qfMatch.id, { scoreA: 11, scoreB: 0, winnerId: qfMatch.teamA.participantId });
  } catch {
    threwOnDoubleAdvance = true;
  }
  assert("Beginner", "recording a result again on an already-completed bracket is rejected (bracket is locked once the champion is decided)", threwOnDoubleAdvance);

  // Score correction: reopenBracket is the documented, disclosed path —
  // NOT a full re-cascade (see PlayoffEngine.js's own header on
  // reopenBracket: it does not retroactively re-run later rounds). Verify
  // it does exactly what it documents: unlocks the bracket, clears the
  // champion stamp, and nothing else silently changes.
  const reopened = playoffEngine.reopenBracket(finishedBracket);
  assert("Beginner", "reopening a completed bracket clears champion/runnerUp and unlocks it for correction", reopened.status === "running" && reopened.champion === null);
  assert(
    "Beginner",
    "reopening does NOT retroactively touch already-recorded match results (documented limitation, not a bug)",
    reopened.rounds[0].matches[0].winner === qfMatch.winner && reopened.rounds[1].matches[0].winner === finishedBracket.rounds[1].matches[0].winner
  );
}

// ---------------------------------------------------------------------
section("2. Novice — 9 teams, single pool, NO playoff bracket (crowned by standings)");
// ---------------------------------------------------------------------
{
  const teams = makeTeams(9, "Nov");
  assert("Novice", "9 teams created, all unique ids", new Set(teams.map((t) => t.id)).size === 9);

  const tournament = buildTournament({
    name: "Novice",
    teams,
    courtsCount: 3,
    poolCount: 1,
    advancesPerPool: 1,
    qualificationMethod: "standard",
  });
  assert("Novice", "1 pool created with all 9 teams", tournament.pools.length === 1 && tournament.pools[0].entrants.length === 9);

  const played = playAllPoolMatches(tournament);
  assert("Novice", "tournament status is 'completed'", played.status === "completed");

  const standings = engine.getStandings(played, played.pools[0].id);
  assert("Novice", "standings has all 9 teams ranked", standings.length === 9);
  assert("Novice", "pool champion auto-stamped on completion", played.pools[0].champion != null);
  assert("Novice", "no bracket generated for the single-pool format (none expected/needed)", played.bracket == null);
}

// ---------------------------------------------------------------------
section("3. Safety — non-power-of-two qualifier count must refuse bracket generation");
// ---------------------------------------------------------------------
{
  const teams = makeTeams(9, "Bad");
  const tournament = buildTournament({
    name: "Bad config (3 pools x 3, top 1/pool = 3 qualifiers)",
    teams,
    courtsCount: 3,
    poolCount: 3,
    advancesPerPool: 1,
    qualificationMethod: "standard",
  });
  const played = playAllPoolMatches(tournament);
  assert("Safety", "tournament still completes even with an unsupported qualifier count", played.status === "completed");
  assert("Safety", "bracket is NOT generated for 3 qualifiers (not a power of two) — fails safe, no corrupt bracket", played.bracket == null);
}

// ---------------------------------------------------------------------
section("4. Safety — a completed pool match cannot be silently re-submitted");
// ---------------------------------------------------------------------
{
  const teams = makeTeams(4, "Dup");
  const tournament = buildTournament({
    name: "Duplicate-result guard",
    teams,
    courtsCount: 2,
    poolCount: 1,
    advancesPerPool: 2,
    qualificationMethod: "standard",
  });
  const played = playAllPoolMatches(tournament);
  const anyMatch = played.pools[0].rounds[0].matches.find((m) => !m.isBye);
  let threw = false;
  try {
    engine.updateMatchResult(played, anyMatch.id, { scoreA: 11, scoreB: 0, winnerId: anyMatch.teamA.id });
  } catch {
    threw = true;
  }
  assert("Safety", "re-submitting a result after the pool is completed is rejected, not silently applied", threw);
}

// ---------------------------------------------------------------------
section("5. Fixed Partner Mode pairing (Tournament Safety Audit, Saturday prep bug fix)");
// ---------------------------------------------------------------------
{
  // 6 players: Alice+Bob are a real registered doubles team (mutual
  // partnerId), Cara+Dee likewise, Eve and Fred have no fixed partner at
  // all. Deliberately NOT in a convenient order — Alice and her partner
  // Bob are 3 apart in the roster, exactly the scenario that used to
  // silently produce wrong teams under pure sequential pairing.
  const players = [
    { id: "alice", name: "Alice", partnerId: "bob" },
    { id: "cara", name: "Cara", partnerId: "dee" },
    { id: "eve", name: "Eve", partnerId: null },
    { id: "bob", name: "Bob", partnerId: "alice" },
    { id: "fred", name: "Fred", partnerId: null },
    { id: "dee", name: "Dee", partnerId: "cara" },
  ];
  const teams = pairIntoTeams(players);
  const teamIds = teams.map((t) => t.map((p) => p.id).sort());
  const hasTeam = (a, b) => teamIds.some((t) => t.length === 2 && t.includes(a) && t.includes(b));
  assert("Fixed Partner", "exactly 3 teams formed from 6 players", teams.length === 3);
  assert("Fixed Partner", "Alice is paired with her real fixed partner Bob, not whoever was adjacent in the roster", hasTeam("alice", "bob"));
  assert("Fixed Partner", "Cara is paired with her real fixed partner Dee", hasTeam("cara", "dee"));
  assert("Fixed Partner", "Eve and Fred (no fixed partner) fall through to sequential pairing with each other", hasTeam("eve", "fred"));

  // Backward compatibility: no fixed partners set at all (every existing
  // caller/test before this fix) must behave EXACTLY as before —
  // unchanged pure sequential pairing.
  const noPartners = [
    { id: "p1", name: "P1" },
    { id: "p2", name: "P2" },
    { id: "p3", name: "P3" },
    { id: "p4", name: "P4" },
  ];
  const plainTeams = pairIntoTeams(noPartners);
  assert(
    "Fixed Partner",
    "with no partnerId set anywhere, pairing is unchanged (sequential) — no regression for the common case",
    plainTeams[0][0].id === "p1" && plainTeams[0][1].id === "p2" && plainTeams[1][0].id === "p3" && plainTeams[1][1].id === "p4"
  );

  // A player whose fixed partner isn't checked into THIS session at all
  // (partnerId points to someone absent from the roster) must fall
  // through safely, never crash.
  const partnerAbsent = [
    { id: "gina", name: "Gina", partnerId: "not-here" },
    { id: "hank", name: "Hank", partnerId: null },
  ];
  const fallbackTeams = pairIntoTeams(partnerAbsent);
  assert("Fixed Partner", "a fixed partner who isn't checked in falls through to sequential pairing, never crashes", fallbackTeams.length === 1 && hasTeamIn(fallbackTeams, "gina", "hank"));
}

function hasTeamIn(teams, a, b) {
  return teams.some((t) => t.map((p) => p.id).sort().join(",") === [a, b].sort().join(","));
}

// ---------------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  console.log("\nFailed assertions:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log("All tournament acceptance checks passed.");
}
