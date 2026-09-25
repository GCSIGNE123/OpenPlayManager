// Adaptive Ranking Rotation — STRICT fixed-partner tests.
// A mutually fixed pair (A.partnerId === B && B.partnerId === A) is a hard
// teaming constraint whenever both are eligible and waiting: it overrides the
// Points neighbourhood, the recent-partner ban, partner diversity and skill
// balance between the two, and mid-session changes dissolve any affected
// UNLOCKED / UNHELD upcoming matchup so the next regeneration honors it.
// Existing rotation modes are unchanged (setFixedPartner's new behavior is
// opt-in).
//
// Usage: node scripts/verify-ranking-fixed-partners.mjs
import fs from "node:fs";

globalThis.window = { storage: {} };
const { AdaptiveRankingRotationEngine, REASONS } = await import("../src/engines/AdaptiveRankingRotationEngine.js");
const { setFixedPartner, clearFixedPartner, dissolveUpcomingForFixedPair } = await import("../src/lib/queueManagement.js");
const { refreshNextMatchups, getRotationEngine } = await import("../src/lib/utils.js");
const { emptyCourt } = await import("../src/lib/constants.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

const NOW = 1_800_000_000_000;
const MIN = 60000;
const engine = new AdaptiveRankingRotationEngine();
function mk(id, { wait = 20, games = 3, pts = 1000, skill = "intermediate", ...rest } = {}) {
  return { id, name: id, skill, games, rankingPoints: pts, rankingSource: "rated", lastMatchEndAt: NOW - wait * MIN, checkedInAt: NOW - 200 * MIN, partnerCounts: {}, recentPartnerIds: [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [], partnerId: null, ...rest };
}
const mapOf = (arr) => Object.fromEntries(arr.map((p) => [p.id, p]));
const idsOf = (m) => [...m.teamA, ...m.teamB];
const teammates = (m, x, y) => [m.teamA, m.teamB].some((t) => t.includes(x) && t.includes(y));
const inMatch = (m, id) => idsOf(m).includes(id);
const link = (players, a, b) => ({ ...players, [a]: { ...players[a], partnerId: b }, [b]: { ...players[b], partnerId: a } });

// session state as the app holds it: waiting players live in queueIds; players on
// a live court are NOT in queueIds
function session(playersArr, { live = [], nextMatchups = [], mode = "adaptiveRanking" } = {}) {
  const players = mapOf(playersArr);
  const courts = [emptyCourt(1), emptyCourt(2)];
  if (live.length) courts[0] = { ...courts[0], status: "live", teamA: live.slice(0, 2), teamB: live.slice(2, 4) };
  const busy = new Set(live);
  return { rotationMode: mode, players, queueIds: playersArr.map((p) => p.id).filter((id) => !busy.has(id)), nextMatchups, courts, recentMatchups: [] };
}
const regen = (state, cap = 3) => ({ ...state, nextMatchups: refreshNextMatchups(state.queueIds, state.players, state.nextMatchups, engine, null, cap, null, state.recentMatchups) });
const gen = (arr, extra = {}) => engine.generateMatchups({ waitingIds: arr.map((p) => p.id), players: mapOf(arr), existingMatchups: [], now: NOW, ...extra });

const eight = (over = {}) => ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((id, i) => mk(id, { wait: 30 - i, ...(over[id] || {}) }));

console.log("\n1. Fixed pair before the session starts — strict, outside the Points window, mismatched skills");
{
  const arr = eight({ p0: { pts: 800, skill: "beginner", partnerId: "p1" }, p1: { pts: 2000, skill: "intermediate", partnerId: "p0" } });
  const ms = gen(arr, { maxMatchups: 2 });
  const m = ms.find((x) => inMatch(x, "p0"));
  assert("the pair (800 vs 2000 Points, Beginner + Intermediate) are teammates", m && teammates(m, "p0", "p1"));
  assert("FIXED_PARTNER identifies it, and the neighbourhood is honestly POINTS_WIDENED", m.reasons.includes(REASONS.FIXED_PARTNER) && m.reasons.includes(REASONS.POINTS_WIDENED));
  assert("the OTHER matchup carries no FIXED_PARTNER code", ms.filter((x) => x !== m).every((x) => !x.reasons.includes(REASONS.FIXED_PARTNER)));
  assert("fixed partners are exempt from the recent-partner ban", (() => {
    const r = eight({ p0: { partnerId: "p1", recentPartnerIds: ["p1"], partnerCounts: { p1: 5 } }, p1: { partnerId: "p0", recentPartnerIds: ["p0"], partnerCounts: { p0: 5 } } });
    const mm = gen(r, { maxMatchups: 2 }).find((x) => inMatch(x, "p0"));
    return mm && teammates(mm, "p0", "p1") && !mm.reasons.includes(REASONS.FORCED_REPEAT_PARTNER);
  })());
  const bb = [mk("f1", { wait: 30, skill: "beginner", partnerId: "f2", pts: 1000 }), mk("f2", { wait: 29, skill: "beginner", partnerId: "f1", pts: 1000 }), mk("x1", { wait: 28 }), mk("x2", { wait: 27 })];
  const bm = gen(bb)[0];
  assert("skill balance never splits the pair: two Beginners stay teammates (BB vs II) even though B+I vs B+I is preferred otherwise", teammates(bm, "f1", "f2"));
}

console.log("\n2. Set mid-session while both are waiting");
{
  let s = regen(session(eight()));
  s = { ...s, nextMatchups: [] }; // nothing queued yet for them
  const next = setFixedPartner(s, "p3", "p6", { dissolveUpcoming: true });
  assert("mutual link created on both records", next.players.p3.partnerId === "p6" && next.players.p6.partnerId === "p3");
  assert("nothing to dissolve when neither is in an upcoming matchup (same nextMatchups)", next.nextMatchups === s.nextMatchups);
  const r = regen(next);
  const m = r.nextMatchups.find((x) => inMatch(x, "p3"));
  assert("their next generated matchup keeps them together", m && teammates(m, "p3", "p6"));
}

console.log("\n3. Set while ONE of them is in an unplayed upcoming matchup");
{
  const base = session(eight());
  const withQueue = regen(base, 2);
  const m0 = withQueue.nextMatchups.find((x) => inMatch(x, "p0"));
  const other = withQueue.nextMatchups.find((x) => x !== m0);
  const free = "p7"; // pick a partner that is NOT in m0
  const partner = idsOf(m0).includes(free) ? "p6" : free;
  const partnerInOther = other && inMatch(other, partner);
  const next = setFixedPartner(withQueue, "p0", partner, { dissolveUpcoming: true });
  assert("every upcoming matchup that touched exactly one of the pair is dissolved", next.nextMatchups.every((x) => !(inMatch(x, "p0") !== inMatch(x, partner))));
  assert("the affected players are back in the waiting pool (still in queueIds)", next.queueIds.includes("p0") && next.queueIds.includes(partner));
  assert("an unrelated upcoming matchup survives untouched (same object)", withQueue.nextMatchups.filter((x) => !inMatch(x, "p0") && !inMatch(x, partner)).every((x) => next.nextMatchups.includes(x)));
  void partnerInOther;
  const r = regen(next);
  const m = r.nextMatchups.find((x) => inMatch(x, "p0"));
  assert("the next regeneration puts them together", m && teammates(m, "p0", partner));
}

console.log("\n4. Set while both are in SEPARATE upcoming matchups");
{
  const base = regen(session(eight()), 2);
  const [mA, mB] = base.nextMatchups;
  const a = mA.teamA[0], b = mB.teamA[0];
  const next = setFixedPartner(base, a, b, { dissolveUpcoming: true });
  assert("both separate reservations are dissolved (no stale reservation can survive)", next.nextMatchups.length === 0);
  const r = regen(next);
  assert("the pair plays together after regeneration", (() => { const m = r.nextMatchups.find((x) => inMatch(x, a)); return m && teammates(m, a, b); })());
  const noOld = r.nextMatchups.every((x) => !(inMatch(x, a) && !inMatch(x, b)) && !(inMatch(x, b) && !inMatch(x, a)));
  assert("no upcoming matchup contains only one of them", noOld);
}

console.log("\n5. Set while one player is LIVE on a court");
{
  const arr = eight();
  const live = ["p0", "p1", "p2", "p3"]; // court 1 is live with these four
  const s0 = session(arr, { live });
  const q = regen(s0, 1);
  const upcoming = q.nextMatchups[0];
  const waiter = idsOf(upcoming)[0];
  const next = setFixedPartner(q, "p0", waiter, { dissolveUpcoming: true });
  assert("the LIVE court is not interrupted (courts untouched, live players not in the queue)", next.courts === q.courts && next.courts[0].status === "live" && !next.queueIds.includes("p0"));
  assert("the waiting partner's unplayed matchup (which lacked p0) is dissolved", !next.nextMatchups.some((x) => inMatch(x, waiter)));
  const mid = regen(next);
  assert("while p0 is live the waiter is not blocked: he still gets matched normally", mid.nextMatchups.some((x) => inMatch(x, waiter)) && mid.nextMatchups.every((x) => !inMatch(x, "p0")));
  // p0's match ends -> back in the queue
  const back = regen({ ...next, nextMatchups: [], queueIds: [...next.queueIds, "p0"], courts: [emptyCourt(1), emptyCourt(2)] });
  const m = back.nextMatchups.find((x) => inMatch(x, "p0"));
  assert("once p0 returns to the queue the pair is honored", m && teammates(m, "p0", waiter));
}

console.log("\n6. Replacing an existing fixed partner");
{
  let s = session(eight());
  s = setFixedPartner(s, "p0", "p1");
  s = regen(s, 2);
  const m01 = s.nextMatchups.find((x) => inMatch(x, "p0"));
  assert("(precondition) the first pair was honored", m01 && teammates(m01, "p0", "p1"));
  const next = setFixedPartner(s, "p0", "p2", { dissolveUpcoming: true });
  assert("old links are cleared on BOTH sides and the new pair is mutual", next.players.p1.partnerId === null && next.players.p0.partnerId === "p2" && next.players.p2.partnerId === "p0");
  assert("the matchup that had the OLD pair together is dissolved (it no longer satisfies the new link)", !next.nextMatchups.some((x) => inMatch(x, "p0") && !teammates(x, "p0", "p2")));
  const r = regen(next);
  const m = r.nextMatchups.find((x) => inMatch(x, "p0"));
  assert("the new pair plays together; the released player is free", m && teammates(m, "p0", "p2"));
}

console.log("\n7. Locked / held upcoming matchups are organizer decisions and are never dissolved");
{
  const base = regen(session(eight()), 2);
  const [mA] = base.nextMatchups;
  const locked = { ...base, nextMatchups: base.nextMatchups.map((x) => (x === mA ? { ...x, locked: true } : x)) };
  const other = idsOf(base.nextMatchups[1])[0];
  const next = setFixedPartner(locked, mA.teamA[0], other, { dissolveUpcoming: true });
  assert("a LOCKED matchup survives", next.nextMatchups.some((x) => x.id === mA.id));
  const held = { ...base, nextMatchups: base.nextMatchups.map((x) => (x === mA ? { ...x, held: true } : x)) };
  assert("a HELD matchup survives", setFixedPartner(held, mA.teamA[0], other, { dissolveUpcoming: true }).nextMatchups.some((x) => x.id === mA.id));
  const together = { ...base, nextMatchups: [{ id: "t", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }] };
  assert("a matchup that ALREADY has them as teammates is kept", setFixedPartner(together, "p0", "p1", { dissolveUpcoming: true }).nextMatchups.length === 1);
  const opposite = { ...base, nextMatchups: [{ id: "o", teamA: ["p0", "p2"], teamB: ["p1", "p3"] }] };
  assert("a matchup with them on OPPOSITE teams is dissolved", setFixedPartner(opposite, "p0", "p1", { dissolveUpcoming: true }).nextMatchups.length === 0);
}

console.log("\n8. Clearing a fixed pair restores normal matchmaking");
{
  const rec = { p0: { recentPartnerIds: ["p1"], partnerCounts: { p1: 4 } }, p1: { recentPartnerIds: ["p0"], partnerCounts: { p0: 4 } } };
  let s = session(eight(rec));
  s = setFixedPartner(s, "p0", "p1");
  const fixedM = gen(Object.values(s.players), { maxMatchups: 2 }).find((x) => inMatch(x, "p0"));
  assert("while fixed, they are teammates despite being recent partners", teammates(fixedM, "p0", "p1"));
  const cleared = clearFixedPartner(s, "p0");
  assert("both links are cleared", cleared.players.p0.partnerId === null && cleared.players.p1.partnerId === null);
  const normal = gen(Object.values(cleared.players), { maxMatchups: 2 }).find((x) => inMatch(x, "p0"));
  assert("after clearing, the normal recent-partner ban applies again (not teammates)", normal && !teammates(normal, "p0", "p1") && !normal.reasons.includes(REASONS.FIXED_PARTNER));
}

console.log("\n9. No mutation of unrelated players / other modes unchanged");
{
  const s = session(eight());
  const next = setFixedPartner(s, "p3", "p6", { dissolveUpcoming: true });
  const untouched = Object.keys(s.players).filter((id) => id !== "p3" && id !== "p6");
  assert("unrelated player records are the very same objects", untouched.every((id) => next.players[id] === s.players[id]));
  assert("the input state is not mutated", s.players.p3.partnerId === null && s.players.p6.partnerId === null);
  const q = regen(session(eight()), 2);
  const defaultCall = setFixedPartner(q, q.nextMatchups[0].teamA[0], q.nextMatchups[1].teamA[0]);
  assert("DEFAULT setFixedPartner (every other rotation mode) does NOT touch nextMatchups — existing behavior preserved", defaultCall.nextMatchups === q.nextMatchups);
  assert("dissolveUpcomingForFixedPair is a no-op (same state) when nothing is affected", dissolveUpcomingForFixedPair(q, "nobody1", "nobody2") === q);
  const comp = fs.readFileSync(new URL("../src/PickleballOpenPlay.jsx", import.meta.url), "utf8");
  assert("the app passes dissolveUpcoming ONLY for the Points-based modes (adaptiveRanking, pointsAdaptive)", /dissolveUpcoming: RANKING_POINTS_MODES\.includes\(state\.rotationMode\)/.test(comp));
  assert("adaptiveSkill/continuous/etc. engines are still their own classes", getRotationEngine("adaptiveSkill").constructor.name === "AdaptiveSkillRotationEngine" && getRotationEngine("continuous").constructor.name === "BalancedRotationEngine");
}

console.log("\n10. Rest, held/ineligible partners, and multiple pairs");
{
  const rested = eight({ p0: { partnerId: "p1", wait: 20 }, p1: { partnerId: "p0", wait: 2 } }); // p1 just finished
  const ms = gen(rested, { maxMatchups: 2 });
  assert("a pair moves as a unit: p0 is NOT teamed with someone else while p1 is resting", ms.every((m) => !inMatch(m, "p0") || teammates(m, "p0", "p1")) && ms.some((m) => !inMatch(m, "p0")));
  const heldPartner = eight({ p0: { partnerId: "p1", wait: 30 } });
  heldPartner[1] = { ...heldPartner[1], partnerId: "p0" };
  const players = mapOf(heldPartner); players.p1 = { ...players.p1, held: true };
  const waitingIds = Object.keys(players).filter((id) => !players[id].held);
  const held = engine.generateMatchups({ waitingIds, players, existingMatchups: [], now: NOW, maxMatchups: 2 });
  assert("a HELD (ineligible) partner does not block the other player (7 waiting -> 1 matchup, p0 plays)", held.length === 1 && held.some((m) => inMatch(m, "p0")) && held.every((m) => !inMatch(m, "p1")));
  const two = gen(eight({ p0: { partnerId: "p1" }, p1: { partnerId: "p0" }, p2: { partnerId: "p3" }, p3: { partnerId: "p2" } }), { maxMatchups: 2 });
  const first = two.find((m) => inMatch(m, "p0"));
  assert("two fixed pairs can share a matchup (p0+p1 vs p2+p3), both honored", first && teammates(first, "p0", "p1") && teammates(first, "p2", "p3") && first.reasons.includes(REASONS.FIXED_PARTNER));
}

console.log("\n11. The invariant, property-tested: a fixed pair is never intentionally split");
{
  let s = 4242; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  let violations = 0, checked = 0, courtsShort = 0;
  for (let k = 0; k < 250; k++) {
    const n = 8 + Math.floor(rnd() * 20);
    const arr = Array.from({ length: n }, (_, i) => mk(`q${i}`, { wait: 6 + Math.floor(rnd() * 30), games: Math.floor(rnd() * 5), pts: 700 + Math.floor(rnd() * 800), skill: rnd() < 0.35 ? "beginner" : "intermediate" }));
    const pairs = [];
    const used = new Set();
    const npairs = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < npairs; j++) {
      const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n);
      if (a === b || used.has(a) || used.has(b)) continue;
      used.add(a); used.add(b); pairs.push([`q${a}`, `q${b}`]);
      arr[a] = { ...arr[a], partnerId: `q${b}` }; arr[b] = { ...arr[b], partnerId: `q${a}` };
    }
    const ms = gen(arr, { maxMatchups: 6 });
    if (ms.length < Math.min(6, Math.floor(n / 4) - 1)) courtsShort++;
    for (const [a, b] of pairs) {
      checked++;
      const ma = ms.find((m) => inMatch(m, a)), mb = ms.find((m) => inMatch(m, b));
      if ((ma || mb) && !(ma && mb && ma === mb && teammates(ma, a, b))) violations++;
    }
  }
  assert(`${checked} fixed pairs across 250 random rooms: 0 split (${violations} violations)`, violations === 0 && checked > 200);
  assert("fixed pairs did not stall court filling (rooms produced the expected number of matchups)", courtsShort === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
