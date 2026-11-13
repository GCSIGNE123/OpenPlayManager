// Division Podiums — automated, headless coverage of the per-division
// podium primitives in lib/podium.js (computePodiums, finalPodiums,
// publicPodiums, podiumMedalRanks, finalPodiumsForDisplay), lib/divisions.js,
// the report / CSV / public-summary plumbing, and source-level wiring checks
// for PodiumBoard on every surface. See FEATURES.md ("Division Podiums").
//
// Usage: node scripts/verify-division-podiums.mjs
import fs from "node:fs";
import {
  computePodium,
  computePodiums,
  finalPodium,
  finalPodiums,
  finalPodiumsForDisplay,
  publicPodiums,
  podiumMedalRanks,
  podiumIsDivided,
  podiumStatusText,
  isOrganizerPlayer,
} from "../src/lib/podium.js";
import { DIVISIONS, DIVISION_MODES, divisionOf, divisionLabel, sessionHasDivisions } from "../src/lib/divisions.js";
import { buildStandingsRows } from "../src/lib/performanceRating.js";
import { computeSessionAnalyticsReport } from "../src/lib/sessionAnalytics.js";
import { buildOpenPlayFinalSummary } from "../src/lib/publicFinalSummary.js";
import { buildSessionReportExportTable } from "../src/lib/sessionReportExport.js";
import { defaultState } from "../src/lib/constants.js";

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
const mk = (id, name, skill, wins, losses, extra = {}) => ({
  id,
  name,
  skill,
  checkedIn: true,
  status: "ACTIVE",
  games: wins + losses,
  wins,
  losses,
  streak: 0,
  pointsFor: wins * 11,
  pointsAgainst: losses * 11,
  photo: `data:${id}`,
  ...extra,
});
// Intermediates deliberately have the BETTER overall records so the overall
// top-3 would be all-Intermediate — the division podiums must still crown a
// Beginner champion.
const players = {
  i1: mk("i1", "Rina", "intermediate", 7, 0),
  i2: mk("i2", "Paolo", "intermediate", 6, 1),
  i3: mk("i3", "Ken", "intermediate", 5, 2, { status: "CHECKED_OUT" }),
  i4: mk("i4", "Lito", "intermediate", 1, 0), // 1 game -> below the 2-game guard
  b1: mk("b1", "Guil", "beginner", 3, 2),
  b2: mk("b2", "Anjo", "beginner", 2, 3),
  b3: mk("b3", "Maria", undefined, 2, 3), // no skill recorded -> Beginner, like the engine; ties Anjo, name breaks it
  b4: mk("b4", "Victor", "beginner", 0, 0),
};
const base = { ...defaultState, rotationMode: "adaptiveSkill", players, sessionStartedAt: NOW - 75 * 60000, courts: [], queueIds: [], nextMatchups: [], matchHistory: [] };

console.log("\n1. lib/divisions.js");
assert("two divisions, in Beginner → Intermediate order", DIVISIONS.map((d) => d.key).join() === "beginner,intermediate" && DIVISIONS.map((d) => d.label).join() === "Beginner,Intermediate");
assert("division modes = Skill Divisions only", JSON.stringify(DIVISION_MODES) === JSON.stringify(["adaptiveSkill"]));
assert("divisionOf mirrors the engine's pool split (anything but 'intermediate' is Beginner)", divisionOf(players.i1) === "intermediate" && divisionOf(players.b1) === "beginner" && divisionOf(players.b3) === "beginner" && divisionOf(undefined) === "beginner");
assert("labels", divisionLabel("beginner") === "Beginner" && divisionLabel("intermediate") === "Intermediate");
assert("sessionHasDivisions / podiumIsDivided agree and are mode-scoped", sessionHasDivisions(base) && podiumIsDivided(base) && !podiumIsDivided({ ...base, rotationMode: "continuous" }) && !podiumIsDivided({ ...base, rotationMode: "progressiveSkill" }) && !podiumIsDivided({}));

