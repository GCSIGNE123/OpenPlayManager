// Court Play Clock — headless coverage of lib/courtClock.js and its one
// call site in save(). See FEATURES.md ("Court play clock").
//
// Usage: node scripts/verify-court-clock.mjs
import fs from "node:fs";
import { stampCourtClocks, courtElapsedText } from "../src/lib/courtClock.js";
import { emptyCourt } from "../src/lib/constants.js";

let pass = 0, fail = 0;
const assert = (d, c) => { if (c) { pass++; console.log(`  ok ${d}`); } else { fail++; console.log(`  FAIL: ${d}`); } };
const NOW = 1_800_000_000_000;
const live = (n, a, b, extra = {}) => ({ ...emptyCourt(n), status: "live", teamA: a, teamB: b, ...extra });

const open = [emptyCourt(1), emptyCourt(2)];
assert("open courts: nothing to stamp, same array back", stampCourtClocks(open, open, NOW) === open);
const started = [live(1, ["a", "b"], ["c", "d"]), emptyCourt(2)];
const s1 = stampCourtClocks(open, started, NOW);
assert("a court going live is stamped with now; the open court is untouched", s1[0].liveSince === NOW && s1[1] === started[1]);
const s2 = stampCourtClocks(s1, s1, NOW + 60000);
assert("still live a minute later: stamp kept, same array back", s2 === s1 && s2[0].liveSince === NOW);
const scored = s1.map((c, i) => (i === 0 ? { ...c, scoreA: 5 } : c));
assert("a score change keeps the clock", stampCourtClocks(s1, scored, NOW + 90000)[0].liveSince === NOW);
const subbed = s1.map((c, i) => (i === 0 ? { ...c, teamB: ["c", "e"] } : c));
assert("one substitution keeps the clock running", stampCourtClocks(s1, subbed, NOW + 90000)[0].liveSince === NOW);
const newGame = s1.map((c, i) => (i === 0 ? { ...c, teamA: ["w", "x"], teamB: ["y", "z"] } : c));
assert("a different four on the same court restarts the clock", stampCourtClocks(s1, newGame, NOW + 500000)[0].liveSince === NOW + 500000);
const finished = s1.map((c, i) => (i === 0 ? { ...c, status: "finished" } : c));
assert("a finished court keeps its stamp", stampCourtClocks(s1, finished, NOW + 700000)[0].liveSince === NOW);
const undone = finished.map((c, i) => (i === 0 ? { ...c, status: "live" } : c));
assert("finished -> live again (winner cleared) keeps the same clock", stampCourtClocks(finished, undone, NOW + 800000)[0].liveSince === NOW);
const ended = s1.map((c, i) => (i === 0 ? { ...emptyCourt(1), liveSince: NOW } : c));
assert("a court that is open again loses its stamp", stampCourtClocks(s1, ended, NOW + 900000)[0].liveSince === null);
const dispatching = [{ ...live(1, ["a", "b"], ["c", "d"]), status: "dispatching" }];
assert("dispatching (calling players) is not timed yet", stampCourtClocks(open, dispatching, NOW) === dispatching);
const reload = [live(1, ["a", "b"], ["c", "d"], { liveSince: NOW - 5000 })];
assert("first save after a reload (no previous courts) trusts the stored stamp", stampCourtClocks(undefined, reload, NOW) === reload);
assert("non-array input is passed through", stampCourtClocks(open, undefined, NOW) === undefined);
assert("elapsed text m:ss; null without a stamp; never negative", courtElapsedText({ liveSince: NOW - 429000 }, NOW) === "7:09" && courtElapsedText({ liveSince: NOW - 786000 }, NOW) === "13:06" && courtElapsedText({}, NOW) === null && courtElapsedText({ liveSince: NOW + 5000 }, NOW) === "0:00");
const app = fs.readFileSync(new URL("../src/PickleballOpenPlay.jsx", import.meta.url), "utf8");
assert("save() stamps the clocks once, just before the record is written", /courts: stampCourtClocks\(stateRef\.current\.courts, withDispatch\.courts, now\)/.test(app) && app.indexOf("stampCourtClocks(stateRef") < app.indexOf("setState(withStamp)"));
assert("lib/courtClock.js is pure", !/react|supabase|localStorage|fetch\(/i.test(fs.readFileSync(new URL("../src/lib/courtClock.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "")));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
