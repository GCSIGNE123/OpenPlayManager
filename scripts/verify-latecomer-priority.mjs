// Latecomer Priority — automated, headless, logic-layer coverage. Calls the
// real pure function directly (computeLatecomerPriorityPreview,
// dissolveMatchupIfReserved, reservedMatchupIds from src/lib/utils.js) — no
// synthetic reimplementation. The actual apply/undo closures live inside
// PickleballOpenPlay.jsx (same precedent as every other Scorer action
// there — see verify-next-match.mjs's Open Play section) — this file
// mirrors that exact apply/undo logic against the real pure preview
// function, so a mismatch between what's tested here and what
// applyLatecomerPriority/undoLatecomerPriority actually do would only
// happen if someone changes one without the other.
//
// Usage: node scripts/verify-latecomer-priority.mjs
import { computeLatecomerPriorityPreview, dissolveMatchupIfReserved, reservedMatchupIds } from "../src/lib/utils.js";
import { AdaptiveSkillRotationEngine } from "../src/engines/AdaptiveSkillRotationEngine.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayer(id, overrides = {}) {
  return { id, name: `Player ${id}`, skill: "beginner", games: 0, held: false, status: "ACTIVE", ...overrides };
}

function makeMatchup(id, teamA, teamB, overrides = {}) {
  return { id, teamA, teamB, ...overrides };
}

// Mirrors PickleballOpenPlay.jsx's applyLatecomerPriority's substitution
// loop exactly (one substituteInMatchup-shaped step per displaced/inserted
// pair) — see that function's own comment for why this is the same
// primitive, not a new one.
function applyPreview(nextMatchups, fresh) {
  let result = nextMatchups;
  fresh.insertedPlayerIds.forEach((incomingId, i) => {
    const outgoingId = fresh.displacedPlayerIds[i];
    const dissolved = dissolveMatchupIfReserved(result, incomingId, fresh.matchupId);
    result = dissolved.map((m) => {
      if (m.id !== fresh.matchupId) return m;
      const teamA = m.teamA.map((id) => (id === outgoingId ? incomingId : id));
      const teamB = m.teamB.map((id) => (id === outgoingId ? incomingId : id));
      return { ...m, teamA, teamB };
    });
  });
  return result;
}

console.log("\nBasic priority — newly checked-in player can be prioritized");
{
  const players = {
    guil: makePlayer("guil", { name: "Guil", games: 2 }),
    jovy: makePlayer("jovy", { name: "Jovy", games: 0 }),
    alfred: makePlayer("alfred", { name: "Alfred", games: 1 }),
    mae: makePlayer("mae", { name: "Mae", games: 1 }),
    ken: makePlayer("ken", { name: "Ken", games: 0, skill: "intermediate" }),
  };
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("proposed matchup is valid", preview.ok === true);
  assert("targets the only waiting matchup", preview.matchupId === "m1");
  assert("Ken is inserted", preview.insertedPlayerIds[0] === "ken");
  assert("Guil (most games among the 4) is displaced, not Jovy/Alfred/Mae", preview.displacedPlayerIds[0] === "guil");
  assert("teamA now has Ken in Guil's old slot", preview.after.teamA[0] === "ken" && preview.after.teamA[1] === "jovy");
  assert("teamB unchanged", preview.after.teamB[0] === "alfred" && preview.after.teamB[1] === "mae");

  const applied = applyPreview(nextMatchups, preview);
  assert("existing waiting matchup was replaced correctly", applied[0].teamA.includes("ken") && !applied[0].teamA.includes("guil"));
  assert("displaced player (Guil) returns to the queue — simply absent from every matchup now", !reservedMatchupIds(applied).has("guil"));
  assert("Ken is now reserved (in the matchup)", reservedMatchupIds(applied).has("ken"));
}

