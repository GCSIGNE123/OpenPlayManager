// Live court-name PARITY across Organizer, Public Live Viewer and TV/Display.
//
// Pro decides a court's label with courtDisplayName (src/lib/utils.js) — used
// by the organizer CourtCard, Open Play TV mode and Tournament Display. The
// public Live Viewer lives in the Player repo and carries a copy of that one
// rule (pickleking-player/src/lib/courtDisplayName.js). This test imports BOTH
// helpers and BOTH sides' pure view builders and proves every surface shows
// the identical label:
//   Open Play:   renamed court  -> custom name  in Organizer + Public Viewer + TV
//   Tournament:  renamed court  -> custom name  in Organizer + Public Viewer + Display
//   Default:     null/''/missing -> "Court N"   everywhere
// If the sibling Player repo is not checked out next to this one, the
// cross-repo checks are skipped (reported, not failed); the Pro-side checks
// still run.
//
// Usage: node scripts/verify-live-court-name-parity.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

globalThis.window = { storage: {} };
const here = path.dirname(fileURLToPath(import.meta.url));
const proRoot = path.join(here, "..");
const playerRoot = path.join(proRoot, "..", "pickleking-player");
const havePlayer = fs.existsSync(path.join(playerRoot, "src", "lib", "publicLiveModel.js"));

const { courtDisplayName: proCourtName, renameCourt } = await import("../src/lib/utils.js");
const { emptyCourt } = await import("../src/lib/constants.js");
const { makeCourt } = await import("../src/lib/tournamentModel.js");

let pass = 0, fail = 0, skipped = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const readPro = (p) => fs.readFileSync(path.join(proRoot, p), "utf8");
const readPlayer = (p) => fs.readFileSync(path.join(playerRoot, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const importPlayer = (p) => import(pathToFileURL(path.join(playerRoot, p)).href);

console.log(`\nSetup: sibling Player repo ${havePlayer ? "found" : "NOT found — cross-repo checks skipped"}`);

let playerName, openPlayLiveView, tournamentLiveView;
if (havePlayer) {
  ({ courtDisplayName: playerName } = await importPlayer("src/lib/courtDisplayName.js"));
  ({ openPlayLiveView } = await importPlayer("src/lib/publicLiveModel.js"));
  ({ tournamentLiveView } = await importPlayer("src/lib/publicTournamentModel.js"));
}

console.log("\n1. The two helpers implement the identical rule");
if (havePlayer) {
  const cases = [
    { number: 1, name: "Center Court" }, { number: 1, name: null }, { number: 1, name: "" }, { number: 7 }, { number: 3, name: "  Padded  " },
    { number: 2, name: "Court 9" }, { id: "x", number: 4, name: undefined }, undefined, null, {},
  ];
  assert("both helpers agree on every input (custom, null, empty, missing, odd)", cases.every((c) => proCourtName(c) === playerName(c)));
  assert("custom name wins; null/''/missing fall back to Court N", playerName({ number: 1, name: "Center Court" }) === "Center Court" && playerName({ number: 1, name: null }) === "Court 1" && playerName({ number: 1, name: "" }) === "Court 1");
  const a = strip(readPro("src/lib/utils.js").match(/export function courtDisplayName[\s\S]*?\r?\n}\r?\n/)?.[0] || "");
  const b = strip(readPlayer("src/lib/courtDisplayName.js").match(/export function courtDisplayName[\s\S]*?\r?\n}\r?\n/)?.[0] || "");
  assert("the two function bodies are textually identical (a copy, not a second rule)", a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim() && a.length > 20);
} else { skipped++; console.log("  (skipped)"); }

console.log("\n2. OPEN PLAY: renamed court -> same label in Organizer + Public Viewer + TV mode");
{
  let state = { courts: [emptyCourt(1), emptyCourt(2), emptyCourt(3)] };
  state = renameCourt(state, 1, "Center Court");
  state = { ...state, players: { a: { id: "a", name: "Ana", checkedIn: true }, b: { id: "b", name: "Ben", checkedIn: true }, c: { id: "c", name: "Cara", checkedIn: true }, d: { id: "d", name: "Dan", checkedIn: true } }, venue: "Sat", queueIds: [], nextMatchups: [] };
  state.courts = state.courts.map((c) => (c.number === 3 ? c : { ...c, status: "live", teamA: ["a", "b"], teamB: ["c", "d"] }));
  const reloaded = JSON.parse(JSON.stringify(state)); // what every device reads back from the shared session record
  const organizer = reloaded.courts.map((c) => proCourtName(c)); // CourtCard's rule
  const tv = reloaded.courts.map((c) => proCourtName(c)); // OpenPlayTVModePage's rule (same helper — asserted below)
  assert("Organizer shows the custom name; unrenamed courts show Court N", organizer[0] === "Center Court" && organizer[1] === "Court 2" && organizer[2] === "Court 3");
  assert("TV mode label === Organizer label for every court", tv.every((l, i) => l === organizer[i]));
  if (havePlayer) {
    const pub = openPlayLiveView(reloaded).liveCourts.map((c) => c.label);
    assert("Public Live Viewer shows the same labels for the live courts (Center Court, Court 2)", pub[0] === organizer[0] && pub[1] === organizer[1] && pub.length === 2);
  } else { skipped++; console.log("  (public-viewer check skipped)"); }
  const tvSrc = strip(readPro("src/components/OpenPlayTVModePage.jsx"));
  const cardSrc = strip(readPro("src/components/CourtCard.jsx"));
  assert("TV mode and the organizer CourtCard both render through courtDisplayName", /\{courtDisplayName\(court\)\}/.test(tvSrc) && /courtDisplayName\(court\)/.test(cardSrc) && !/Court \{court\.number\}/.test(tvSrc));
}