console.log("\n2. computePodiums — one podium per division, same rules each");
{
  const podiums = computePodiums(base, NOW);
  assert("Skill Divisions session -> exactly two podiums, Beginner then Intermediate", podiums.length === 2 && podiums[0].division === "beginner" && podiums[1].division === "intermediate");
  assert("each carries its divisionLabel", podiums[0].divisionLabel === "Beginner" && podiums[1].divisionLabel === "Intermediate");
  const [beg, int] = podiums;
  assert("Beginner podium: Guil / Anjo / Maria — Maria (no skill recorded) counts as Beginner, Victor (0 games) excluded by the guard", beg.places.map((p) => p.name).join("|") === "Guil|Anjo|Maria");
  assert("Intermediate podium: Rina / Paolo / Ken — Lito (1 game) excluded by the 2-game guard", int.places.map((p) => p.name).join("|") === "Rina|Paolo|Ken");
  assert("checked-out Ken keeps 3rd, flagged out", int.places[2].out === true && beg.places.every((p) => !p.out));
  assert("labels Champion / Runner-up / 3rd Place in both", beg.places.map((p) => p.label).join("|") === "Champion|Runner-up|3rd Place" && int.places.map((p) => p.label).join("|") === beg.places.map((p) => p.label).join("|"));
  assert("no Beginner appears on the Intermediate podium and vice versa", beg.places.every((p) => divisionOf(players[p.playerId]) === "beginner") && int.places.every((p) => divisionOf(players[p.playerId]) === "intermediate"));
  const overallTop3 = buildStandingsRows(players).filter((r) => r.gp >= 2).slice(0, 3).map((r) => r.name).join("|");
  assert("...whereas the OVERALL top-3 is all-Intermediate (the reason division podiums exist)", overallTop3 === "Rina|Paolo|Ken");
  assert("each division's order = the Standings table restricted to that division", beg.places.map((p) => p.name).join("|") === buildStandingsRows(players).filter((r) => divisionOf(players[r.id]) === "beginner" && r.gp >= 2).slice(0, 3).map((r) => r.name).join("|"));
  assert("unlock state is shared (same unlock, same minutesToGo)", beg.unlocked === int.unlocked && beg.unlocked === true && beg.minutesToGo === int.minutesToGo);
  const locked = computePodiums({ ...base, sessionStartedAt: NOW - 20 * 60000 }, NOW);
  assert("locked before 60 min on both, 40 min to go, places still computed for the row medals", locked.every((p) => !p.unlocked && p.minutesToGo === 40) && locked[0].places.length === 3);
  assert("eligibleCount is per division", beg.eligibleCount === 3 && int.eligibleCount === 3);
  assert("live places keep the photo (avatars on Live Board / TV)", beg.places[0].photo === "data:b1");
}

console.log("\n3. Other rotation modes keep the single podium");
{
  for (const mode of ["continuous", "winnerPool", "progressiveSkill", "adaptiveRanking", "pointsAdaptive"]) {
    const podiums = computePodiums({ ...base, rotationMode: mode }, NOW);
    assert(`${mode}: one overall podium, no division fields`, podiums.length === 1 && podiums[0].division === null && podiums[0].divisionLabel === null && podiums[0].places.map((p) => p.name).join("|") === "Rina|Paolo|Ken");
  }
  const single = computePodium({ ...base, rotationMode: "continuous" }, NOW);
  assert("computePodium without a division is byte-for-byte the old overall podium shape (+ null division fields)", single.places.length === 3 && single.division === null && "unlockMinutes" in single && "minutesToGo" in single);
}

console.log("\n4. Edge cases");
{
  const onlyBeginners = { ...base, players: Object.fromEntries(Object.entries(players).filter(([, p]) => divisionOf(p) === "beginner")) };
  const podiums = computePodiums(onlyBeginners, NOW);
  assert("nobody in a division -> that podium has 0 places (never padded, never throws)", podiums[1].places.length === 0 && podiums[0].places.length === 3);
  assert("status copy names the empty division", /No Intermediate player has 2\+ completed games yet/.test(podiumStatusText(podiums[1])));
  assert("status copy for a non-empty division is the shared running text", /Running podium — updates after every result/.test(podiumStatusText(podiums[0])));
  const promoted = { ...base, players: { ...players, b1: { ...players.b1, skill: "intermediate" } } };
  const [beg, int] = computePodiums(promoted, NOW);
  assert("a promoted player stands in the division they are in NOW (leaves the Beginner podium, counted among Intermediate eligibles)", !beg.places.some((p) => p.name === "Guil") && beg.places[0].name === "Anjo" && int.eligibleCount === 4);
  assert("podiumMedalRanks maps every podium's places to playerId -> rank", JSON.stringify(podiumMedalRanks(computePodiums(base, NOW))) === JSON.stringify({ b1: 1, b2: 2, b3: 3, i1: 1, i2: 2, i3: 3 }));
  assert("podiumMedalRanks tolerates empty input", JSON.stringify(podiumMedalRanks([])) === "{}" && JSON.stringify(podiumMedalRanks(undefined)) === "{}");
}

