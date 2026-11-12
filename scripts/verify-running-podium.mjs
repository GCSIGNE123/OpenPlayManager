// Running Podium — automated, headless, logic-layer coverage of
// lib/podium.js plus source-level wiring checks for every surface that
// shows it. See FEATURES.md ("Running Podium").
//
// Usage: node scripts/verify-running-podium.mjs
import fs from "node:fs";
import {
  computePodium,
  finalPodium,
  publicPodium,
  podiumSettings,
  podiumStatusText,
  DEFAULT_PODIUM_UNLOCK_MINUTES,
  DEFAULT_PODIUM_MIN_GAMES,
  PODIUM_PLACES,
} from "../src/lib/podium.js";
import { buildStandingsRows } from "../src/lib/performanceRating.js";
import { computeSessionAnalyticsReport } from "../src/lib/sessionAnalytics.js";
import { buildOpenPlayFinalSummary, buildPublicFinalSummary } from "../src/lib/publicFinalSummary.js";
import { buildSessionReportExportTable } from "../src/lib/sessionReportExport.js";
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
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const mk = (id, name, wins, losses, extra = {}) => ({
  id,
  name,
  skill: "beginner",
  checkedIn: true,
  status: "ACTIVE",
  games: wins + losses,
  wins,
  losses,
  streak: 0,
  pointsFor: wins * 11,
  pointsAgainst: losses * 11,
  partnerCounts: {},
  recentPartnerIds: [],
  opponentCounts: {},
  recentOpponentIds: [],
  lastResult: null,
  photo: "data:image/png;base64,AAAA",
  ...extra,
});
const players = {
  v: mk("v", "Victor", 6, 0),
  a: mk("a", "Anjo A.", 6, 1, { status: "CHECKED_OUT" }),
  j: mk("j", "Junkert B", 5, 0),
  z: mk("z", "Zed", 4, 2),
  n: mk("n", "Newbie", 1, 0), // one game only
  q: mk("q", "Quiet", 0, 0, { photo: null }),
};
const NOW = 1_800_000_000_000;
const base = { ...defaultState, players, courts: [emptyCourt(1), emptyCourt(2)], queueIds: [], nextMatchups: [], matchHistory: [] };

console.log("\n1. Defaults and settings");
{
  assert("defaultState.podiumUnlockMinutes is 60 and podiumMinGames is 2", defaultState.podiumUnlockMinutes === 60 && defaultState.podiumMinGames === 2);
  assert("constants agree with the defaults", DEFAULT_PODIUM_UNLOCK_MINUTES === 60 && DEFAULT_PODIUM_MIN_GAMES === 2);
  assert("a session saved before the fields existed gets the defaults (no NaN / 0)", JSON.stringify(podiumSettings({})) === JSON.stringify({ unlockMinutes: 60, minGames: 2 }));
  assert("garbage settings fall back to defaults", JSON.stringify(podiumSettings({ podiumUnlockMinutes: "abc", podiumMinGames: 0 })) === JSON.stringify({ unlockMinutes: 60, minGames: 2 }));
  assert("organizer values are honoured", JSON.stringify(podiumSettings({ podiumUnlockMinutes: 45, podiumMinGames: 3 })) === JSON.stringify({ unlockMinutes: 45, minGames: 3 }));
  assert("three places: Champion / Runner-up / 3rd Place", PODIUM_PLACES.map((p) => p.label).join("|") === "Champion|Runner-up|3rd Place");
}

