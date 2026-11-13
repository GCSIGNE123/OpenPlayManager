// Organizer Alerts (notification bell) — automated, headless coverage of
// lib/alerts.js's four alerts, their stable ids, the organizer-set
// exemptions, plus source-level wiring checks for AlertBell.jsx in the
// Scorer tab. See FEATURES.md ("Organizer Alerts").
//
// Usage: node scripts/verify-organizer-alerts.mjs
import fs from "node:fs";
import { computeAlerts, unseenAlerts, waitMinutesFor, ALERT_LONG_WAIT_MINUTES, ALERT_GAMES_BEHIND, ALERT_KINDS } from "../src/lib/alerts.js";
import { defaultState, emptyCourt } from "../src/lib/constants.js";

let pass = 0;
let fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
    console.log(`  ok ${desc}`);
  } else {
    fail++;
    console.log(`  FAIL: ${desc}`);
  }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const NOW = 1_800_000_000_000;
const M = 60000;
const mk = (id, name, games, extra = {}) => ({ id, name, skill: "beginner", checkedIn: true, status: "ACTIVE", games, wins: 0, losses: games, streak: 0, lossStreak: 0, checkedInAt: NOW - 5 * M, lastMatchEndAt: games ? NOW - 5 * M : undefined, partnerId: null, ...extra });
const court = (number, status, teamA = [], teamB = []) => ({ ...emptyCourt(number), status, teamA, teamB });
const base = (players, over = {}) => ({ ...defaultState, rotationMode: "adaptiveSkill", players, queueIds: Object.keys(players), courts: [court(1, "open")], nextMatchups: [], matchHistory: [], ...over });
const kinds = (alerts) => alerts.map((a) => a.kind);
const byKind = (alerts, k) => alerts.filter((a) => a.kind === k);

console.log("\n0. constants");
assert("15 minutes, 2 games", ALERT_LONG_WAIT_MINUTES === 15 && ALERT_GAMES_BEHIND === 2);
assert("the four organizer alerts + Roulette's repeat alert, with labels + severities", Object.keys(ALERT_KINDS).join() === "longWait,repeatFoursome,pairSplit,gamesBehind,rouletteRepeat" && Object.values(ALERT_KINDS).every((k) => k.label && ["warn", "info"].includes(k.severity)));
assert("waitMinutesFor uses lastMatchEndAt, then checkedInAt, else 0", waitMinutesFor({ lastMatchEndAt: NOW - 17 * M, checkedInAt: NOW - 40 * M }, NOW) === 17 && waitMinutesFor({ checkedInAt: NOW - 16 * M }, NOW) === 16 && waitMinutesFor({}, NOW) === 0);

console.log("\n1. long wait (15+ min)");
{
  const players = { a: mk("a", "Guil", 2, { lastMatchEndAt: NOW - 16 * M }), b: mk("b", "Anjo", 2, { lastMatchEndAt: NOW - 14 * M }), c: mk("c", "Newbie", 0, { checkedInAt: NOW - 20 * M, lastMatchEndAt: undefined }), d: mk("d", "Held", 2, { held: true, lastMatchEndAt: NOW - 30 * M }) };
  const alerts = computeAlerts(base(players), NOW);
  const lw = byKind(alerts, "longWait");
  assert("Guil (16 min) and Newbie (checked in 20 min ago, never played) alerted; Anjo (14 min) not", lw.map((a) => a.playerIds[0]).sort().join() === "a,c");
  assert("held player is not 'waiting' — no alert", !lw.some((a) => a.playerIds[0] === "d"));
  assert("title says the minutes; id is stable per player", lw.find((a) => a.playerIds[0] === "a").title === "Guil has waited 16 min" && lw.find((a) => a.playerIds[0] === "a").id === "longWait:a");
  const later = computeAlerts(base(players), NOW + 3 * M);
  assert("same id three minutes later (no re-ring), minutes updated", byKind(later, "longWait").find((a) => a.playerIds[0] === "a").id === "longWait:a" && byKind(later, "longWait").find((a) => a.playerIds[0] === "a").minutes === 19);
  const queued = base(players, { nextMatchups: [{ id: "m1", teamA: ["a", "b"], teamB: ["c", "d"] }] });
  const q = byKind(computeAlerts(queued, NOW), "longWait").find((a) => a.playerIds[0] === "a");
  assert("a long-waiter already in an upcoming matchup is still alerted, with the dispatch hint", q && /upcoming matchup/.test(q.detail));
  const onCourt = base(players, { courts: [court(1, "live", ["a", "b"], ["c", "d"])] });
  assert("players on court are never 'waiting'", byKind(computeAlerts(onCourt, NOW), "longWait").length === 0);
  const out = base({ ...players, a: { ...players.a, status: "CHECKED_OUT" } });
  assert("checked-out players are ignored", !byKind(computeAlerts(out, NOW), "longWait").some((a) => a.playerIds[0] === "a"));
}

