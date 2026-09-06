// On Break / Left Enforcement — see PROJECT.md's UX audit finding: the
// Player app writes playStatus (available/on_break/confirmation_required/
// left) into the session row, but until this fix, Pro's matchmaking
// engine and dispatch logic never read it at all — only
// WaitingPlayersPanel.jsx did, purely for an organizer-facing badge. This
// script exercises the real, unmodified shared choke point
// (isEligibleForMatchmaking, inside refreshNextMatchups/
// regenerateNextMatchups — used by EVERY rotation mode) and the dispatch-
// time re-check (isDispatchEligible) and the reservation-cleanup step
// (dissolveMatchupsForPausedPlayers) directly, plus one full engine-level
// scenario via AdaptiveSkillRotationEngine to prove the exclusion actually
// reaches candidate SELECTION, not just a filtered list somewhere.
//
// Usage: node scripts/verify-play-status-enforcement.mjs
import { AdaptiveSkillRotationEngine } from "../src/engines/AdaptiveSkillRotationEngine.js";
import { refreshNextMatchups, regenerateNextMatchups, dissolveMatchupsForPausedPlayers, maxUpcomingMatchups } from "../src/lib/utils.js";
import { isDispatchEligible, dispatchAvailableCourts } from "../src/lib/courtDispatch.js";
import { getRotationEngine } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makePlayer(id, overrides) {
  return { id, name: id, skill: "beginner", games: 0, wins: 0, losses: 0, streak: 0, lastResult: null, partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, recentOpponentIds: [], checkedInAt: Date.now() - 20 * 60000, ...overrides };
}

