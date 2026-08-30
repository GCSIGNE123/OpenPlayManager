// 24-Hour Inactivity Auto-Close — automated, headless coverage. Calls the
// real functions directly (openPlaySessionLifecycle.js's isSessionCurrent/
// expirationReason, sessionIndexModel.js's sweepAgedSessions) against a
// fake in-memory window.storage — same convention as
// scripts/verify-all-sessions.mjs, which this extends rather than
// duplicates.
//
// Usage: node scripts/verify-session-inactivity-auto-close.mjs
import { readFileSync } from "node:fs";
import { SESSION_AUTO_END_AGE_MS, SESSION_INACTIVITY_AGE_MS, STORAGE_PREFIX, SESSION_REPORT_PREFIX } from "../src/lib/constants.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

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

const { isSessionCurrent, expirationReason } = await import("../src/lib/openPlaySessionLifecycle.js");
const { recordSessionCreated, fetchAllSessionIndexEntries, sweepAgedSessions } = await import("../src/lib/sessionIndexModel.js");

function makeLiveSession(overrides = {}) {
  return {
    venue: "Test Venue",
    rotationMode: "continuous",
    sessionType: "openPlay",
    sessionStartedAt: Date.now(),
    courts: [{ number: 1, status: "open" }],
    players: {},
    queueIds: [],
    nextMatchups: [],
    matchHistory: [],
    queueActivityLog: [],
    skillChangeLog: [],
    ...overrides,
  };
}

// ---- Pure predicate: isSessionCurrent / expirationReason -----------------

console.log("\nisSessionCurrent / expirationReason — 24-hour inactivity rule");
{
  const now = Date.now();

  const recentActivity = makeLiveSession({ sessionStartedAt: now - 60 * 60 * 1000, lastActivityAt: now - 60 * 60 * 1000 });
  assert("recent activity -> current", isSessionCurrent(recentActivity, now));
  assert("recent activity -> no expiration reason", expirationReason(recentActivity, now) === null);

  const justUnder24h = makeLiveSession({ sessionStartedAt: now - 25 * 60 * 60 * 1000, lastActivityAt: now - (SESSION_INACTIVITY_AGE_MS - 1000) });
  assert("just under 24h inactive -> still current", isSessionCurrent(justUnder24h, now));

  const exactly24h = makeLiveSession({ sessionStartedAt: now - 25 * 60 * 60 * 1000, lastActivityAt: now - SESSION_INACTIVITY_AGE_MS });
  assert("exactly 24h inactive -> expires (strict less-than)", !isSessionCurrent(exactly24h, now));
  assert("exactly 24h inactive -> reason is 'inactivity'", expirationReason(exactly24h, now) === "inactivity");

  const over24h = makeLiveSession({ sessionStartedAt: now - 30 * 60 * 60 * 1000, lastActivityAt: now - (SESSION_INACTIVITY_AGE_MS + 60 * 60 * 1000) });
  assert("over 24h inactive -> expires", !isSessionCurrent(over24h, now));

  // Player-specific fields never rescue a session past the inactivity gate —
  // the lifecycle check runs on lastActivityAt alone, before/independent of
  // any inspection of players/nextMatchups/courts.
  const checkedInButInactive = makeLiveSession({
    sessionStartedAt: now - 30 * 60 * 60 * 1000,
    lastActivityAt: now - (SESSION_INACTIVITY_AGE_MS + 1000),
    players: { p1: { id: "p1", checkedIn: true } },
  });
  assert("checked-in players do NOT prevent expiration", !isSessionCurrent(checkedInButInactive, now));

  const staleNextMatchups = makeLiveSession({
    sessionStartedAt: now - 30 * 60 * 60 * 1000,
    lastActivityAt: now - (SESSION_INACTIVITY_AGE_MS + 1000),
    nextMatchups: [{ id: "m1", teamA: ["p1"], teamB: ["p2"] }],
  });
  assert("stale nextMatchups do NOT prevent expiration", !isSessionCurrent(staleNextMatchups, now));

  const liveLookingCourt = makeLiveSession({
    sessionStartedAt: now - 30 * 60 * 60 * 1000,
    lastActivityAt: now - (SESSION_INACTIVITY_AGE_MS + 1000),
    courts: [{ number: 1, status: "live", teamA: ["p1"], teamB: ["p2"] }],
  });
  assert("a court still marked 'live' does NOT prevent expiration", !isSessionCurrent(liveLookingCourt, now));

  // A session record saved before lastActivityAt existed falls back to
  // sessionStartedAt — never guessed "fresh".
  const noActivityField = makeLiveSession({ sessionStartedAt: now - (SESSION_INACTIVITY_AGE_MS + 1000) });
  delete noActivityField.lastActivityAt;
  assert("missing lastActivityAt falls back to sessionStartedAt, not guessed fresh", !isSessionCurrent(noActivityField, now));
}