console.log("\n2. same four queued again");
{
  const players = { a: mk("a", "A", 1), b: mk("b", "B", 1), c: mk("c", "C", 1), d: mk("d", "D", 1), e: mk("e", "E", 1) };
  const history = [{ round: 3, court: 1, teamA: ["a", "b"], teamB: ["c", "d"], winner: "A", endedAt: NOW - 10 * M }];
  const same = base(players, { matchHistory: history, nextMatchups: [{ id: "m1", teamA: ["a", "c"], teamB: ["b", "d"] }] });
  const r = byKind(computeAlerts(same, NOW), "repeatFoursome");
  assert("same four (different split) queued again -> alert naming them, with the round", r.length === 1 && /A, C, B, D/.test(r[0].title) && /round 3/.test(r[0].detail) && r[0].id === "repeatFoursome:m1");
  assert("severity info (a nudge, not a problem)", r[0].severity === "info");
  const different = base(players, { matchHistory: history, nextMatchups: [{ id: "m1", teamA: ["a", "b"], teamB: ["c", "e"] }] });
  assert("three of the four -> no alert", byKind(computeAlerts(different, NOW), "repeatFoursome").length === 0);
  const locked = base(players, { matchHistory: history, nextMatchups: [{ id: "m1", teamA: ["a", "b"], teamB: ["c", "d"], locked: true }] });
  assert("organizer-locked matchup is exempt (manually set)", byKind(computeAlerts(locked, NOW), "repeatFoursome").length === 0);
  const held = base(players, { matchHistory: history, nextMatchups: [{ id: "m1", teamA: ["a", "b"], teamB: ["c", "d"], held: true }] });
  assert("held matchup is exempt too", byKind(computeAlerts(held, NOW), "repeatFoursome").length === 0);
  const twice = base(players, { matchHistory: [...history, { ...history[0], round: 5 }], nextMatchups: [{ id: "m1", teamA: ["a", "b"], teamB: ["c", "d"] }] });
  assert("played together twice -> says so", /\(2 times\)/.test(byKind(computeAlerts(twice, NOW), "repeatFoursome")[0].detail));
}