console.log("\n3. TOURNAMENT: renamed court -> same label in Organizer + Public Viewer + Tournament Display");
{
  const named = { ...makeCourt(1, "Championship Court") };
  const plain = makeCourt(2);
  const legacy = { id: "old", number: 3, status: "available" }; // no name field at all
  const tournament = { id: "T1", name: "Spring", format: "roundRobin", mode: "doubles", status: "running", createdAt: 1, courts: [named, plain, legacy], pools: [], bracket: null };
  const reloaded = JSON.parse(JSON.stringify(tournament));
  const organizer = reloaded.courts.map((c) => proCourtName(c));
  assert("Organizer board: custom name / stored default / legacy fallback", organizer[0] === "Championship Court" && organizer[1] === "Court 2" && organizer[2] === "Court 3");
  if (havePlayer) {
    const pub = tournamentLiveView(reloaded, { venue: "Spring Day" }).courts.map((c) => c.label);
    assert("Public Live Viewer board shows exactly the organizer labels", pub.every((l, i) => l === organizer[i]) && pub.length === 3);
  } else { skipped++; console.log("  (public-viewer check skipped)"); }
  const disp = strip(readPro("src/components/TournamentDisplayView.jsx"));
  const board = strip(readPro("src/components/TournamentCourtsView.jsx"));
  assert("Tournament Display and the organizer board both render through courtDisplayName", /\{courtDisplayName\(court\)\}/.test(disp) && !/\{court\.name\}/.test(disp) && /\{courtDisplayName\(court\)\}/.test(board));
}

console.log("\n4. DEFAULT: missing/null court name -> Court N everywhere");
{
  const courts = [{ number: 5, name: null }, { number: 6, name: "" }, { number: 7 }];
  assert("Pro helper: Court 5 / Court 6 / Court 7", courts.map(proCourtName).join("|") === "Court 5|Court 6|Court 7");
  if (havePlayer) {
    const state = { players: {}, courts: courts.map((c) => ({ ...c, status: "live", teamA: [], teamB: [] })), queueIds: [], nextMatchups: [] };
    assert("Public Open Play viewer: Court 5 / Court 6 / Court 7", openPlayLiveView(state).liveCourts.map((c) => c.label).join("|") === "Court 5|Court 6|Court 7");
    const t = { id: "T", format: "roundRobin", courts: courts.map((c, i) => ({ id: "c" + i, ...c, status: "available" })), pools: [] };
    assert("Public Tournament viewer: Court 5 / Court 6 / Court 7", tournamentLiveView(t).courts.map((c) => c.label).join("|") === "Court 5|Court 6|Court 7");
  } else { skipped++; console.log("  (public-viewer checks skipped)"); }
}

console.log("\n5. The public viewer contains no second naming rule (Player repo source)");
if (havePlayer) {
  const files = ["src/lib/publicLiveModel.js", "src/lib/publicTournamentModel.js", "src/components/PublicLiveViewer.jsx"];
  assert("every viewer file that labels a court goes through courtDisplayName", /import \{ courtDisplayName \} from "\.\/courtDisplayName\.js"/.test(readPlayer(files[0])) && /import \{ courtDisplayName \} from "\.\/courtDisplayName\.js"/.test(readPlayer(files[1])));
  assert("no `name ? name : Court N` rule is re-implemented in the viewer", files.every((f) => !/\.name\s*\?\s*[^:]+:\s*`Court/.test(strip(readPlayer(f))) && !/\.name\s*\|\|\s*`Court/.test(strip(readPlayer(f)))));
} else { skipped++; console.log("  (skipped)"); }

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} cross-repo group(s) skipped` : ""}`);
if (fail > 0) process.exit(1);