console.log("\n2. Unlock is TIME-based (minutes of play), never games-based");
{
  const at = (minutes) => computePodium({ ...base, sessionStartedAt: NOW - minutes * 60000 }, NOW);
  assert("59 min in: locked", at(59).unlocked === false);
  assert("...with 1 minute to go", at(59).minutesToGo === 1);
  assert("37 min in: 23 min to go", at(37).minutesToGo === 23);
  assert("60 min in: unlocked", at(60).unlocked === true && at(60).minutesToGo === 0);
  assert("places are still computed while locked (the UI just doesn't show them)", at(10).places.length === 3);
  assert("no sessionStartedAt (very old session): stays locked rather than crashing", computePodium({ ...base, sessionStartedAt: null }, NOW).unlocked === false);
  const custom = computePodium({ ...base, sessionStartedAt: NOW - 46 * 60000, podiumUnlockMinutes: 45 }, NOW);
  assert("custom unlock (45 min) is honoured", custom.unlocked === true && custom.unlockMinutes === 45);
  assert("status copy before unlock names the time and countdown", /unlocks at 60 min of play — 23 min to go/.test(podiumStatusText(at(37))));
  assert("status copy after unlock mentions the games guard", /2\+ games to qualify/.test(podiumStatusText(at(61))));
}

console.log("\n3. Order = the Standings table; min-games guard; early leavers keep their place");
{
  const p = computePodium({ ...base, sessionStartedAt: NOW - 61 * 60000 }, NOW);
  const standings = buildStandingsRows(players).filter((r) => r.gp >= 2);
  assert("podium is exactly the top 3 of buildStandingsRows (after the min-games filter)", p.places.map((x) => x.playerId).join() === standings.slice(0, 3).map((r) => r.id).join());
  assert("Victor (6-0) champion, Junkert B (5-0) runner-up, Anjo A. (6-1) third", p.places.map((x) => x.name).join("|") === "Victor|Junkert B|Anjo A.");
  assert("Newbie (1 game) is kept off the podium by the 2-game guard", !p.places.some((x) => x.playerId === "n"));
  assert("...but qualifies when minGames is 1", computePodium({ ...base, sessionStartedAt: NOW - 61 * 60000, podiumMinGames: 1 }, NOW).eligibleCount === 5);
  assert("checked-out Anjo keeps 3rd and is tagged out", p.places[2].out === true && p.places[0].out === false);
  assert("each place carries name, W-L, games, win%, label and rank", p.places.every((x) => typeof x.name === "string" && x.rank >= 1 && x.label && typeof x.games === "number" && typeof x.winPct === "number"));
  assert("live places carry the photo (for the Live Board / TV avatars)", p.places[0].photo === players.v.photo);
  const fewer = computePodium({ ...base, players: { v: players.v, q: players.q }, sessionStartedAt: NOW - 61 * 60000 }, NOW);
  assert("fewer than 3 qualified players -> fewer places, never padding", fewer.places.length === 1 && fewer.places[0].rank === 1);
}

console.log("\n4. Final podium (End Session) and the public allow-list");
{
  const fp = finalPodium(base);
  assert("finalPodium ignores the time gate (same 3 names)", fp.map((x) => x.name).join("|") === "Victor|Junkert B|Anjo A.");
  assert("finalPodium strips photos (reports stay small)", fp.every((x) => !("photo" in x)));
  const pub = publicPodium(fp);
  const allowed = ["rank", "label", "name", "wins", "losses", "games", "winPct", "out"];
  assert("publicPodium exposes ONLY name + results (no ids, photos, ratings, skill, payment)", pub.every((x) => Object.keys(x).every((k) => allowed.includes(k))) && pub.every((x) => !("playerId" in x) && !("photo" in x) && !("rating" in x)));
  assert("win% rounded to 2 decimals", pub[2].winPct === 0.86);
  const report = computeSessionAnalyticsReport({ ...base, sessionStartedAt: NOW - 90 * 60000 }, NOW);
  assert("Session Analytics report carries finalPodium (3 places)", Array.isArray(report.finalPodium) && report.finalPodium.length === 3 && report.finalPodium[0].name === "Victor");
  assert("...and the report's finalStandings order still matches it", report.finalStandings.filter((r) => r.gp >= 2).slice(0, 3).map((r) => r.playerName).join("|") === report.finalPodium.map((x) => x.name).join("|"));
  const table = buildSessionReportExportTable(report);
  assert("CSV export has a Podium: Champion row naming Victor", table.rows.some((r) => r[0] === "Podium: Champion" && /Victor — 6-0/.test(r[1])));
  assert("...and marks the early leaver", table.rows.some((r) => r[0] === "Podium: 3rd Place" && /checked out early/.test(r[1])));
  const summary = buildOpenPlayFinalSummary(base, { sessionCode: "ABC123", endedAt: NOW });
  assert("public final summary (spectator /live page after close) carries `podium`", Array.isArray(summary.podium) && summary.podium.length === 3 && summary.podium[0].name === "Victor" && summary.podium[2].out === true);
  assert("...through buildPublicFinalSummary too (Open Play path)", buildPublicFinalSummary(base, null, { sessionCode: "ABC123", endedAt: NOW }).podium.length === 3);
  assert("the summary stays photo/id-free", !JSON.stringify(summary).includes("base64") && !JSON.stringify(summary.podium).includes('"playerId"'));
  assert("an empty session yields an empty podium, no crash", finalPodium({ players: {} }).length === 0 && buildOpenPlayFinalSummary({ players: {} }).podium.length === 0);
}