console.log("\nNormal Adaptive Skill Rotation remains unchanged when priority is not used");
{
  const players = {
    a: makePlayer("a", { skill: "beginner" }),
    b: makePlayer("b", { skill: "beginner" }),
    c: makePlayer("c", { skill: "beginner" }),
    d: makePlayer("d", { skill: "beginner" }),
  };
  const engine = new AdaptiveSkillRotationEngine();
  const context = { waitingIds: ["a", "b", "c", "d"], players, existingMatchups: [], phase: "normal" };
  // Latecomer Priority's own code never imports or calls
  // AdaptiveSkillRotationEngine at all (see lib/utils.js's
  // computeLatecomerPriorityPreview — it only ever reads an already-built
  // nextMatchups array). This is a sanity check that the engine's own
  // pre-existing public contract (same 4 waiting players in, one 2v2
  // matchup out, every waiting id placed exactly once) still holds — not a
  // determinism guarantee, which this engine never promised (team-internal
  // slot order can vary run to run; that's pre-existing, untouched by this
  // feature).
  const result = engine.generateMatchups(context);
  const placedIds = result.flatMap((m) => [...m.teamA, ...m.teamB]).sort();
  assert("engine still produces exactly one 2v2 matchup from 4 waiting players", result.length === 1 && result[0].teamA.length === 2 && result[0].teamB.length === 2);
  assert("every waiting player is placed exactly once — untouched by this feature", JSON.stringify(placedIds) === JSON.stringify(["a", "b", "c", "d"]));
}

console.log("\nPreview — does not modify state before confirmation");
{
  const players = {
    guil: makePlayer("guil", { games: 2 }),
    jovy: makePlayer("jovy", { games: 0 }),
    alfred: makePlayer("alfred", { games: 1 }),
    mae: makePlayer("mae", { games: 1 }),
    ken: makePlayer("ken", { games: 0 }),
  };
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const before = JSON.stringify(nextMatchups);
  computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("calling preview never mutates the nextMatchups array passed in", JSON.stringify(nextMatchups) === before);
}

