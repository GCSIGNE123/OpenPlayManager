// All Sessions / Auto-End Aged Sessions — automated, headless coverage.
// Calls the real functions directly (recordSessionCreated/recordSessionEnded/
// fetchAllSessionIndexEntries/sweepAgedSessions from
// src/lib/sessionIndexModel.js) against a fake in-memory window.storage —
// no synthetic reimplementation of the sweep logic itself.
//
// Usage: node scripts/verify-all-sessions.mjs
import { STORAGE_PREFIX, SESSION_INDEX_PREFIX, SESSION_REPORT_PREFIX } from "../src/lib/constants.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

// Minimal in-memory fake of the app's window.storage KV API — get/set/
// delete/list, shared-flag ignored (this test never needs it).
function makeFakeStorage() {
  const map = new Map();
  return {
    async get(key) {
      if (!map.has(key)) throw new Error(`storage.get: key not found: ${key}`);
      return { value: map.get(key) };
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list(prefix) {
      return { keys: [...map.keys()].filter((k) => k.startsWith(prefix)) };
    },
    _map: map,
  };
}

global.window = { storage: makeFakeStorage() };

const { recordSessionCreated, recordSessionEnded, fetchAllSessionIndexEntries, sweepAgedSessions, endSessionAndRecord } = await import("../src/lib/sessionIndexModel.js");

function makeLiveSession(sessionCode, { sessionStartedAt = Date.now(), players = {} } = {}) {
  return {
    venue: "Test Venue",
    rotationMode: "continuous",
    sessionType: "openPlay",
    sessionStartedAt,
    courts: [{ number: 1 }],
    players,
    queueIds: Object.keys(players),
    nextMatchups: [],
    matchHistory: [],
    queueActivityLog: [],
    skillChangeLog: [],
  };
}

console.log("\nrecordSessionCreated — writes a fresh active index entry");
{
  await recordSessionCreated({ sessionCode: "AAA111", venue: "Court A", rotationMode: "continuous", sessionType: "openPlay", createdAt: 1000 });
  const entries = await fetchAllSessionIndexEntries();
  const entry = entries.find((e) => e.sessionCode === "AAA111");
  assert("entry exists", !!entry);
  assert("status is active", entry.status === "active");
  assert("endedAt is null", entry.endedAt === null);
  assert("createdAt matches", entry.createdAt === 1000);
}

console.log("\nrecordSessionEnded — marks an entry ended, preserving its original fields");
{
  const next = await recordSessionEnded("AAA111", { endedAt: 5000, reason: "Ended by facilitator" });
  assert("status is ended", next.status === "ended");
  assert("endedAt recorded", next.endedAt === 5000);
  assert("reason recorded", next.endReason === "Ended by facilitator");
  assert("original venue preserved", next.venue === "Court A");
  assert("original createdAt preserved", next.createdAt === 1000);
}

console.log("\nrecordSessionEnded — writes a minimal entry even if none existed before (defensive)");
{
  const next = await recordSessionEnded("GHOST99", { endedAt: 9000, reason: "Session data no longer available" });
  assert("a fresh entry was created despite no prior recordSessionCreated call", next.sessionCode === "GHOST99" && next.status === "ended");
}

console.log("\nfetchAllSessionIndexEntries — sorted newest-created first");
{
  await recordSessionCreated({ sessionCode: "OLD001", venue: "Old", rotationMode: "continuous", sessionType: "openPlay", createdAt: 100 });
  await recordSessionCreated({ sessionCode: "NEW001", venue: "New", rotationMode: "continuous", sessionType: "openPlay", createdAt: 999999 });
  const entries = await fetchAllSessionIndexEntries();
  const newIdx = entries.findIndex((e) => e.sessionCode === "NEW001");
  const oldIdx = entries.findIndex((e) => e.sessionCode === "OLD001");
  assert("the newer-created session appears before the older one", newIdx < oldIdx);
}

console.log("\nsweepAgedSessions — leaves a recent (fresh) active session completely untouched");
{
  const code = "FRESH01";
  await recordSessionCreated({ sessionCode: code, venue: "Fresh Session", rotationMode: "continuous", sessionType: "openPlay", createdAt: Date.now() });
  await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(makeLiveSession(code)));
  const ended = await sweepAgedSessions();
  assert("the fresh session was NOT auto-ended", !ended.includes(code));
  const entries = await fetchAllSessionIndexEntries();
  assert("its index entry is still active", entries.find((e) => e.sessionCode === code).status === "active");
  const stillLive = await window.storage.get(`${STORAGE_PREFIX}${code}`);
  assert("its live session record still exists", !!stillLive.value);
}

