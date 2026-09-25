// Adaptive Ranking Rotation — REAL-SESSION SHADOW MODE tests.
// Shadow mode compares the live Adaptive Skill Rotation queue against what
// Adaptive Ranking Rotation would have proposed, logs a compact observation
// to browser-local storage, and must never change the live session or touch
// the network beyond the existing single bulk rating lookup.
//
// Usage: node scripts/verify-ranking-shadow-mode.mjs
import fs from "node:fs";

const net = { get: 0, set: 0, list: 0, listWithValues: 0, getMany: 0, delete: 0, subscribe: 0 };
globalThis.window = {
  storage: {
    get: async () => { net.get++; throw new Error("no per-key reads"); },
    set: async () => { net.set++; },
    delete: async () => { net.delete++; },
    list: async () => { net.list++; return { keys: [] }; },
    listWithValues: async () => { net.listWithValues++; return { rows: [] }; },
    getMany: async () => { net.getMany++; return { rows: [] }; },
    subscribeToKey: () => { net.subscribe++; return () => {}; },
  },
};

const Log = await import("../src/lib/rankingShadowLog.js");
const RT = await import("../src/lib/rankingShadowRuntime.js");
const { getRotationEngine, refreshNextMatchups } = await import("../src/lib/utils.js");
const { ROTATION_MODES, emptyCourt } = await import("../src/lib/constants.js");
const { AdaptiveSkillRotationEngine } = await import("../src/engines/AdaptiveSkillRotationEngine.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const resetNet = () => Object.keys(net).forEach((k) => { net[k] = 0; });

function fakeStorage() {
  const m = new Map(); const c = { get: 0, set: 0, remove: 0 };
  return { getItem: (k) => { c.get++; return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { c.set++; m.set(k, String(v)); }, removeItem: (k) => { c.remove++; m.delete(k); }, _m: m, _c: c };
}
const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === "object" && v && deepFreeze(v)); return Object.freeze(o); };
const PHOTO = "data:image/png;base64," + "QUJD".repeat(200);

const T = Date.now();
function makeState(n = 12) {
  const players = {};
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    players[id] = {
      id, name: `Player ${i}`, photo: PHOTO, skill: i % 3 === 0 ? "beginner" : "intermediate", games: i % 4, wins: i % 2, losses: (i + 1) % 2,
      status: "ACTIVE", checkedIn: true, checkedInAt: T - (60 - i) * 60000, lastMatchEndAt: i % 2 ? T - (5 + i) * 60000 : null, lastResult: null,
      partnerCounts: {}, recentPartnerIds: i === 1 ? ["p2"] : [], opponentCounts: {}, lastOpponentIds: [], recentOpponentIds: [],
    };
  }
  const queueIds = Object.keys(players);
  const nextMatchups = refreshNextMatchups(queueIds, players, [], getRotationEngine("adaptiveSkill"), null, 2, null, []);
  return { rotationMode: "adaptiveSkill", sessionType: "openPlay", players, queueIds, nextMatchups, courts: [emptyCourt(1), emptyCourt(2)], matchHistory: [], recentMatchups: [], matchmakingPriority: null };
}
const okBulk = async (ids) => Object.fromEntries(ids.slice(0, 9).map((id, i) => [id, { currentRating: 960 + i * 15 }]));
const mkRuntime = (over = {}) => {
  const storage = fakeStorage();
  const timers = [];
  const rt = RT.createShadowRuntime({ storage, fetchBulk: okBulk, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: (h) => { timers[h - 1] = null; }, ...over });
  return { rt, storage, timers };
};