console.log("\nisSessionCurrent / expirationReason — 3-day maximum age rule (unchanged, coexists)");
{
  const now = Date.now();

  const underThreeDays = makeLiveSession({ sessionStartedAt: now - (SESSION_AUTO_END_AGE_MS - 1000), lastActivityAt: now - 60 * 60 * 1000 });
  assert("under 3 days + recent activity -> remains active", isSessionCurrent(underThreeDays, now));

  const exactlyThreeDays = makeLiveSession({ sessionStartedAt: now - SESSION_AUTO_END_AGE_MS, lastActivityAt: now - 60 * 1000 });
  assert("exactly 3 days old (even with fresh activity) -> expires by AGE", !isSessionCurrent(exactlyThreeDays, now));
  assert("exactly 3 days old -> reason is 'age', not 'inactivity'", expirationReason(exactlyThreeDays, now) === "age");

  const oldWithRecentActivity = makeLiveSession({ sessionStartedAt: now - 4 * 24 * 60 * 60 * 1000, lastActivityAt: now - 60 * 1000 });
  assert("old session (4 days) with recent activity STILL expires at the 3-day ceiling", !isSessionCurrent(oldWithRecentActivity, now));
  assert("that case's reason is 'age' — the 3-day rule applies regardless of how recent activity was", expirationReason(oldWithRecentActivity, now) === "age");
}

// ---- sweepAgedSessions — full end sequence, both rules, idempotency ------

console.log("\nsweepAgedSessions — closes a session inactive 24h+ even though it's well under 3 days old");
{
  const code = "INACT01";
  const startedAt = Date.now() - 30 * 60 * 60 * 1000; // 30h old — comfortably under the 3-day ceiling
  const lastActivityAt = Date.now() - (SESSION_INACTIVITY_AGE_MS + 60 * 60 * 1000); // last real activity 25h ago
  const players = { p1: { id: "p1", name: "Juan", games: 1, wins: 1, losses: 0, checkedIn: true, paymentStatus: "paid", paymentMethod: "cash" } };
  await recordSessionCreated({ sessionCode: code, venue: "Inactive Session", rotationMode: "continuous", sessionType: "openPlay", createdAt: startedAt });
  await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(makeLiveSession({ sessionStartedAt: startedAt, lastActivityAt, players })));

  const ended = await sweepAgedSessions();
  assert("the 24h-inactive (but <3-day) session WAS auto-ended", ended.includes(code));

  const entries = await fetchAllSessionIndexEntries();
  const entry = entries.find((e) => e.sessionCode === code);
  assert("its index entry is now ended", entry.status === "ended");
  assert("its end reason is the 24h inactivity string", entry.endReason === "Auto-ended — inactive 24h");
  assert("it has a real endedAt timestamp", typeof entry.endedAt === "number" && entry.endedAt > 0);

  let liveGone = false;
  try { await window.storage.get(`${STORAGE_PREFIX}${code}`); } catch (e) { liveGone = true; }
  assert("its live session record was deleted", liveGone);

  const { keys } = await window.storage.list(SESSION_REPORT_PREFIX);
  let foundReport = null;
  for (const key of keys) {
    const res = await window.storage.get(key);
    const parsed = JSON.parse(res.value);
    if (parsed.sessionCode === code) foundReport = parsed;
  }
  assert("a final report was saved before the live record was deleted", !!foundReport);
}

console.log("\nsweepAgedSessions — a session with recent meaningful activity is left completely untouched");
{
  const code = "ACTIVE01";
  const startedAt = Date.now() - 2 * 60 * 60 * 1000;
  await recordSessionCreated({ sessionCode: code, venue: "Active Session", rotationMode: "continuous", sessionType: "openPlay", createdAt: startedAt });
  await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(makeLiveSession({ sessionStartedAt: startedAt, lastActivityAt: Date.now() - 5 * 60 * 1000 })));

  const ended = await sweepAgedSessions();
  assert("the actively-used session was NOT auto-ended", !ended.includes(code));
  const stillLive = await window.storage.get(`${STORAGE_PREFIX}${code}`);
  assert("its live record still exists", !!stillLive.value);
}