console.log("\n3. fixed pair split in an upcoming matchup");
{
  const players = { a: mk("a", "Guil", 1, { partnerId: "b" }), b: mk("b", "Anjo", 1, { partnerId: "a" }), c: mk("c", "C", 1), d: mk("d", "D", 1), e: mk("e", "E", 1) };
  const together = base(players, { nextMatchups: [{ id: "m1", teamA: ["a", "b"], teamB: ["c", "d"] }] });
  assert("pair on the same team -> no alert", byKind(computeAlerts(together, NOW), "pairSplit").length === 0);
  const opposite = base(players, { nextMatchups: [{ id: "m1", teamA: ["a", "c"], teamB: ["b", "d"] }] });
  const o = byKind(computeAlerts(opposite, NOW), "pairSplit");
  assert("pair on opposite teams -> alert 'opposite teams'", o.length === 1 && /Guil & Anjo/.test(o[0].title) && /opposite teams/.test(o[0].detail) && o[0].id === "pairSplit:m1:a|b");
  const without = base(players, { nextMatchups: [{ id: "m1", teamA: ["a", "c"], teamB: ["d", "e"] }] });
  const w = byKind(computeAlerts(without, NOW), "pairSplit");
  assert("only one of the pair queued -> alert 'queued without'", w.length === 1 && /Guil is queued without Anjo/.test(w[0].detail));
  const neither = base(players, { nextMatchups: [{ id: "m1", teamA: ["c", "d"], teamB: ["e", "c"] }] });
  assert("neither queued -> nothing", byKind(computeAlerts(neither, NOW), "pairSplit").length === 0);
  const locked = base(players, { nextMatchups: [{ id: "m1", teamA: ["a", "c"], teamB: ["b", "d"], locked: true }] });
  assert("organizer-locked matchup is exempt", byKind(computeAlerts(locked, NOW), "pairSplit").length === 0);
  const cross = base({ ...players, b: { ...players.b, skill: "intermediate" } }, { nextMatchups: [{ id: "m1", teamA: ["a", "c"], teamB: ["d", "e"] }] });
  assert("a cross-division pair (can never be teamed in Skill Divisions) is not a queue alert", byKind(computeAlerts(cross, NOW), "pairSplit").length === 0);
  const crossContinuous = base({ ...players, b: { ...players.b, skill: "intermediate" } }, { rotationMode: "continuous", nextMatchups: [{ id: "m1", teamA: ["a", "c"], teamB: ["d", "e"] }] });
  assert("...but in Continuous Queue (cross-level pairs allowed) it is", byKind(computeAlerts(crossContinuous, NOW), "pairSplit").length === 1);
  const oneSided = base({ ...players, b: { ...players.b, partnerId: null } }, { nextMatchups: [{ id: "m1", teamA: ["a", "c"], teamB: ["d", "e"] }] });
  assert("a non-mutual partnerId is not a pair", byKind(computeAlerts(oneSided, NOW), "pairSplit").length === 0);
}

console.log("\n4. waiting player 2+ games behind someone on court / queued");
{
  const players = { w: mk("w", "Guil", 2), x: mk("x", "X", 3), p1: mk("p1", "Rina", 4), p2: mk("p2", "P2", 4), p3: mk("p3", "P3", 3), p4: mk("p4", "P4", 3), q: mk("q", "Q", 5) };
  const s = base(players, { courts: [court(1, "live", ["p1", "p2"], ["p3", "p4"])], nextMatchups: [{ id: "m1", teamA: ["q", "x"], teamB: ["w", "p1"] }] });
  // w is in an upcoming matchup -> UPCOMING, not pure waiting; make a pure waiter:
  const s2 = base(players, { courts: [court(1, "live", ["p1", "p2"], ["p3", "p4"])], nextMatchups: [{ id: "m1", teamA: ["q", "x"], teamB: ["p3", "p4"] }] });
  const g = byKind(computeAlerts(s2, NOW), "gamesBehind");
  assert("Guil (2 games, waiting) is 3 behind Q (5, queued) -> one alert naming the biggest gap", g.length === 1 && g[0].playerIds[0] === "w" && g[0].gap === 3 && /Guil is 3 games behind \(2 vs 5\)/.test(g[0].title) && /in an upcoming matchup/.test(g[0].detail));
  assert("id encodes player + their games (stable until they play)", g[0].id === "gamesBehind:w:2");
  const onlyCourt = base(players, { courts: [court(1, "live", ["p1", "p2"], ["p3", "p4"])] });
  const g2 = byKind(computeAlerts(onlyCourt, NOW), "gamesBehind");
  assert("against players on court: Guil 2 vs Rina 4 on Court 1 -> alert; X (3) is only 1 behind -> none; Q (5) waiting is not 'ahead'", g2.length === 1 && g2[0].playerIds.join() === "w,p1" && /on Court 1/.test(g2[0].detail) && !g2.some((a) => a.playerIds[0] === "x"));
  const upcomingWaiter = computeAlerts(s, NOW);
  assert("a player already in an upcoming matchup is not 'left behind'", !byKind(upcomingWaiter, "gamesBehind").some((a) => a.playerIds[0] === "w"));
  const even = base({ w: mk("w", "W", 3), p1: mk("p1", "P1", 4), p2: mk("p2", "P2", 4), p3: mk("p3", "P3", 4), p4: mk("p4", "P4", 4) }, { courts: [court(1, "live", ["p1", "p2"], ["p3", "p4"])] });
  assert("1 game behind -> nothing", byKind(computeAlerts(even, NOW), "gamesBehind").length === 0);
  const held = base({ ...players, w: { ...players.w, held: true } }, { courts: [court(1, "live", ["p1", "p2"], ["p3", "p4"])] });
  assert("a held player is not 'waiting'", !byKind(computeAlerts(held, NOW), "gamesBehind").some((a) => a.playerIds[0] === "w"));
}