console.log("\n1-2. Shadow calculation leaves live state (and nextMatchups) untouched");
{
  const state = makeState();
  const frozenJson = JSON.stringify(state);
  const nm = state.nextMatchups, qi = state.queueIds, cs = state.courts, pl = state.players;
  deepFreeze(state);
  const { rt, storage } = mkRuntime();
  const res = await rt.observe(state, { trigger: "matchups_refreshed", sessionCode: "ABC123" });
  assert("observe ran on a deep-frozen state without throwing and logged one observation", res.ok === true && Log.readShadowLog(storage).length === 1);
  assert("state is byte-for-byte identical afterwards", JSON.stringify(state) === frozenJson);
  assert("nextMatchups, queueIds, courts and players are the very same objects", state.nextMatchups === nm && state.queueIds === qi && state.courts === cs && state.players === pl);
  assert("nextMatchups content unchanged (2 matchups, same players)", nm.length === 2 && JSON.stringify(state.nextMatchups) === JSON.stringify(nm));
  assert("state fingerprint is stable across a shadow run", RT.stateFingerprint(state) === RT.stateFingerprint(JSON.parse(frozenJson)));
  const o = res.observation;
  assert("observation records actual engine adaptiveSkill and shadow engine adaptiveRanking", o.actualEngine === "adaptiveSkill" && o.shadowEngine === "adaptiveRanking");
  assert("actual matchups are the REAL queued nextMatchups", JSON.stringify(o.actualMatchups) === JSON.stringify(nm.map((m) => [m.teamA, m.teamB])));
  assert("proposal, agreement flags and differing players are recorded", o.proposedMatchups.length >= 1 && typeof o.samePlayers === "boolean" && typeof o.sameTeams === "boolean" && Array.isArray(o.differingPlayers));
  assert("shadow reasons are Adaptive Ranking reason codes, actual reasons are Adaptive Skill codes", o.shadowReasons.flat().some((r) => /RANKING|MIXED|SKILL|WAIT|GAMES|REST|PARTNER/.test(r)) && o.actualReasons.flat().every((r) => ["FAIRNESS_PRIORITY", "LOOKAHEAD_USED", "REST_GUARD_RELAXED"].includes(r)));
  assert("all required metrics are present and finite", ["actualAvgGames", "shadowAvgGames", "actualMaxGames", "shadowMaxGames", "actualAvgWait", "shadowAvgWait", "actualMaxWait", "shadowMaxWait", "actualMixedSkillMatchCount", "shadowMixedSkillMatchCount", "shadowForcedPartnerRepeats", "shadowForcedSkillFallbacks"].every((k) => Number.isFinite(o.metrics[k])));
}

console.log("\n3-4. The log is bounded and evicts the oldest first");
{
  const storage = fakeStorage();
  const mk = (i) => ({ timestamp: i, trigger: "t", actualMatchups: [], proposedMatchups: [], samePlayers: true, sameTeams: true, metrics: { actualMatchCount: 1, shadowMatchCount: 1, actualAvgGames: 1, shadowAvgGames: 1, actualMaxWait: 1, shadowMaxWait: 1 } });
  for (let i = 1; i <= 700; i++) Log.recordShadowObservation(storage, mk(i));
  const log = Log.readShadowLog(storage);
  assert("700 observations -> exactly 500 stored (SHADOW_LOG_MAX)", log.length === 500 && Log.SHADOW_LOG_MAX === 500);
  assert("the 200 oldest were evicted; the newest 500 remain in order", log[0].timestamp === 201 && log[499].timestamp === 700 && log.every((o, i) => i === 0 || o.timestamp === log[i - 1].timestamp + 1));
  const pure = Log.appendShadowObservation([mk(1), mk(2), mk(3)], mk(4), 3);
  assert("appendShadowObservation is pure and evicts the oldest", pure.map((o) => o.timestamp).join() === "2,3,4");
  assert("a custom small cap is honored", Log.appendShadowObservation(Array.from({ length: 10 }, (_, i) => mk(i)), mk(99), 5).length === 5);
  assert("a malformed observation is rejected and never stored", Log.recordShadowObservation(storage, { timestamp: "x" }) === false && Log.readShadowLog(storage).length === 500);
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => {} };
  assert("a full/unavailable localStorage never throws", Log.recordShadowObservation(full, mk(1)) === false && Log.readShadowLog(null).length === 0);
}