console.log("\n4b. Organizers (Payment tab → Organizer) are not podium-eligible");
{
  const org = (p) => ({ ...p, paymentStatus: "paid", paymentMethod: "organizer" });
  const withOrgs = { ...base, players: { ...players, b1: org(players.b1), i1: org(players.i1) } };
  assert("isOrganizerPlayer: paid + organizer only", isOrganizerPlayer(org(players.b1)) && !isOrganizerPlayer({ paymentStatus: "paid", paymentMethod: "cash" }) && !isOrganizerPlayer({ paymentStatus: "unpaid", paymentMethod: "organizer" }) && !isOrganizerPlayer(players.b1) && !isOrganizerPlayer(undefined));
  const [beg, int] = computePodiums(withOrgs, NOW);
  assert("Beginner podium skips the organizer (Guil) — next eligible moves up", beg.places.map((p) => p.name).join("|") === "Anjo|Maria" && beg.places[0].label === "Champion");
  assert("Intermediate podium skips the organizer (Rina) — Paolo is Champion", int.places.map((p) => p.name).join("|") === "Paolo|Ken" && int.places[0].rank === 1);
  assert("eligibleCount excludes organizers", beg.eligibleCount === 2 && int.eligibleCount === 2);
  assert("single (non-division) podium excludes them too", computePodium({ ...withOrgs, rotationMode: "continuous" }, NOW).places.every((p) => p.name !== "Rina" && p.name !== "Guil"));
  assert("final podiums, report and public summary exclude them", finalPodiums(withOrgs).every((g) => g.places.every((p) => p.name !== "Rina" && p.name !== "Guil")) && !JSON.stringify(buildOpenPlayFinalSummary(withOrgs, { sessionCode: "ABC123", endedAt: NOW }).podiums).includes("Rina"));
  assert("row medals follow: organizers get none", !("b1" in podiumMedalRanks(computePodiums(withOrgs, NOW))) && !("i1" in podiumMedalRanks(computePodiums(withOrgs, NOW))));
  assert("they still appear in the Standings table with their record", buildStandingsRows(withOrgs.players).some((r) => r.name === "Rina" && r.wins === 7));
  const unmarked = { ...withOrgs, players: { ...withOrgs.players, i1: { ...withOrgs.players.i1, paymentStatus: "unpaid", paymentMethod: null } } };
  assert("unmarking in the Payment tab restores eligibility", computePodiums(unmarked, NOW)[1].places[0].name === "Rina");
}

console.log("\n5. Final snapshot, report, CSV, public summary");
{
  const groups = finalPodiums(base);
  assert("finalPodiums: two groups with division/label/places", groups.length === 2 && groups[0].division === "beginner" && groups[0].label === "Beginner" && groups[1].label === "Intermediate" && groups[0].places[0].name === "Guil" && groups[1].places[0].name === "Rina");
  assert("final places carry no photos", groups.every((g) => g.places.every((p) => !("photo" in p))));
  assert("finalPodium (overall) unchanged for existing consumers", finalPodium(base).map((p) => p.name).join("|") === "Rina|Paolo|Ken");
  assert("finalPodium with a division filter", finalPodium(base, { division: "beginner" })[0].name === "Guil");
  const flat = finalPodiums({ ...base, rotationMode: "continuous" });
  assert("non-division session -> one group with null division", flat.length === 1 && flat[0].division === null && flat[0].label === null && flat[0].places.length === 3);

  const display = finalPodiumsForDisplay(groups);
  assert("finalPodiumsForDisplay -> final, unlocked panels titled by division", display.length === 2 && display.every((p) => p.final && p.unlocked) && display[0].divisionLabel === "Beginner" && display[1].divisionLabel === "Intermediate");
  const legacy = finalPodiumsForDisplay(finalPodium(base));
  assert("...and accepts the pre-division bare places array (old saved reports)", legacy.length === 1 && legacy[0].division === null && legacy[0].places.length === 3);
  assert("...and empty input -> []", finalPodiumsForDisplay(undefined).length === 0 && finalPodiumsForDisplay([]).length === 0);

  const report = computeSessionAnalyticsReport(base, NOW);
  assert("Session Analytics report carries finalPodiums (2 groups) alongside finalPodium", report.finalPodiums.length === 2 && report.finalPodiums[0].places[0].name === "Guil" && report.finalPodium[0].name === "Rina");
  const table = buildSessionReportExportTable(report);
  assert("CSV: 'Beginner Podium: Champion' = Guil", table.rows.some((r) => r[0] === "Beginner Podium: Champion" && /^Guil — 3-2/.test(r[1])));
  assert("CSV: 'Intermediate Podium: Champion' = Rina, 3rd marked checked out early", table.rows.some((r) => r[0] === "Intermediate Podium: Champion" && /^Rina — 7-0/.test(r[1])) && table.rows.some((r) => r[0] === "Intermediate Podium: 3rd Place" && /checked out early/.test(r[1])));
  assert("CSV: no plain 'Podium:' rows in a division session (no duplicate overall block)", !table.rows.some((r) => /^Podium: /.test(r[0])));
  const legacyTable = buildSessionReportExportTable({ ...report, finalPodiums: undefined });
  assert("CSV: a report saved without finalPodiums falls back to the overall rows", legacyTable.rows.some((r) => r[0] === "Podium: Champion" && /^Rina/.test(r[1])));

  const summary = buildOpenPlayFinalSummary(base, { sessionCode: "ABC123", endedAt: NOW });
  assert("public final summary carries `podiums` (2 groups) and keeps `podium` for older viewers", summary.podiums.length === 2 && summary.podium.length === 3);
  const allowedPlace = ["rank", "label", "name", "wins", "losses", "games", "winPct", "out"];
  assert("public podiums: group = division + label + places; places = name + results only", summary.podiums.every((g) => Object.keys(g).sort().join() === "division,label,places") && summary.podiums.every((g) => g.places.every((p) => Object.keys(p).every((k) => allowedPlace.includes(k)))));
  const ser = JSON.stringify(summary);
  assert("PRIVACY: no ids / photos / ratings / payment anywhere in the serialized summary (division names are the one deliberate addition)", !/playerId|photo|data:|rating|payment|gcash|paid|partnerId|checkedIn|"id"/i.test(ser));
  const flatSummary = buildOpenPlayFinalSummary({ ...base, rotationMode: "continuous" }, { sessionCode: "ABC123", endedAt: NOW });
  assert("non-division session summary: podiums = one group with division null", flatSummary.podiums.length === 1 && flatSummary.podiums[0].division === null);
}

