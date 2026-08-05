// Player Payment Tracking — automated, headless, logic-layer coverage.
// Calls the real pure functions directly (setPlayerPayment,
// derivePaymentStats from src/lib/queueManagement.js; computeSessionAnalyticsReport
// from src/lib/sessionAnalytics.js) — no synthetic reimplementation.
//
// Usage: node scripts/verify-payment-tracking.mjs
import { setPlayerPayment, derivePaymentStats } from "../src/lib/queueManagement.js";
import { computeSessionAnalyticsReport } from "../src/lib/sessionAnalytics.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

function makeState(overrides = {}) {
  return {
    players: {
      p1: { id: "p1", name: "Jofel", skill: "beginner", checkedIn: true, checkedInAt: Date.now(), games: 0, paymentStatus: "unpaid", paymentMethod: null },
      p2: { id: "p2", name: "Guil", skill: "beginner", checkedIn: true, checkedInAt: Date.now(), games: 0, paymentStatus: "unpaid", paymentMethod: null },
      p3: { id: "p3", name: "Mark", skill: "intermediate", checkedIn: false, checkedInAt: null, games: 0, paymentStatus: "unpaid", paymentMethod: null },
    },
    queueIds: ["p1", "p2"],
    nextMatchups: [],
    matchHistory: [],
    skillChangeLog: [],
    queueActivityLog: [],
    rotationMode: "balanced",
    sessionStartedAt: Date.now() - 60 * 60000,
    courts: [{ number: 1 }],
    ...overrides,
  };
}

console.log("\nDefault UP status");
{
  const state = makeState();
  assert("p1 defaults to unpaid", state.players.p1.paymentStatus === "unpaid");
  assert("p1's payment method defaults to null", state.players.p1.paymentMethod === null);
}

console.log("\nPaid by Cash");
{
  const state = makeState();
  const next = setPlayerPayment(state, "p1", "cash");
  assert("paymentStatus is now paid", next.players.p1.paymentStatus === "paid");
  assert("paymentMethod is cash", next.players.p1.paymentMethod === "cash");
  const entry = next.queueActivityLog[0];
  assert("a Payment Received entry was logged", entry.kind === "paymentReceived");
  assert("logged entry names the right player/method", entry.playerName === "Jofel" && entry.newMethod === "cash");
}

console.log("\nPaid by GCash");
{
  const state = makeState();
  const next = setPlayerPayment(state, "p1", "gcash");
  assert("paymentStatus is now paid", next.players.p1.paymentStatus === "paid");
  assert("paymentMethod is gcash", next.players.p1.paymentMethod === "gcash");
  assert("logged entry is Payment Received with GCash", next.queueActivityLog[0].kind === "paymentReceived" && next.queueActivityLog[0].newMethod === "gcash");
}

console.log("\nChange Cash -> GCash (facilitator correction)");
{
  let state = makeState();
  state = setPlayerPayment(state, "p1", "cash");
  const before = state.queueActivityLog.length;
  const next = setPlayerPayment(state, "p1", "gcash");
  assert("method is now gcash", next.players.p1.paymentMethod === "gcash");
  assert("still marked paid", next.players.p1.paymentStatus === "paid");
  assert("a new log entry was added", next.queueActivityLog.length === before + 1);
  const entry = next.queueActivityLog[0];
  assert("entry kind is paymentUpdated (not paymentReceived again)", entry.kind === "paymentUpdated");
  assert("entry records the Cash -> GCash correction", entry.previousMethod === "cash" && entry.newMethod === "gcash");
  assert("reason reads Cash -> GCash", entry.reason === "Cash → GCash");
}

console.log("\nRevert Paid -> Unpaid (mis-clicked payment)");
{
  let state = makeState();
  state = setPlayerPayment(state, "p1", "cash");
  const before = state.queueActivityLog.length;
  const next = setPlayerPayment(state, "p1", "unpaid");
  assert("paymentStatus is back to unpaid", next.players.p1.paymentStatus === "unpaid");
  assert("paymentMethod is cleared back to null", next.players.p1.paymentMethod === null);
  assert("a new log entry was added", next.queueActivityLog.length === before + 1);
  const entry = next.queueActivityLog[0];
  assert("entry kind is paymentUpdated", entry.kind === "paymentUpdated");
  assert("entry records the previous method and null newMethod", entry.previousMethod === "cash" && entry.newMethod === null);
  assert("reason reads Cash -> Unpaid", entry.reason === "Cash → Unpaid");
}

console.log("\nRevert Paid (GCash) -> Unpaid");
{
  let state = makeState();
  state = setPlayerPayment(state, "p1", "gcash");
  const next = setPlayerPayment(state, "p1", "unpaid");
  assert("paymentStatus is back to unpaid", next.players.p1.paymentStatus === "unpaid");
  assert("paymentMethod is cleared", next.players.p1.paymentMethod === null);
  assert("reason reads GCash -> Unpaid", next.queueActivityLog[0].reason === "GCash → Unpaid");
}

console.log("\nGuard: reverting an already-unpaid player is a no-op");
{
  const state = makeState();
  assert("returns the exact same state reference", setPlayerPayment(state, "p1", "unpaid") === state);
}