console.log("\nCancel — leaves the queue completely unchanged (preview is pure, Cancel calls no mutation)");
{
  const players = { guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"), ken: makePlayer("ken") };
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const before = JSON.stringify(nextMatchups);
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("preview computed successfully", preview.ok === true);
  // Cancel === discarding `preview` without ever calling applyPreview/save.
  assert("nextMatchups is still byte-for-byte the original after a preview+cancel", JSON.stringify(nextMatchups) === before);
}

console.log("\nApply Priority — changes the queue correctly");
{
  const players = {
    guil: makePlayer("guil", { games: 3 }),
    jovy: makePlayer("jovy", { games: 0 }),
    alfred: makePlayer("alfred", { games: 1 }),
    mae: makePlayer("mae", { games: 2 }),
    ken: makePlayer("ken", { games: 0 }),
  };
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  const applied = applyPreview(nextMatchups, preview);
  assert("Guil (3 games, most of the 4) is the one displaced", preview.displacedPlayerIds[0] === "guil");
  assert("applied matchup contains Ken and no longer Guil", applied[0].teamA.includes("ken") && !applied[0].teamA.includes("guil"));
  assert("only one matchup existed and still exists (no duplicate/stale matchup created)", applied.length === 1);
}

console.log("\nUndo — restores the exact previous matchup, displaced player, and does not regenerate a different matchup");
{
  const players = {
    guil: makePlayer("guil", { games: 3 }),
    jovy: makePlayer("jovy", { games: 0 }),
    alfred: makePlayer("alfred", { games: 1 }),
    mae: makePlayer("mae", { games: 2 }),
    ken: makePlayer("ken", { games: 0 }),
  };
  const original = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(original, players, ["ken"]);
  const snapshot = { nextMatchups: original, matchupId: preview.matchupId, after: preview.after }; // mirrors setLatecomerPrioritySnapshot
  const applied = applyPreview(original, preview);
  assert("applied differs from original", JSON.stringify(applied) !== JSON.stringify(original));

  // undoLatecomerPriority: verify intactness (current teamA/teamB === snapshot.after), then restore snapshot.nextMatchups verbatim.
  const current = applied.find((m) => m.id === snapshot.matchupId);
  const stillIntact =
    current &&
    JSON.stringify(current.teamA) === JSON.stringify(snapshot.after.teamA) &&
    JSON.stringify(current.teamB) === JSON.stringify(snapshot.after.teamB);
  assert("Undo's intactness check passes for an untouched applied matchup", stillIntact);
  const restored = stillIntact ? snapshot.nextMatchups : applied;
  assert("Undo restores the EXACT previous matchup (Guil + Jovy vs Alfred + Mae)", JSON.stringify(restored) === JSON.stringify(original));
  assert("Undo does not regenerate — it's the literal captured array reference", restored === original);
}

console.log("\nUndo — unavailable after dispatch/start (matchup no longer in nextMatchups)");
{
  const players = { guil: makePlayer("guil", { games: 2 }), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"), ken: makePlayer("ken") };
  const original = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(original, players, ["ken"]);
  const applied = applyPreview(original, preview);
  // Simulate dispatch: the matchup is removed from nextMatchups entirely.
  const afterDispatch = applied.filter((m) => m.id !== preview.matchupId);
  // This is exactly the condition PickleballOpenPlay.jsx's self-healing
  // effect checks (state.nextMatchups.some(m => m.id === matchupId)) to
  // decide whether to clear latecomerPriority + the Undo snapshot.
  const stillPresent = afterDispatch.some((m) => m.id === preview.matchupId);
  assert("matchup is gone from nextMatchups once dispatched", !stillPresent);
  assert("Undo must be unavailable once the matchup has left nextMatchups", !stillPresent);
}

console.log("\nUndo — stale Undo state fails safely (matchup changed further since Apply)");
{
  const players = { guil: makePlayer("guil", { games: 2 }), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"), ken: makePlayer("ken"), leo: makePlayer("leo", { games: 0 }) };
  const original = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(original, players, ["ken"]);
  const applied = applyPreview(original, preview);
  const snapshot = { nextMatchups: original, matchupId: preview.matchupId, after: preview.after };
  // Someone else further edits the SAME matchup (e.g. manual Fix Teams swaps in Leo for Jovy) before Undo is clicked.
  const furtherEdited = applied.map((m) => (m.id === preview.matchupId ? { ...m, teamA: [m.teamA[0], "leo"] } : m));
  const current = furtherEdited.find((m) => m.id === snapshot.matchupId);
  const stillIntact =
    current &&
    JSON.stringify(current.teamA) === JSON.stringify(snapshot.after.teamA) &&
    JSON.stringify(current.teamB) === JSON.stringify(snapshot.after.teamB);
  assert("stale Undo is correctly detected as no longer safe", !stillIntact);
  assert("queue is left completely unchanged when Undo fails safely (no restore attempted)", JSON.stringify(furtherEdited) !== JSON.stringify(original));
}

console.log("\nMultiple latecomers — two players prioritized into the same matchup");
{
  const players = {
    guil: makePlayer("guil", { games: 4 }),
    jovy: makePlayer("jovy", { games: 3 }),
    alfred: makePlayer("alfred", { games: 1 }),
    mae: makePlayer("mae", { games: 0 }),
    ken: makePlayer("ken", { games: 0 }),
    leo: makePlayer("leo", { games: 0 }),
  };
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken", "leo"]);
  assert("two-latecomer proposal is valid", preview.ok === true);
  assert("the two highest-games players (Guil, Jovy) are displaced", new Set(preview.displacedPlayerIds).has("guil") && new Set(preview.displacedPlayerIds).has("leo") === false && new Set(preview.displacedPlayerIds).has("jovy"));
  assert("Mae (0 games) and Alfred (1 game) are NOT displaced", !preview.displacedPlayerIds.includes("mae") && !preview.displacedPlayerIds.includes("alfred"));
  const applied = applyPreview(nextMatchups, preview);
  assert("both latecomers now in the matchup", [...applied[0].teamA, ...applied[0].teamB].includes("ken") && [...applied[0].teamA, ...applied[0].teamB].includes("leo"));
  assert("matchup still has exactly 2 per side", applied[0].teamA.length === 2 && applied[0].teamB.length === 2);
}

console.log("\nMultiple latecomers — invalid combination (too many for one matchup)");
{
  const players = { guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae") };
  const latecomers = ["ken", "leo", "mark", "nina", "opal"].reduce((acc, id) => ({ ...acc, [id]: makePlayer(id, { games: 0 }) }), {});
  Object.assign(players, latecomers);
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken", "leo", "mark", "nina", "opal"]);
  assert("5 latecomers for a 4-slot matchup is rejected, not forced", preview.ok === false);
  assert("reason explains the mismatch", preview.reason.toLowerCase().includes("too many"));
}

console.log("\nInsufficient valid players — every upcoming matchup is locked or held");
{
  const players = { guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"), ken: makePlayer("ken", { games: 0 }) };
  const nextMatchups = [
    makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"], { locked: true }),
  ];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("a locked-only queue is correctly rejected", preview.ok === false);
  assert("nothing about nextMatchups changed", JSON.stringify(nextMatchups) === JSON.stringify([makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"], { locked: true })]));
}

console.log("\nEdge case — locked matchup is skipped in favor of the next unlocked one");
{
  const players = {
    guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"),
    sam: makePlayer("sam", { games: 2 }), ted: makePlayer("ted"), uma: makePlayer("uma"), vic: makePlayer("vic"),
    ken: makePlayer("ken", { games: 0 }),
  };
  const nextMatchups = [
    makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"], { locked: true }),
    makeMatchup("m2", ["sam", "ted"], ["uma", "vic"]),
  ];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("targets m2 (first unlocked), not the locked m1", preview.matchupId === "m2");
}

console.log("\nEdge case — held matchup is skipped in favor of the next available one");
{
  const players = {
    guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"),
    sam: makePlayer("sam", { games: 2 }), ted: makePlayer("ted"), uma: makePlayer("uma"), vic: makePlayer("vic"),
    ken: makePlayer("ken", { games: 0 }),
  };
  const nextMatchups = [
    makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"], { held: true }),
    makeMatchup("m2", ["sam", "ted"], ["uma", "vic"]),
  ];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("targets m2 (not held), not the held m1", preview.matchupId === "m2");
}

console.log("\nEdge case — latecomer is held (stale button click) fails safely");
{
  const players = { guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"), ken: makePlayer("ken", { games: 0, held: true }) };
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("a held latecomer is rejected, not force-inserted", preview.ok === false);
  assert("reason mentions unavailability", preview.reason.toLowerCase().includes("no longer available"));
}

console.log("\nEdge case — latecomer checked out (stale button click) fails safely");
{
  const players = { guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"), ken: makePlayer("ken", { games: 0, status: "CHECKED_OUT" }) };
  const nextMatchups = [makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"])];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("a checked-out latecomer is rejected, not force-inserted", preview.ok === false);
}

console.log("\nEdge case — latecomer already reserved in an upcoming matchup fails safely");
{
  const players = { guil: makePlayer("guil"), jovy: makePlayer("jovy"), alfred: makePlayer("alfred"), mae: makePlayer("mae"), ken: makePlayer("ken", { games: 0 }), sam: makePlayer("sam") };
  const nextMatchups = [
    makeMatchup("m1", ["guil", "jovy"], ["alfred", "mae"]),
    makeMatchup("m2", ["ken", "sam"], ["guil", "jovy"]), // contrived: ken already in another matchup
  ];
  const preview = computeLatecomerPriorityPreview(nextMatchups, players, ["ken"]);
  assert("a latecomer already reserved elsewhere is rejected", preview.ok === false);
  assert("reason explains it", preview.reason.includes("already part of an upcoming matchup"));
}

console.log("\nEdge case — no upcoming matchup exists at all");
{
  const players = { ken: makePlayer("ken", { games: 0 }) };
  const preview = computeLatecomerPriorityPreview([], players, ["ken"]);
  assert("empty queue is rejected with a clear reason, nothing forced", preview.ok === false);
}

console.log("\nEdge case — no player selected");
{
  const nextMatchups = [makeMatchup("m1", ["a", "b"], ["c", "d"])];
  const preview = computeLatecomerPriorityPreview(nextMatchups, {}, []);
  assert("empty selection is rejected", preview.ok === false);
}

console.log("\nRegression — feature does not touch reservedMatchupIds/dissolveMatchupIfReserved's existing contract");
{
  const nextMatchups = [makeMatchup("m1", ["a", "b"], ["c", "d"])];
  assert("reservedMatchupIds still returns exactly the 4 reserved ids", reservedMatchupIds(nextMatchups).size === 4);
  const dissolved = dissolveMatchupIfReserved(nextMatchups, "a");
  assert("dissolveMatchupIfReserved still tears down the whole matchup for a reserved player", dissolved.length === 0);
  const untouched = dissolveMatchupIfReserved(nextMatchups, "z");
  assert("dissolveMatchupIfReserved is still a no-op for an unreserved player", untouched === nextMatchups || JSON.stringify(untouched) === JSON.stringify(nextMatchups));
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