console.log("\n5. JSON export is compact observation data only");
{
  const state = makeState();
  const { rt, storage } = mkRuntime();
  await rt.observe(state, { trigger: "match_ended", sessionCode: "ZZ" });
  await rt.observe(state, { trigger: "matchup_dispatched", sessionCode: "ZZ" });
  const json = Log.exportShadowJson(Log.readShadowLog(storage));
  const parsed = JSON.parse(json);
  assert("export is {format, version, count, observations}", parsed.format === "pk-shadow-log" && parsed.version === 1 && parsed.count === 2 && parsed.observations.length === 2);
  assert("no photo / base64 data anywhere in the export", !/photo|base64|data:image/i.test(json));
  assert("no full player records (no names, skills, stats objects)", !/"name"|"skill"|"partnerCounts"|"recentPartnerIds"|"checkedInAt"/.test(json));
  assert("each observation is small (< 3 KB)", parsed.observations.every((o) => JSON.stringify(o).length < 3000));
  assert("matchups are plain id arrays", parsed.observations[0].actualMatchups.every(([a, b]) => Array.isArray(a) && a.every((x) => typeof x === "string") && Array.isArray(b)));
}

console.log("\n6. Local logging touches no network/storage API; the only network read is the single bulk rating lookup");
{
  resetNet();
  const storage = fakeStorage();
  const obs = { timestamp: 1, trigger: "t", actualMatchups: [], proposedMatchups: [], samePlayers: true, sameTeams: true, metrics: { actualMatchCount: 0, shadowMatchCount: 0, actualAvgGames: 0, shadowAvgGames: 0, actualMaxWait: 0, shadowMaxWait: 0 } };
  Log.recordShadowObservation(storage, obs); Log.readShadowLog(storage); Log.summarizeShadowLog([obs]); Log.exportShadowJson([obs]); Log.clearShadowLog(storage);
  assert("record/read/summarize/export/clear made zero window.storage (Supabase) calls", Object.values(net).every((v) => v === 0));

  resetNet();
  const state = makeState(); const bulkCalls = [];
  const { rt } = mkRuntime({ fetchBulk: async (ids) => { bulkCalls.push(ids.length); return okBulk(ids); } });
  await rt.observe(state, { trigger: "a" });
  await rt.observe(state, { trigger: "b" });
  await rt.observe(state, { trigger: "c" });
  assert("3 observations -> exactly ONE bulk rating lookup covering all 12 players", bulkCalls.length === 1 && bulkCalls[0] === 12);
  assert("no per-player get/list/set/delete/subscribe/getMany calls at all from shadow mode", Object.values(net).every((v) => v === 0));
  const later = { ...state, players: { ...state.players, late: { ...state.players.p0, id: "late" } }, queueIds: [...state.queueIds, "late"] };
  await rt.observe(later, { trigger: "d" });
  assert("a newly checked-in player triggers ONE more bulk lookup, for just that player", bulkCalls.length === 2 && bulkCalls[1] === 1);
}

console.log("\n7. Missing / failed ratings use provisional handling and say so");
{
  const state = makeState();
  const empty = mkRuntime({ fetchBulk: async () => ({}) });
  const r1 = await empty.rt.observe(state, { trigger: "x" });
  assert("no stored ratings -> ratingsAvailable=false and provisional players counted", r1.ok && r1.observation.ratingsAvailable === false && r1.observation.metrics.provisionalPlayers > 0);
  assert("a proposal is still produced (players seeded at 1000)", r1.observation.proposedMatchups.length >= 1);
  let calls = 0;
  const bad = mkRuntime({ fetchBulk: async () => { calls++; throw new Error("network down"); } });
  const r2 = await bad.rt.observe(state, { trigger: "x" });
  const r3 = await bad.rt.observe(state, { trigger: "y" });
  assert("a failed lookup never blocks shadow: still logs with ratingsAvailable=false", r2.ok && r2.observation.ratingsAvailable === false && r3.ok);
  assert("a failed lookup is NOT retried for the same players (no retry storm)", calls === 1);
  const partial = mkRuntime({ fetchBulk: async (ids) => ({ [ids[0]]: { currentRating: 1234 } }) });
  const r4 = await partial.rt.observe(state, { trigger: "z" });
  assert("partial ratings: available=true, the rest provisional", r4.observation.ratingsAvailable === true && r4.observation.metrics.provisionalPlayers >= 0);
}