console.log("\n6. Wiring — every surface renders PodiumBoard");
{
  const board = strip(read("src/components/PodiumBoard.jsx"));
  assert("PodiumBoard: one podium -> plain PodiumPanel (old look preserved)", /if \(podiums\.length === 1\) return <PodiumPanel podium=\{podiums\[0\]\}/.test(board));
  assert("PodiumBoard: locked -> ONE banner titled for both divisions", /if \(!final && !lead\.unlocked\)/.test(board) && /podiums\.map\(\(p\) => p\.divisionLabel\)\.join\(" & "\)/.test(board));
  assert("PodiumBoard: unlocked -> one heading/status, Congratulations once when final, nested panels per division", /\{final && <p style=\{s\.congrats\}>Congratulations!<\/p>\}/.test(board) && /<PodiumPanel key=\{p\.division \|\| "overall"\} podium=\{p\} dark=\{dark\} nested/.test(board));
  const panel = strip(read("src/components/PodiumPanel.jsx"));
  assert("PodiumPanel: nested mode titles by division and leaves status/congrats to the board", /nested = false/.test(panel) && /podium\.divisionLabel \? `\$\{podium\.divisionLabel\}\$\{nested \? "" : " Podium"\}`/.test(panel) && /\{!nested && <p style=\{s\.status\}>\{status\}<\/p>\}/.test(panel) && /\{podium\.final && !nested && <p style=\{s\.congrats\}>/.test(panel));
  assert("PodiumPanel exposes data-division for tests/styling", /data-division=\{podium\.division \|\| undefined\}/.test(panel));
  const ps = read("src/podiumStyles.js");
  assert("podiumStyles: boardGrid (auto-fit, stacks when narrow) + divisionTitle", /boardGrid: \{[\s\S]*?repeat\(auto-fit, minmax\(/.test(ps) && /divisionTitle: \{/.test(ps));
  for (const [f, re] of [
    ["src/components/BoardView.jsx", /computePodiums\(state, now\)[\s\S]*<PodiumBoard podiums=\{podiums\} \/>/],
    ["src/components/StandingsView.jsx", /computePodiums\(state, now\)[\s\S]*podiumMedalRanks\(podiums\)[\s\S]*<PodiumBoard podiums=\{podiums\} \/>/],
    ["src/components/OpenPlayTVModePage.jsx", /computePodiums\(session,[\s\S]*podiumMedalRanks\(podiums\)[\s\S]*<PodiumBoard podiums=\{podiums\} dark \/>/],
    ["src/components/SessionAnalyticsReport.jsx", /finalPodiumsForDisplay\(finalPodiums \|\| finalPodium\)[\s\S]*<PodiumBoard podiums=\{podiums\} \/>/],
  ]) {
    assert(`${f} renders PodiumBoard`, re.test(strip(read(f))));
    assert(`${f} no longer renders PodiumPanel directly`, !/<PodiumPanel /.test(strip(read(f))));
  }
  const fixedRules = read("src/lib/fixedPairRules.js");
  assert("fixedPairRules shares lib/divisions.js (one definition of a division)", /from "\.\/divisions\.js"/.test(fixedRules) && !/skill === "intermediate"/.test(strip(fixedRules)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