console.log("\n5. ordering, ids, unseen");
{
  const players = { a: mk("a", "A", 0, { lastMatchEndAt: undefined, checkedInAt: NOW - 20 * M }), b: mk("b", "B", 1), c: mk("c", "C", 1), d: mk("d", "D", 1), e: mk("e", "E", 1), p1: mk("p1", "P1", 3), p2: mk("p2", "P2", 3), p3: mk("p3", "P3", 3), p4: mk("p4", "P4", 3) };
  const s = base(players, { courts: [court(1, "live", ["p1", "p2"], ["p3", "p4"])], matchHistory: [{ round: 1, teamA: ["b", "c"], teamB: ["d", "e"] }], nextMatchups: [{ id: "m1", teamA: ["b", "d"], teamB: ["c", "e"] }] });
  const alerts = computeAlerts(s, NOW);
  assert("all three situations present at once", new Set(kinds(alerts)).size === 3 && kinds(alerts).includes("longWait") && kinds(alerts).includes("repeatFoursome") && kinds(alerts).includes("gamesBehind"));
  assert("warn alerts sort before info", kinds(alerts).indexOf("repeatFoursome") === alerts.length - 1);
  assert("ids are unique", new Set(alerts.map((a) => a.id)).size === alerts.length);
  const seen = [alerts[0].id];
  assert("unseenAlerts filters by id", unseenAlerts(alerts, seen).length === alerts.length - 1 && unseenAlerts(alerts, []).length === alerts.length && unseenAlerts(alerts, undefined).length === alerts.length);
  assert("empty session -> no alerts, no crash", computeAlerts({ ...defaultState, players: {}, courts: [], nextMatchups: [] }, NOW).length === 0 && computeAlerts(undefined, NOW).length === 0);
}

console.log("\n6. wiring");
{
  const bell = strip(read("src/components/AlertBell.jsx"));
  assert("AlertBell derives alerts from computeAlerts on a 30-second clock", /computeAlerts\(state, now\)/.test(bell) && /useNow\(30000\)/.test(bell));
  assert("red badge shows the unseen count", /data-testid="alert-badge"/.test(bell) && /unseen\.length > 9 \? "9\+" : unseen\.length/.test(bell));
  assert("chimes only for NEW alert ids, never on first paint", /if \(rungRef\.current === null\) \{\s*rungRef\.current = new Set\(ids\);\s*return;\s*\}/.test(bell) && /if \(fresh\.length > 0 && soundOn\) playChime\(ctxRef\);/.test(bell));
  assert("Web Audio chime, lazily created, no asset file", /window\.AudioContext \|\| window\.webkitAudioContext/.test(bell) && /createOscillator\(\)/.test(bell) && !/new Audio\(/.test(bell));
  assert("mute toggle + seen ids persisted per device (localStorage, try/catch)", /opl-alert-sound/.test(bell) && /opl-alert-seen-/.test(bell) && /localStorage\.setItem/.test(bell) && /catch/.test(bell));
  assert("opening the panel marks everything read", /if \(next\) markAllRead\(\);/.test(bell));
  assert("alerts are never written to the session record", !/save\(|supabase|\.from\(/.test(bell));
  const scorer = strip(read("src/components/ScorerView.jsx"));
  assert("Scorer tab mounts the bell next to the Session Settings button", /<AlertBell state=\{state\} \/>/.test(scorer) && /import AlertBell from "\.\/AlertBell\.jsx"/.test(scorer) && scorer.indexOf("<AlertBell") < scorer.indexOf("setSettingsDialogOpen(true)"));
  const alertsSrc = strip(read("src/lib/alerts.js"));
  assert("lib/alerts.js is pure (no React, no I/O)", !/react|supabase|localStorage|fetch\(/i.test(alertsSrc));
  const st = read("src/styles.js");
  for (const key of ["alertBellWrap", "alertBadge", "alertPanel", "alertList", "alertFoot", "sessionInfoHeadActions"]) assert(`styles.${key} defined once`, (st.match(new RegExp(`^  ${key}: \\{`, "mg")) || []).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
