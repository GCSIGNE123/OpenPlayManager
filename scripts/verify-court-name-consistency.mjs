// Live Court Name consistency — regression test.
// BUG: an organizer could rename a court (CourtCard showed the custom name),
// but Open Play TV mode hard-coded "Court {court.number}" and Tournament
// Display rendered court.name directly, so TV/Display could still say
// "Court 1". Every human-facing court label must go through the ONE canonical
// helper, courtDisplayName(court) in src/lib/utils.js — while court numbers /
// ids stay real identifiers everywhere else.
//
// Calls the real helper/actions; the component checks are source-level
// (these scripts have no DOM), backed by a browser check done separately.
//
// Usage: node scripts/verify-court-name-consistency.mjs
import fs from "node:fs";

globalThis.window = { storage: {} };
const { courtDisplayName, renameCourt } = await import("../src/lib/utils.js");
const { emptyCourt, resetCourtForNextMatch } = await import("../src/lib/constants.js");
const { makeCourt: makeTournamentCourt } = await import("../src/lib/tournamentModel.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("\nA. The canonical rule (courtDisplayName)");
{
  assert("custom name is preferred: { number: 1, name: 'Center Court' } -> Center Court", courtDisplayName({ number: 1, name: "Center Court" }) === "Center Court");
  assert("null name falls back: { number: 1, name: null } -> Court 1", courtDisplayName({ number: 1, name: null }) === "Court 1");
  assert("empty name falls back: { number: 1, name: '' } -> Court 1", courtDisplayName({ number: 1, name: "" }) === "Court 1");
  assert("missing name falls back: { number: 4 } -> Court 4", courtDisplayName({ number: 4 }) === "Court 4");
  assert("a number-keyed fallback never uses ids: { id: 'x', number: 7 } -> Court 7", courtDisplayName({ id: "x", number: 7 }) === "Court 7");
}

console.log("\nB. Renamed court survives save/reload and reset (Open Play)");
{
  let state = { courts: [emptyCourt(1), emptyCourt(2)] };
  state = renameCourt(state, 1, "Center Court");
  assert("rename stores the label, leaves number untouched", state.courts[0].name === "Center Court" && state.courts[0].number === 1 && state.courts[1].name === null);
  const reloaded = JSON.parse(JSON.stringify(state)); // what a Supabase-stored session reload gives back
  assert("after a reload (JSON round trip) the organizer label is still Center Court", courtDisplayName(reloaded.courts[0]) === "Center Court");
  assert("...and the TV/display read of the SAME court object gives the identical string", courtDisplayName(reloaded.courts[0]) === courtDisplayName(state.courts[0]));
  assert("the unrenamed court still reads Court 2", courtDisplayName(reloaded.courts[1]) === "Court 2");
  const finished = { ...reloaded.courts[0], status: "finished", teamA: ["a", "b"], teamB: ["c", "d"] };
  assert("the label survives an end-of-match reset", courtDisplayName(resetCourtForNextMatch(finished)) === "Center Court");
  const blank = renameCourt(state, 1, "   ");
  assert("a blank rename resets to Court 1 (stored null)", blank.courts[0].name === null && courtDisplayName(blank.courts[0]) === "Court 1");
}

console.log("\nC. Tournament courts read identically in the organizer board and the TV Display");
{
  const named = makeTournamentCourt(3, "Pickle Palace");
  const plain = makeTournamentCourt(4);
  assert("a named tournament court shows its custom name", courtDisplayName(named) === "Pickle Palace");
  assert("an unnamed tournament court still reads Court 4 (its stored default and the helper agree)", plain.name === "Court 4" && courtDisplayName(plain) === "Court 4");
  const derived = { ...named, derivedStatus: "occupied", currentMatch: null }; // CourtAssignmentService spreads the court
  assert("the derived court object (what both boards render) resolves to the same label", courtDisplayName(derived) === courtDisplayName(named));
  assert("a legacy tournament court with no name falls back to Court N", courtDisplayName({ id: "c", number: 2, status: "available" }) === "Court 2");
}

console.log("\nD. Every human-facing court label uses the canonical helper (source checks)");
{
  const tv = strip(read("src/components/OpenPlayTVModePage.jsx"));
  assert("Open Play TV imports courtDisplayName from lib/utils.js", /import \{ courtDisplayName \} from "\.\.\/lib\/utils\.js"/.test(tv));
  assert("Open Play TV no longer hard-codes 'Court {court.number}'", !/Court \{court\.number\}/.test(tv));
  assert("Open Play TV live court card renders courtDisplayName(court)", /<span style=\{ts\.courtName\(sizeColumns\)\}>\{courtDisplayName\(court\)\}<\/span>/.test(tv));
  assert("Open Play TV 'Up Next' court label resolves through the helper (no bare Court {match.court})", !/Court \{match\.court\}/.test(tv) && /courtLabel\(match\.court\)/.test(tv) && /courts=\{session\.courts\}/.test(tv));
  assert("Open Play TV still keys/identifies courts by number (identifier unchanged)", /key=\{court\.number\}/.test(tv) && /x\.number === n/.test(tv));

  const td = strip(read("src/components/TournamentDisplayView.jsx"));
  assert("Tournament Display imports courtDisplayName from lib/utils.js", /import \{ courtDisplayName \} from "\.\.\/lib\/utils\.js"/.test(td));
  assert("Tournament Display renders courtDisplayName(court), not court.name", /\{courtDisplayName\(court\)\}/.test(td) && !/\{court\.name\}/.test(td));
  assert("Tournament Display still keys courts by court.id (identifier unchanged)", /key=\{court\.id\}/.test(td));

  const tc = strip(read("src/components/TournamentCourtsView.jsx"));
  assert("Tournament organizer court board uses courtDisplayName for the card title and every court picker", /\{courtDisplayName\(court\)\}/.test(tc) && (tc.match(/\{courtDisplayName\(c\)\}/g) || []).length === 4 && !/\{c\.name\}/.test(tc) && !/\{court\.name\}/.test(tc));
  assert("Tournament court pickers still submit the numeric court.number as the option value", (tc.match(/value=\{c\.number\}/g) || []).length === 4);

  const cc = strip(read("src/components/CourtCard.jsx"));
  assert("the organizer Open Play CourtCard already used courtDisplayName (unchanged rule)", /courtDisplayName\(court\)\.toUpperCase\(\)/.test(cc));
  const ann = strip(read("src/components/TournamentDashboardView.jsx"));
  assert("tournament announcements already used courtDisplayName(court)", /courtDisplayName\(court\)/.test(ann));
  const app = strip(read("src/PickleballOpenPlay.jsx"));
  assert("Open Play announcements / dispatch log labels already use courtDisplayName", (app.match(/courtDisplayName\(/g) || []).length >= 4);
}

console.log("\nE. No second naming rule was introduced, and identifiers are untouched");
{
  const files = ["src/components/OpenPlayTVModePage.jsx", "src/components/TournamentDisplayView.jsx", "src/components/TournamentCourtsView.jsx"];
  assert("none of the changed components re-implement `court.name ? ... : Court N`", files.every((f) => !/\.name\s*\?\s*[^:]+:\s*`Court/.test(strip(read(f))) && !/\.name\s*\|\|\s*`Court/.test(strip(read(f)))));
  const utils = strip(read("src/lib/utils.js"));
  assert("courtDisplayName is still the single definition in lib/utils.js", (utils.match(/export function courtDisplayName/g) || []).length === 1 && /court\?\.name \? court\.name : `Court \$\{court\?\.number\}`/.test(utils));
  assert("renameCourt still keys by number and never rewrites it", /c\.number === courtNumber \? \{ \.\.\.c, name: nextName \}/.test(utils));
  const app = strip(read("src/PickleballOpenPlay.jsx"));
  assert("dispatch / scoring / matchHistory still use court.number (record shape unchanged)", /court: court\.number/.test(app));
  const tvSrc = strip(read("src/components/OpenPlayTVModePage.jsx"));
  assert("the TV still derives status from the court object, not its label", /function deriveCourtStatus\(court\)/.test(tvSrc));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