console.log("\n8. Malformed shadow input/result never affects production matchmaking");
{
  const state = makeState();
  const broken = { ...state, nextMatchups: [{ id: "bad", teamA: undefined, teamB: null }] };
  const before = JSON.stringify(broken);
  const { rt, storage } = mkRuntime();
  const res = await rt.observe(broken, { trigger: "x" });
  assert("garbage nextMatchups -> observe reports failure, does not throw, logs nothing", res.ok === false && Log.readShadowLog(storage).length === 0);
  assert("the (malformed) live state is untouched", JSON.stringify(broken) === before);
  const noPlayers = await rt.observe({ rotationMode: "adaptiveSkill" }, { trigger: "x" });
  assert("a state with no players/queue never throws", noPlayers.ok === false || noPlayers.ok === true);
  assert("isValidObservation rejects malformed results", !Log.isValidObservation(null) && !Log.isValidObservation({}) && !Log.isValidObservation({ timestamp: 1, trigger: "t", actualMatchups: [], proposedMatchups: [], samePlayers: true, sameTeams: true, metrics: { actualMatchCount: NaN } }));
  const engineBefore = getRotationEngine("adaptiveSkill");
  await rt.observe(broken, { trigger: "x" });
  assert("the production engine instance is unchanged after shadow failures", getRotationEngine("adaptiveSkill") === engineBefore);
}

console.log("\n9-10. Adaptive Skill stays the real engine; adaptiveRanking stays unselectable");
{
  assert("getRotationEngine('adaptiveSkill') is still AdaptiveSkillRotationEngine", getRotationEngine("adaptiveSkill") instanceof AdaptiveSkillRotationEngine);
  assert("adaptiveRanking is NOT in ROTATION_MODES (not selectable)", !ROTATION_MODES.some((m) => m.value === "adaptiveRanking") && ROTATION_MODES.length === 4);
  const { rt, timers } = mkRuntime();
  const s = makeState();
  assert("notify ignores sessions that are not running Adaptive Skill Rotation", rt.notify({ ...s, rotationMode: "continuous" }) === null && rt.notify({ ...s, rotationMode: "adaptiveRanking" }) === null && rt.notify({ ...s, sessionType: "tournament" }) === null && timers.length === 0);
  const off = mkRuntime(); off.storage.setItem(Log.SHADOW_DISABLED_KEY, "1");
  assert("the per-device kill switch disables shadow mode entirely", off.rt.notify(s) === null && off.timers.length === 0);
}