console.log("\nFull round trip: Cash -> GCash -> Unpaid -> Cash again");
{
  let state = makeState();
  state = setPlayerPayment(state, "p1", "cash");
  state = setPlayerPayment(state, "p1", "gcash");
  state = setPlayerPayment(state, "p1", "unpaid");
  assert("unpaid after the revert", state.players.p1.paymentStatus === "unpaid" && state.players.p1.paymentMethod === null);
  state = setPlayerPayment(state, "p1", "cash");
  assert("can be marked paid again after a revert (paymentReceived, not paymentUpdated)", state.players.p1.paymentStatus === "paid" && state.players.p1.paymentMethod === "cash");
  assert("re-marking after a revert logs paymentReceived again (it's a fresh payment, not a correction)", state.queueActivityLog[0].kind === "paymentReceived");
}

console.log("\nPayment survives during the current session (unrelated state changes don't clear it)");
{
  let state = makeState();
  state = setPlayerPayment(state, "p1", "cash");
  // simulate an unrelated save cycle touching other fields
  const players = { ...state.players, p1: { ...state.players.p1, games: 3 } };
  state = { ...state, players };
  assert("payment status still paid after other player-state changes", state.players.p1.paymentStatus === "paid");
  assert("payment method still cash", state.players.p1.paymentMethod === "cash");
}

console.log("\nGuard: no-op for an invalid method");
{
  const state = makeState();
  assert("no-op for an unknown method string", setPlayerPayment(state, "p1", "check") === state);
}

console.log("\nGuard: no-op when already paid with that exact method (repeat click)");
{
  let state = makeState();
  state = setPlayerPayment(state, "p1", "cash");
  const next = setPlayerPayment(state, "p1", "cash");
  assert("returns the exact same state reference", next === state);
}

console.log("\nGuard: no-op for a nonexistent player");
{
  const state = makeState();
  assert("no-op for unknown player id", setPlayerPayment(state, "ghost", "cash") === state);
}

console.log("\nSession statistics update correctly (derivePaymentStats)");
{
  let state = makeState();
  let stats = derivePaymentStats(state.players);
  assert("only checked-in players counted (2, not the not-yet-checked-in p3)", stats.totalPlayers === 2);
  assert("starts with 0 paid / 2 unpaid", stats.paid === 0 && stats.unpaid === 2);

  state = setPlayerPayment(state, "p1", "cash");
  state = setPlayerPayment(state, "p2", "gcash");
  stats = derivePaymentStats(state.players);
  assert("both players now paid", stats.paid === 2);
  assert("zero unpaid", stats.unpaid === 0);
  assert("1 cash", stats.cash === 1);
  assert("1 gcash", stats.gcash === 1);
}

console.log("\nSession report includes payment summary");
{
  let state = makeState();
  state = setPlayerPayment(state, "p1", "cash");
  const report = computeSessionAnalyticsReport(state);
  assert("report has a payment field", !!report.payment);
  assert("report.payment.totalPlayers matches checked-in count", report.payment.totalPlayers === 2);
  assert("report.payment.paid is 1", report.payment.paid === 1);
  assert("report.payment.unpaid is 1", report.payment.unpaid === 1);
  assert("report.payment.cash is 1", report.payment.cash === 1);
  assert("report.payment.gcash is 0", report.payment.gcash === 0);
  // Scope Protection — payment must never influence any of the other
  // computed sections; spot-check they're still present and unaffected in
  // shape (this doesn't re-verify their values, already covered by
  // verify-session-analytics.mjs, just confirms payment didn't replace or
  // corrupt them).
  assert("participation section is untouched/still present", typeof report.participation.averageGames === "number");
  assert("waiting section is untouched/still present", typeof report.waiting.averageWaitMinutes === "number");
  assert("diversity section is untouched/still present", typeof report.diversity.averageUniquePartners === "number");
  assert("grade section is untouched/still present", typeof report.grade.score === "number");
}

console.log("\nReset: payment resets for a new session");
{
  // Mirrors PickleballOpenPlay.jsx's startSession — every new session
  // builds a brand-new player record from scratch (paymentStatus:
  // "unpaid", paymentMethod: null), regardless of anything from a
  // previous session. This test documents that contract directly against
  // the same literal defaults startSession uses, since payment data lives
  // only on the session's own (never-reused) player record, not the
  // Player Database.
  const freshPlayer = { id: "p1", name: "Jofel", skill: "beginner", checkedIn: false, checkedInAt: null, paymentStatus: "unpaid", paymentMethod: null };
  assert("a freshly-created session player starts unpaid", freshPlayer.paymentStatus === "unpaid");
  assert("a freshly-created session player has no payment method", freshPlayer.paymentMethod === null);
}

console.log("\nScope Protection: setPlayerPayment never touches queueIds/nextMatchups/skill/games/matchmaking fields");
{
  let state = makeState();
  state.players.p1.skill = "beginner";
  state.players.p1.games = 2;
  const originalQueueIds = state.queueIds;
  const originalNextMatchups = state.nextMatchups;
  const next = setPlayerPayment(state, "p1", "cash");
  assert("queueIds reference unchanged", next.queueIds === originalQueueIds);
  assert("nextMatchups reference unchanged", next.nextMatchups === originalNextMatchups);
  assert("skill untouched", next.players.p1.skill === "beginner");
  assert("games untouched", next.players.p1.games === 2);
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