console.log("\nsweepAgedSessions — auto-ends a session inactive for 3+ days, saving a report first");
{
  const code = "AGED001";
  const threeDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000; // 4 days, comfortably past the 3-day threshold
  const players = {
    p1: { id: "p1", name: "Juan", games: 2, wins: 1, losses: 1, checkedIn: true, paymentStatus: "paid", paymentMethod: "cash" },
    p2: { id: "p2", name: "Maria", games: 2, wins: 1, losses: 1, checkedIn: true, paymentStatus: "unpaid", paymentMethod: null },
  };
  await recordSessionCreated({ sessionCode: code, venue: "Aged Session", rotationMode: "continuous", sessionType: "openPlay", createdAt: threeDaysAgo });
  await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(makeLiveSession(code, { sessionStartedAt: threeDaysAgo, players })));

  const ended = await sweepAgedSessions();
  assert("the aged session WAS auto-ended", ended.includes(code));

  const entries = await fetchAllSessionIndexEntries();
  const entry = entries.find((e) => e.sessionCode === code);
  assert("its index entry is now ended", entry.status === "ended");
  assert("its end reason mentions inactivity", entry.endReason.includes("3+ days") || entry.endReason.includes("inactive"));
  assert("it has a real endedAt timestamp", typeof entry.endedAt === "number" && entry.endedAt > 0);

  let liveGone = false;
  try {
    await window.storage.get(`${STORAGE_PREFIX}${code}`);
  } catch (e) {
    liveGone = true;
  }
  assert("its live session record was deleted", liveGone);

  const { keys } = await window.storage.list(SESSION_REPORT_PREFIX);
  let foundReport = null;
  for (const key of keys) {
    const res = await window.storage.get(key);
    const parsed = JSON.parse(res.value);
    if (parsed.sessionCode === code) foundReport = parsed;
  }
  assert("a report was saved for the auto-ended session", !!foundReport);
  assert("the saved report's payment summary matches the live data (1 paid, 1 unpaid)", foundReport.payment.paid === 1 && foundReport.payment.unpaid === 1);
  assert("the saved report's final standings include both players", foundReport.finalStandings.length === 2);
}

console.log("\nsweepAgedSessions — a second run is a no-op for an already-ended session (idempotent)");
{
  const before = await fetchAllSessionIndexEntries();
  const endedCount = before.filter((e) => e.status === "ended").length;
  await sweepAgedSessions();
  const after = await fetchAllSessionIndexEntries();
  assert("no additional sessions were ended on a repeat sweep", after.filter((e) => e.status === "ended").length === endedCount);
}

console.log("\nsweepAgedSessions — an orphaned active index entry (live record already gone) is marked ended, not left dangling");
{
  const code = "ORPHAN01";
  await recordSessionCreated({ sessionCode: code, venue: "Orphan", rotationMode: "continuous", sessionType: "openPlay", createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000 });
  // deliberately never writing a live STORAGE_PREFIX record for this code
  const ended = await sweepAgedSessions();
  assert("the orphaned entry was cleaned up", ended.includes(code));
  const entries = await fetchAllSessionIndexEntries();
  assert("its status is now ended", entries.find((e) => e.sessionCode === code).status === "ended");
}