console.log("\n5. Wiring — every surface uses the one shared component/engine");
{
  const standings = read("src/components/StandingsView.jsx");
  const board = read("src/components/BoardView.jsx");
  const tv = read("src/components/OpenPlayTVModePage.jsx");
  const report = read("src/components/SessionAnalyticsReport.jsx");
  const dlg = read("src/components/SessionSettingsDialog.jsx");
  const scorer = read("src/components/ScorerView.jsx");
  const panel = read("src/components/PodiumPanel.jsx");
  assert("Standings tab renders PodiumPanel from computePodium", /computePodium\(state, now\)/.test(standings) && /<PodiumPanel podium=\{podium\}/.test(standings));
  assert("Standings top-3 rows use MedalIcon (default order only)", /showMedals && i < 3 \? <MedalIcon/.test(standings));
  assert("Live Board renders PodiumPanel above the courts", /<PodiumPanel podium=\{podium\}/.test(board) && board.indexOf("<PodiumPanel") < board.indexOf("styles.courtGrid"));
  assert("TV Mode renders the dark PodiumPanel in the Standings column and MedalIcon rows", /<PodiumPanel podium=\{podium\} dark/.test(tv) && /<MedalIcon rank=\{rank\}/.test(tv));
  assert("TV Mode no longer uses emoji medals", !/🥇|🥈|🥉/.test(tv));
  assert("Session report shows the final podium before Final Standings", /finalPodium/.test(report) && report.indexOf("<PodiumPanel") < report.indexOf("Final Standings"));
  assert("Session Settings exposes unlock minutes + min games and saves both", /aria-label="Podium unlock minutes"/.test(dlg) && /aria-label="Podium minimum games"/.test(dlg) && /podiumUnlockMinutes: Math\.max\(1/.test(dlg) && /podiumMinGames: Math\.max\(1/.test(dlg));
  assert("Scorer passes both settings into the dialog", /podiumUnlockMinutes=\{state\.podiumUnlockMinutes\}/.test(scorer) && /podiumMinGames=\{state\.podiumMinGames\}/.test(scorer));
  assert("PodiumPanel never ranks anyone itself (no buildStandingsRows import)", !/buildStandingsRows/.test(panel) && /podiumStatusText/.test(panel));
  assert("PodiumPanel lays out 2 | 1 | 3 and shows the out tag", /const order = \[2, 1, 3\]/.test(panel) && /place\.out &&/.test(panel));
  const medal = read("src/components/MedalIcon.jsx");
  assert("MedalIcon is an SVG with per-rank gradients and the brand ribbon colours", /<svg/.test(medal) && /pk-medal-\$\{rank\}/.test(medal) && /#16355E/.test(medal) && /#F7941D/.test(medal));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