console.log("\nsweepAgedSessions — multiple sessions are evaluated independently");
{
  const idle = "MULTI-IDLE";
  const busy = "MULTI-BUSY";
  const startedAt = Date.now() - 26 * 60 * 60 * 1000;
  await recordSessionCreated({ sessionCode: idle, venue: "Idle", rotationMode: "continuous", sessionType: "openPlay", createdAt: startedAt });
  await window.storage.set(`${STORAGE_PREFIX}${idle}`, JSON.stringify(makeLiveSession({ sessionStartedAt: startedAt, lastActivityAt: Date.now() - (SESSION_INACTIVITY_AGE_MS + 1000) })));
  await recordSessionCreated({ sessionCode: busy, venue: "Busy", rotationMode: "continuous", sessionType: "openPlay", createdAt: startedAt });
  await window.storage.set(`${STORAGE_PREFIX}${busy}`, JSON.stringify(makeLiveSession({ sessionStartedAt: startedAt, lastActivityAt: Date.now() - 60 * 1000 })));

  const ended = await sweepAgedSessions();
  assert("the idle session was ended", ended.includes(idle));
  assert("the busy session sharing the same run was NOT ended", !ended.includes(busy));
}

console.log("\nsweepAgedSessions — repeated runs are idempotent; an already-ended session is skipped, not reprocessed");
{
  const before = await fetchAllSessionIndexEntries();
  const endedCount = before.filter((e) => e.status === "ended").length;
  const secondRun = await sweepAgedSessions();
  const after = await fetchAllSessionIndexEntries();
  assert("no additional sessions were ended on a repeat sweep", after.filter((e) => e.status === "ended").length === endedCount);
  assert("the repeat sweep itself reports nothing newly ended", secondRun.length === 0);
}

console.log("\nsweepAgedSessions — race safety: activity recorded before the sweep reads a session is correctly honored");
{
  // Simulates "a score is being submitted" landing just before the sweep
  // runs: the live record's lastActivityAt already reflects that write by
  // the time sweepAgedSessions reads it (there is no separate stale cache
  // in this implementation — every read is a fresh window.storage.get),
  // so the session is correctly left alone even though it was on the edge
  // of the 24h window moments earlier.
  const code = "RACE01";
  const startedAt = Date.now() - 25 * 60 * 60 * 1000;
  await recordSessionCreated({ sessionCode: code, venue: "Race", rotationMode: "continuous", sessionType: "openPlay", createdAt: startedAt });
  // last activity is NOW (a save() just landed) — well inside the 24h window
  await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(makeLiveSession({ sessionStartedAt: startedAt, lastActivityAt: Date.now() })));
  const ended = await sweepAgedSessions();
  assert("a session whose activity landed right before the sweep read it is NOT incorrectly ended", !ended.includes(code));
}

// ---- Structural regression: the held-reminder timer must opt OUT --------
// The 15s held-player-reminder tick in PickleballOpenPlay.jsx is the one
// save() call site that must NEVER count as meaningful activity (it fires
// purely from wall-clock time elapsing — see the approved design). This is
// wiring inside a React component, not a pure function, so it can't be
// exercised the way the lifecycle predicate above is; this is a lightweight
// structural guard against the exact regression of that opt-out silently
// being removed, not a substitute for the logic tests above.
console.log("\nheld-player-reminder timer — structural regression guard (isActivity: false wiring)");
{
  const src = readFileSync(new URL("../src/PickleballOpenPlay.jsx", import.meta.url), "utf8");
  const tickBlock = src.slice(src.indexOf("const tick = () => {"), src.indexOf("const interval = setInterval(tick, 15000);"));
  assert("the 15s reminder tick's save() call passes { isActivity: false }", /save\(next,\s*\{\s*isActivity:\s*false\s*\}\)/.test(tickBlock));
  assert("save()'s own signature defaults isActivity to true (every other call site is unaffected)", /async \(next, \{ isActivity = true \} = \{\}\) => \{/.test(src));
}

console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