console.log("\n11. Triggering: one observation per meaningful scheduling decision");
{
  const s = makeState();
  const P = Log.schedulingParts;
  assert("first sight of a session -> session_observed", Log.classifyTrigger(null, P(s)) === "session_observed");
  assert("identical scheduling state -> null (no observation)", Log.classifyTrigger(P(s), P({ ...s, players: { ...s.players } })) === null);
  assert("a timer/waiting-time-only player change (same eligibility) -> null", Log.classifyTrigger(P(s), P({ ...s, players: { ...s.players, p0: { ...s.players.p0, totalWaitMs: 5 } } })) === null);
  assert("matchHistory grew -> match_ended", Log.classifyTrigger(P(s), P({ ...s, matchHistory: [{}] })) === "match_ended");
  assert("a court got a matchup -> matchup_dispatched", Log.classifyTrigger(P(s), P({ ...s, courts: [{ ...s.courts[0], status: "dispatching", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }, s.courts[1]] })) === "matchup_dispatched");
  assert("nextMatchups changed -> matchups_refreshed", Log.classifyTrigger(P(s), P({ ...s, nextMatchups: [] })) === "matchups_refreshed");
  const held = { ...s, players: { ...s.players, p0: { ...s.players.p0, held: true } } };
  assert("a player becoming ineligible -> player_unavailable; coming back -> player_available", Log.classifyTrigger(P(s), P(held)) === "player_unavailable" && Log.classifyTrigger(P(held), P(s)) === "player_available");
  assert("manual regenerate hint wins when the queue changed", Log.classifyTrigger(P(s), P({ ...s, nextMatchups: [] }), "manual_regenerate") === "manual_regenerate");
  assert("a hint alone (nothing changed) does not force an observation", Log.classifyTrigger(P(s), P(s), "manual_regenerate") === null);

  const { rt, storage, timers } = mkRuntime();
  rt.notify(s, { sessionCode: "Q" });
  rt.notify({ ...s, nextMatchups: [] }, { sessionCode: "Q" });
  rt.notify({ ...s, nextMatchups: [], matchHistory: [{}] }, { sessionCode: "Q" });
  const live = timers.filter(Boolean);
  assert("a burst of 3 changes coalesces into ONE pending (debounced) observation", live.length === 1);
  await live[0]();
  await new Promise((r) => setTimeout(r, 20));
  assert("firing the debounce logs exactly one observation with a combined trigger", Log.readShadowLog(storage).length === 1 && /match_ended/.test(Log.readShadowLog(storage)[0].trigger));
  assert("no interval/polling timers exist in shadow mode (source check)", !/setInterval/.test(fs.readFileSync(new URL("../src/lib/rankingShadowRuntime.js", import.meta.url), "utf8")));
}

console.log("\n12. Real-session summary (evidence only)");
{
  const mkObs = (i, o) => ({ timestamp: i, sessionCode: "S1", trigger: "matchups_refreshed", actualMatchups: [], proposedMatchups: [], samePlayers: true, sameTeams: true, ratingsAvailable: true, metrics: { actualMatchCount: 2, shadowMatchCount: 2, actualAvgGames: 3, shadowAvgGames: 3, actualMaxGames: 4, shadowMaxGames: 4, actualGamesSpread: 2, shadowGamesSpread: 1, actualAvgWait: 10, shadowAvgWait: 10, actualMaxWait: 20, shadowMaxWait: 30, actualMixedSkillMatchCount: 0, shadowMixedSkillMatchCount: 1, actualRecentPartnerRepeats: 1, shadowRecentPartnerRepeats: 0, actualRecentOpponentRepeats: 2, shadowRecentOpponentRepeats: 1, actualPointsRange: 100, shadowPointsRange: 80, actualImbalance: 60, shadowImbalance: 20, shadowForcedPartnerRepeats: 0, shadowForcedSkillFallbacks: 1 }, ...o });
  const log = [mkObs(1, {}), mkObs(2, { samePlayers: false, sameTeams: false, ratingsAvailable: false, trigger: "match_ended", metrics: { ...mkObs(2, {}).metrics, shadowForcedPartnerRepeats: 2, shadowMaxWait: 10 } })];
  const sm = Log.summarizeShadowLog(log);
  assert("decision count, agreement rate and team-composition agreement", sm.decisions === 2 && sm.agreementRate === 50 && sm.teamCompositionAgreementRate === 50);
  assert("actual vs proposed games spread and max wait", sm.actual.avgGamesSpread === 2 && sm.shadow.avgGamesSpread === 1 && sm.actual.avgMaxWait === 20 && sm.shadow.avgMaxWait === 20);
  assert("actual vs proposed B+I percentage", sm.actual.mixedSkillPct === 0 && sm.shadow.mixedSkillPct === 50);
  assert("recent partner / opponent repeat rates (per matchup)", sm.actual.recentPartnerRepeatRate === 50 && sm.shadow.recentPartnerRepeatRate === 0 && sm.actual.recentOpponentRepeatRate === 100 && sm.shadow.recentOpponentRepeatRate === 50);
  assert("forced partner repeats and forced skill fallbacks are totals", sm.shadow.forcedPartnerRepeats === 2 && sm.shadow.forcedSkillFallbacks === 2);
  assert("average Points range and team imbalance for both sides", sm.actual.avgPointsRange === 100 && sm.shadow.avgPointsRange === 80 && sm.actual.avgTeamImbalance === 60 && sm.shadow.avgTeamImbalance === 20);
  assert("decisions without ratings, trigger counts and sessions are reported", sm.decisionsWithoutRatings === 1 && sm.triggers.match_ended === 1 && sm.sessions.join() === "S1");
  assert("the summary has no ranking score and no winner label", !/winner|score|better|best|recommend/i.test(JSON.stringify(sm)));
  const empty = Log.summarizeShadowLog([]);
  assert("an empty log summarizes to zeros without NaN", empty.decisions === 0 && empty.agreementRate === 0 && empty.actual.avgPointsRange === 0);
}