console.log("\n1. Available player remains eligible (baseline — this fix changes nothing for a normal waiting player)");
{
  const players = {
    A: makePlayer("A", { playStatus: "available" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
  };
  const existing = refreshNextMatchups(["A", "B", "C", "D"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  assert("a full matchup forms from 4 available players", existing.length === 1);
  const ids = new Set([...existing[0].teamA, ...existing[0].teamB]);
  assert("all 4 available players are selected", ["A", "B", "C", "D"].every((id) => ids.has(id)));
}

console.log("\n2. On-break player is excluded from candidate selection (refreshNextMatchups, the shared choke point)");
{
  const players = {
    A: makePlayer("A", { playStatus: "on_break" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
    E: makePlayer("E"),
  };
  const matchups = refreshNextMatchups(["A", "B", "C", "D", "E"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  assert("exactly one matchup forms (4 of the 5 waiting, A excluded)", matchups.length === 1);
  const ids = new Set([...matchups[0].teamA, ...matchups[0].teamB]);
  assert("on_break player A is never selected", !ids.has("A"));
  assert("the other 4 eligible players (B, C, D, E) are all selected instead", ["B", "C", "D", "E"].every((id) => ids.has(id)));
}

console.log("\n3. Left player is excluded from candidate selection");
{
  const players = {
    A: makePlayer("A", { playStatus: "left" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
    E: makePlayer("E"),
  };
  const matchups = refreshNextMatchups(["A", "B", "C", "D", "E"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  const ids = new Set(matchups.flatMap((m) => [...m.teamA, ...m.teamB]));
  assert("left player A is never selected", !ids.has("A"));
  assert("the other 4 eligible players are selected", ["B", "C", "D", "E"].every((id) => ids.has(id)));
}

console.log("\n4. On-break and left players cannot appear in generated matchups — engine-level, multiple paused players at once, across rotation modes");
{
  for (const mode of ["balanced", "adaptiveSkill", "progressiveSkill", "transition", "competitive"]) {
    const players = {
      A: makePlayer("A", { playStatus: "on_break" }),
      B: makePlayer("B", { playStatus: "left" }),
      C: makePlayer("C"),
      D: makePlayer("D"),
      E: makePlayer("E"),
      F: makePlayer("F"),
    };
    const engine = getRotationEngine(mode);
    const matchups = refreshNextMatchups(["A", "B", "C", "D", "E", "F"], players, [], engine, null, Infinity);
    const selectedIds = new Set(matchups.flatMap((m) => [...m.teamA, ...m.teamB]));
    assert(`[${mode}] on_break player A never appears in a generated matchup`, !selectedIds.has("A"));
    assert(`[${mode}] left player B never appears in a generated matchup`, !selectedIds.has("B"));
  }
}

console.log("\n5. Changing back to available makes the player eligible again");
{
  const now = Date.now();
  const playersPaused = {
    A: makePlayer("A", { playStatus: "on_break", checkedInAt: now - 30 * 60000 }),
    B: makePlayer("B", { checkedInAt: now - 5 * 60000 }),
    C: makePlayer("C", { checkedInAt: now - 5 * 60000 }),
    D: makePlayer("D", { checkedInAt: now - 5 * 60000 }),
  };
  const whilePaused = refreshNextMatchups(["A", "B", "C", "D"], playersPaused, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  assert("while A is on_break, no matchup forms yet (only 3 of 4 needed players eligible)", whilePaused.length === 0);

  const playersAvailableAgain = { ...playersPaused, A: { ...playersPaused.A, playStatus: "available" } };
  const afterReturn = refreshNextMatchups(["A", "B", "C", "D"], playersAvailableAgain, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  assert("once A is available again, a full matchup forms", afterReturn.length === 1);
  const ids = new Set([...afterReturn[0].teamA, ...afterReturn[0].teamB]);
  assert("A is now included", ids.has("A"));
}

console.log("\n6. confirmation_required is preserved — a player mid-confirmation remains eligible/selectable, never excluded");
{
  const players = {
    A: makePlayer("A", { playStatus: "confirmation_required" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
  };
  const matchups = refreshNextMatchups(["A", "B", "C", "D"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  assert("a full matchup forms including the confirmation_required player", matchups.length === 1);
  const ids = new Set([...matchups[0].teamA, ...matchups[0].teamB]);
  assert("confirmation_required player A IS selected — this status means 'awaiting confirmation for an already-formed match', not 'don't call me'", ids.has("A"));

  // Same guarantee at the dispatch-eligibility re-check.
  const matchup = { teamA: ["A", "B"], teamB: ["C", "D"] };
  assert("isDispatchEligible allows a confirmation_required player through unchanged", isDispatchEligible(matchup, players));
}

console.log("\n7. Existing sessions without playStatus (predating this field) continue to behave correctly — never mistaken for on_break/left");
{
  const players = {
    A: makePlayer("A"), // no playStatus field at all
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
  };
  delete players.A.playStatus;
  const matchups = refreshNextMatchups(["A", "B", "C", "D"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  assert("a player with no playStatus field is treated as available, not excluded", matchups.length === 1 && new Set([...matchups[0].teamA, ...matchups[0].teamB]).has("A"));
}

console.log("\n8. isDispatchEligible — the dispatch-time belt-and-suspenders re-check");
{
  const players = {
    A: makePlayer("A", { playStatus: "on_break" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
  };
  const matchupWithOnBreak = { teamA: ["A", "B"], teamB: ["C", "D"] };
  assert("a matchup containing an on_break player is never dispatch-eligible, even if it somehow already exists", !isDispatchEligible(matchupWithOnBreak, players));

  const playersLeft = { ...players, A: { ...players.A, playStatus: "left" } };
  assert("a matchup containing a left player is never dispatch-eligible", !isDispatchEligible(matchupWithOnBreak, playersLeft));

  const playersAllAvailable = { A: makePlayer("A"), B: makePlayer("B"), C: makePlayer("C"), D: makePlayer("D") };
  assert("an ordinary all-available matchup remains dispatch-eligible (no regression)", isDispatchEligible(matchupWithOnBreak, playersAllAvailable));
}

console.log("\n9. dispatchAvailableCourts never places an on_break/left player's matchup on a court, even if the matchup somehow still exists in nextMatchups");
{
  const players = {
    A: makePlayer("A", { playStatus: "on_break" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
    E: makePlayer("E"),
    F: makePlayer("F"),
    G: makePlayer("G"),
    H: makePlayer("H"),
  };
  // Simulates a stale matchup already sitting in nextMatchups from before A
  // went on_break, plus one genuinely clean matchup behind it.
  const nextMatchups = [
    { id: "stale", teamA: ["A", "B"], teamB: ["C", "D"] },
    { id: "clean", teamA: ["E", "F"], teamB: ["G", "H"] },
  ];
  const courts = [{ number: 1, status: "open", assignmentMode: "auto" }];
  const result = dispatchAvailableCourts({ courts, nextMatchups, queueIds: ["A", "B", "C", "D", "E", "F", "G", "H"], players, autoFillCourts: true });
  assert("exactly one court dispatched", result.dispatched.length === 1);
  assert("the dispatched matchup is the clean one, never the stale on_break matchup", result.dispatched[0].matchupId === "clean");
  assert("the stale matchup is left untouched in nextMatchups, not silently discarded (dispatch never edits/removes matchups it skips)", result.nextMatchups.some((m) => m.id === "stale"));
}

console.log("\n10. dissolveMatchupsForPausedPlayers — frees an on_break/left player's teammates back to the waiting pool");
{
  const players = {
    A: makePlayer("A", { playStatus: "on_break" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
    E: makePlayer("E"), // unrelated, untouched matchup
    F: makePlayer("F"),
    G: makePlayer("G"),
    H: makePlayer("H"),
  };
  const nextMatchups = [
    { id: "withPaused", teamA: ["A", "B"], teamB: ["C", "D"] },
    { id: "unrelated", teamA: ["E", "F"], teamB: ["G", "H"] },
  ];
  const result = dissolveMatchupsForPausedPlayers(nextMatchups, players);
  assert("the matchup containing the on_break player is dissolved", !result.some((m) => m.id === "withPaused"));
  assert("an unrelated matchup with no paused player is left completely untouched", result.some((m) => m.id === "unrelated"));

  const nonePaused = [{ id: "clean", teamA: ["E", "F"], teamB: ["G", "H"] }];
  assert("a no-op when no player is paused — unrelated matchups pass through unchanged", dissolveMatchupsForPausedPlayers(nonePaused, { E: makePlayer("E") }).length === 1);
}

console.log("\n11. Multi-court / insufficient-player scenarios remain safe with paused players present");
{
  // Only 5 players total, 2 of them paused — genuinely not enough eligible
  // players (3) to form even one full court. Must never crash, never form
  // a partial/invalid matchup.
  const players = {
    A: makePlayer("A", { playStatus: "on_break" }),
    B: makePlayer("B", { playStatus: "left" }),
    C: makePlayer("C"),
    D: makePlayer("D"),
    E: makePlayer("E"),
  };
  const matchups = refreshNextMatchups(["A", "B", "C", "D", "E"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  assert("no matchup forms — only 3 eligible players remain, never enough for a valid 4-player match", matchups.length === 0);
  assert("no partial/invalid team is ever produced", matchups.every((m) => m.teamA.length === 2 && m.teamB.length === 2));
}

console.log("\n12. No duplicate or invalid player assignments — a paused player never double-counted or split across teams");
{
  const players = {
    A: makePlayer("A", { playStatus: "on_break" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
    E: makePlayer("E"),
    F: makePlayer("F"),
  };
  const matchups = refreshNextMatchups(["A", "B", "C", "D", "E", "F"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  const allIds = matchups.flatMap((m) => [...m.teamA, ...m.teamB]);
  assert("every selected id appears exactly once across all generated matchups", allIds.length === new Set(allIds).size);
  assert("A never appears anywhere in any generated matchup", !allIds.includes("A"));
}

console.log("\n13. regenerateNextMatchups (the explicit 'Regenerate matchups' action) also excludes on_break/left players");
{
  const players = {
    A: makePlayer("A", { playStatus: "on_break" }),
    B: makePlayer("B"),
    C: makePlayer("C"),
    D: makePlayer("D"),
    E: makePlayer("E"),
  };
  const rebuilt = regenerateNextMatchups(["A", "B", "C", "D", "E"], players, [], getRotationEngine("adaptiveSkill"), null, Infinity);
  const ids = new Set(rebuilt.flatMap((m) => [...m.teamA, ...m.teamB]));
  assert("regenerate never selects the on_break player", !ids.has("A"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