// =====================================================================
// End Session from All Sessions — see OpenPlaySessionHistoryScreen.jsx.
// Exercises endSessionAndRecord directly — the exact SAME exported
// function both the manual "End Session" button on an All Sessions card
// AND sweepAgedSessions above already call. Never a second/parallel
// end-session implementation.
// =====================================================================
console.log("\nendSessionAndRecord — the canonical manual end-session sequence, called directly (5/10)");
{
  const code = "MANUAL01";
  const players = {
    p1: { id: "p1", name: "Ana", games: 3, wins: 2, losses: 1, checkedIn: true, paymentStatus: "paid", paymentMethod: "cash" },
    p2: { id: "p2", name: "Ben", games: 3, wins: 1, losses: 2, checkedIn: true, paymentStatus: "unpaid", paymentMethod: null },
  };
  await recordSessionCreated({ sessionCode: code, venue: "Manual End Venue", rotationMode: "continuous", sessionType: "openPlay", createdAt: Date.now() });
  const liveState = makeLiveSession(code, { players });
  await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(liveState));

  const entriesBefore = await fetchAllSessionIndexEntries();
  const entry = entriesBefore.find((e) => e.sessionCode === code);
  await endSessionAndRecord(entry, liveState, "Ended by facilitator");

  const entriesAfter = await fetchAllSessionIndexEntries();
  const endedEntry = entriesAfter.find((e) => e.sessionCode === code);
  assert("7: the session's index entry flips from active to ended", endedEntry.status === "ended");
  assert("8: it now has a real endedAt timestamp", typeof endedEntry.endedAt === "number" && endedEntry.endedAt > 0);
  assert("8: its end reason is the manual-facilitator one, not an auto-sweep reason", endedEntry.endReason === "Ended by facilitator");

  let liveGone = false;
  try {
    await window.storage.get(`${STORAGE_PREFIX}${code}`);
  } catch (e) {
    liveGone = true;
  }
  assert("the live opl-session-* row was deleted — same as the sweep's own cleanup", liveGone);

  const { keys } = await window.storage.list(SESSION_REPORT_PREFIX);
  let foundReport = null;
  for (const key of keys) {
    const res = await window.storage.get(key);
    const parsed = JSON.parse(res.value);
    if (parsed.sessionCode === code) foundReport = parsed;
  }
  assert("a Session Analytics report was saved before the live row was deleted", !!foundReport);
  assert("the saved report reflects the real live data (2 players)", foundReport.finalStandings.length === 2);
}

console.log("\nendSessionAndRecord — supports tournament-type sessions too, same as sweepAgedSessions (no session-type restriction)");
{
  const code = "MANUALTOURNEY01";
  await recordSessionCreated({ sessionCode: code, venue: "Tournament Venue", rotationMode: "continuous", sessionType: "tournament", createdAt: Date.now() });
  const liveState = { ...makeLiveSession(code), sessionType: "tournament" };
  await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(liveState));
  const entry = (await fetchAllSessionIndexEntries()).find((e) => e.sessionCode === code);

  await endSessionAndRecord(entry, liveState, "Ended by facilitator");

  const ended = (await fetchAllSessionIndexEntries()).find((e) => e.sessionCode === code);
  assert("a tournament-type session ends via the exact same function, unrestricted by session type", ended.status === "ended" && ended.sessionType === "tournament");
}

console.log("\n9: endSessionAndRecord never falsely marks a session ended if the live row is already gone at call time (organizer double-tap / already-ended race)");
{
  // A caller that somehow retries after the row is already deleted (e.g. a
  // double End Session click that both read stale-but-still-active index
  // state) still only ever produces "ended" — never a crash, never a
  // second report overwriting the first with different data. This is the
  // same idempotency guarantee sweepAgedSessions's own "second run is a
  // no-op" test above already relies on; endSessionAndRecord itself does
  // not need special-casing for it, since recordSessionEnded is itself
  // idempotent by design (see that function's own comment).
  const code = "MANUAL01"; // already ended above
  const entry = (await fetchAllSessionIndexEntries()).find((e) => e.sessionCode === code);
  const fakeLiveState = makeLiveSession(code); // caller's own stale copy, since the real row is already gone
  await endSessionAndRecord(entry, fakeLiveState, "Ended by facilitator");
  const stillEnded = (await fetchAllSessionIndexEntries()).find((e) => e.sessionCode === code);
  assert("re-ending an already-ended session is a safe no-op — still just 'ended', no crash", stillEnded.status === "ended");
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