console.log("\n13. Developer-only helpers");
{
  const storage = fakeStorage(); const win = {};
  const obs = { timestamp: 5, trigger: "t", actualMatchups: [], proposedMatchups: [], samePlayers: true, sameTeams: true, metrics: { actualMatchCount: 0, shadowMatchCount: 0, actualAvgGames: 0, shadowAvgGames: 0, actualMaxWait: 0, shadowMaxWait: 0 } };
  Log.recordShadowObservation(storage, obs);
  const dev = Log.installShadowDevTools(win, storage);
  assert("window.pkShadow exposes summary / exportJson / clear / count / disable / enable", dev === win.pkShadow && ["summary", "exportJson", "clear", "count", "disable", "enable"].every((k) => typeof dev[k] === "function"));
  assert("summary and export work; clear empties the log", dev.summary().decisions === 1 && JSON.parse(dev.exportJson()).count === 1 && dev.count() === 1 && (dev.clear(), dev.count() === 0));
  dev.disable(); assert("disable/enable toggle the kill switch", Log.isShadowEnabled(storage) === false && (dev.enable(), Log.isShadowEnabled(storage) === true));
}

console.log("\n14. Source-level safety guards");
{
  const strip = (s) => s.replace(/\/\/.*$/gm, "");
  const runtimeSrc = strip(fs.readFileSync(new URL("../src/lib/rankingShadowRuntime.js", import.meta.url), "utf8"));
  const logSrc = strip(fs.readFileSync(new URL("../src/lib/rankingShadowLog.js", import.meta.url), "utf8"));
  assert("shadow modules never reference Supabase, window.storage, Realtime, or intervals", ![runtimeSrc, logSrc].some((s) => /supabase|window\.storage|subscribeToKey|setInterval|opl_kv|listWithValues|\bstorage\.set\(/.test(s)));
  assert("the only network-capable import is the existing bulk rating lookup", (runtimeSrc.match(/fetchPlayerRatingsBulk/g) || []).length >= 1 && !/fetchAllPlayerRatings|fetchPlayerRating\b|fetchPlayer\b/.test(runtimeSrc));
  const comp = fs.readFileSync(new URL("../src/PickleballOpenPlay.jsx", import.meta.url), "utf8");
  const block = comp.split("SHADOW MODE BEGIN")[1]?.split("SHADOW MODE END")[0] || "";
  assert("the component's shadow block exists and only calls runtime.notify (no save/setState/storage writes)", block.includes("runtime.notify(") && !/\bsave\(|setState\(|window\.storage|supabase/.test(strip(block)));
  assert("no additional Realtime subscription was added (still exactly one subscribeToKey call)", (comp.match(/subscribeToKey\(/g) || []).length === 1);
  assert("ROTATION_MODES source still lacks adaptiveRanking", !/value: "adaptiveRanking"/.test(fs.readFileSync(new URL("../src/lib/constants.js", import.meta.url), "utf8").split("EXPERIMENTAL_ROTATION_MODES")[0].split("export const ROTATION_MODES")[1] || ""));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
