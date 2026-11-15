// Phone layout guards (source-level) for four bugs found in a GUI review at
// 390px / 360px: the tab strip stretching and sliding the whole app shell,
// the Next Match card's teams overlapping, the Last name box running off
// the screen, and the Alerts panel opening off the left edge.
//
// Usage: node scripts/verify-phone-layout.mjs
import fs from "node:fs";
import { styles } from "../src/styles.js";

let pass = 0, fail = 0;
const assert = (desc, cond) => { cond ? pass++ : fail++; console.log(`  ${cond ? "ok" : "FAIL:"} ${desc}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

assert("tab strip scrolls on its own (overflowX auto) instead of stretching the shell", styles.nav.overflowX === "auto" && styles.nav.display === "flex");
assert("tabs never shrink or wrap inside the strip", styles.navBtn.flexShrink === 0 && styles.navBtn.whiteSpace === "nowrap");
assert("inputs can shrink inside a row (minWidth 0)", styles.input.minWidth === 0 && styles.input.flex === 1);
assert("stackable team layout wraps and gives each team a minimum width", styles.matchupTeamsStackable.flexWrap === "wrap" && /^1 1 \d+px$/.test(styles.matchupTeamStackable.flex) && styles.matchupTeamStackable.minWidth === 0);
const card = read("src/components/NextMatchupCard.jsx");
assert("Next Match card uses the stackable layout for both teams", (card.match(/styles\.matchupTeamStackable\}/g) || []).length === 2 && /styles\.matchupTeamsStackable\}/.test(card));
assert("other matchup lists keep the original side-by-side layout", styles.matchupTeams.flexWrap === undefined && /styles\.matchupTeams\}/.test(read("src/components/QueueList.jsx")));
const bell = read("src/components/AlertBell.jsx");
assert("Alerts panel is pinned to the viewport on a narrow screen", /window\.innerWidth < 520/.test(bell) && /position: "fixed"/.test(bell) && /\.\.\.styles\.alertPanel, \.\.\.narrowPlacement/.test(bell));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
