// Same-Division Fixed Pairs — automated, headless coverage of
// lib/fixedPairRules.js, the setFixedPartner enforcement in
// lib/queueManagement.js, the pair dissolve inside lib/utils.js's
// changePlayerSkill, plus source-level wiring checks for the app wrapper,
// endMatch's automatic promotion/relegation and both Partner dropdowns.
// See FEATURES.md ("Same-Division Fixed Pairs").
//
// Usage: node scripts/verify-same-division-pairs.mjs
import fs from "node:fs";
import {
  SAME_DIVISION_PAIR_MODES,
  divisionOf,
  divisionLabel,
  sameDivision,
  pairRuleApplies,
  fixedPairBlockReason,
  splitPairIfCrossDivision,
  pairDissolvedText,
} from "../src/lib/fixedPairRules.js";
import { setFixedPartner, clearFixedPartner } from "../src/lib/queueManagement.js";
import { changePlayerSkill } from "../src/lib/utils.js";
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

const mk = (id, name, skill, extra = {}) => ({ id, name, skill, checkedIn: true, status: "ACTIVE", games: 0, wins: 0, losses: 0, streak: 0, lossStreak: 0, partnerId: null, ...extra });
const base = (rotationMode, players) => ({ ...defaultState, rotationMode, players, queueIds: Object.keys(players), nextMatchups: [], courts: [], skillChangeLog: [] });
const roster = () => ({
  b1: mk("b1", "Guil", "beginner"),
  b2: mk("b2", "Anjo", "beginner"),
  i1: mk("i1", "Rina", "intermediate"),
  i2: mk("i2", "Paolo", "intermediate"),
  u1: mk("u1", "Unset", undefined), // no skill recorded -> Beginner division, like the engine
});

console.log("\n--- divisions ---");
assert("skill 'intermediate' -> Intermediate; anything else -> Beginner (engine's own test)", divisionOf(mk("x", "x", "intermediate")) === "intermediate" && divisionOf(mk("x", "x", "beginner")) === "beginner" && divisionOf(mk("x", "x", undefined)) === "beginner" && divisionOf(undefined) === "beginner");
assert("labels", divisionLabel("intermediate") === "Intermediate" && divisionLabel("beginner") === "Beginner");
assert("sameDivision", sameDivision(roster().b1, roster().u1) && !sameDivision(roster().b1, roster().i1));

console.log("\n--- rule scope ---");
assert("applies to Skill Divisions only", JSON.stringify(SAME_DIVISION_PAIR_MODES) === JSON.stringify(["adaptiveSkill"]));
assert("pairRuleApplies: adaptiveSkill yes; continuous / progressiveSkill / winnerPool / tournament (no mode) no", pairRuleApplies({ rotationMode: "adaptiveSkill" }) && !pairRuleApplies({ rotationMode: "continuous" }) && !pairRuleApplies({ rotationMode: "progressiveSkill" }) && !pairRuleApplies({ rotationMode: "winnerPool" }) && !pairRuleApplies({}) && !pairRuleApplies(undefined));

console.log("\n--- fixedPairBlockReason ---");
{
  const s = base("adaptiveSkill", roster());
  assert("same division -> allowed (null)", fixedPairBlockReason(s, s.players.b1, s.players.b2) === null && fixedPairBlockReason(s, s.players.i1, s.players.i2) === null);
  assert("unset skill counts as Beginner -> allowed with a Beginner", fixedPairBlockReason(s, s.players.b1, s.players.u1) === null);
  const reason = fixedPairBlockReason(s, s.players.b1, s.players.i1);
  assert("cross division -> organizer sentence names both players and both divisions", typeof reason === "string" && /Guil is Beginner/.test(reason) && /Rina is Intermediate/.test(reason) && /same division/.test(reason));
  assert("missing player -> null (never throws)", fixedPairBlockReason(s, s.players.b1, undefined) === null);
  const mixed = base("progressiveSkill", roster());
  assert("Progressive Skill (mentorship pairs beginner+intermediate on purpose) -> allowed", fixedPairBlockReason(mixed, mixed.players.b1, mixed.players.i1) === null);
  const cont = base("continuous", roster());
  assert("Continuous Queue -> allowed", fixedPairBlockReason(cont, cont.players.b1, cont.players.i1) === null);
}

console.log("\n--- setFixedPartner enforcement (lib/queueManagement.js) ---");
{
  const s = base("adaptiveSkill", roster());
  const same = setFixedPartner(s, "b1", "b2");
  assert("same-division pair is set, both sides", same.players.b1.partnerId === "b2" && same.players.b2.partnerId === "b1");
  const cross = setFixedPartner(s, "b1", "i1");
  assert("cross-division pair is refused as a no-op (same state object)", cross === s && cross.players.b1.partnerId === null && cross.players.i1.partnerId === null);
  const reassign = setFixedPartner(same, "b1", "i1");
  assert("refused pair does NOT clear an existing valid pair as a side effect", reassign === same && reassign.players.b1.partnerId === "b2" && reassign.players.b2.partnerId === "b1");
  const other = setFixedPartner(base("continuous", roster()), "b1", "i1");
  assert("Continuous Queue still accepts a cross-level pair", other.players.b1.partnerId === "i1" && other.players.i1.partnerId === "b1");
  const prog = setFixedPartner(base("progressiveSkill", roster()), "b1", "i1");
  assert("Progressive Skill still accepts a cross-level pair", prog.players.b1.partnerId === "i1");
  const cleared = clearFixedPartner(same, "b1");
  assert("clearFixedPartner untouched", cleared.players.b1.partnerId === null && cleared.players.b2.partnerId === null);
}

console.log("\n--- splitPairIfCrossDivision ---");
{
  const s = base("adaptiveSkill", roster());
  const paired = setFixedPartner(s, "b1", "b2").players;
  const untouched = splitPairIfCrossDivision(paired, "b1", s);
  assert("pair still in one division -> same map object, partner null", untouched.players === paired && untouched.partner === null);
  const promoted = { ...paired, b1: { ...paired.b1, skill: "intermediate" } };
  const split = splitPairIfCrossDivision(promoted, "b1", s);
  assert("pair now spanning divisions -> both partnerIds cleared, partner returned", split.players.b1.partnerId === null && split.players.b2.partnerId === null && split.partner?.id === "b2");
  assert("input map not mutated", promoted.b1.partnerId === "b2" && promoted.b2.partnerId === "b1");
  assert("no partner -> no-op", splitPairIfCrossDivision(roster(), "b1", s).partner === null);
  const inOtherMode = splitPairIfCrossDivision(promoted, "b1", base("continuous", roster()));
  assert("other modes never dissolve a pair", inOtherMode.players === promoted && inOtherMode.partner === null);
  assert("notice text names both players", /Guil & Anjo/.test(pairDissolvedText("Guil", "Anjo")) && /different divisions/.test(pairDissolvedText("Guil", "Anjo")));
}

console.log("\n--- changePlayerSkill (manual → INT / → BEG) dissolves a split pair ---");
{
  const s = setFixedPartner(base("adaptiveSkill", roster()), "b1", "b2");
  const next = changePlayerSkill(s, "b1", "intermediate");
  assert("promoted player's skill changed, streaks reset (existing behaviour)", next.players.b1.skill === "intermediate" && next.players.b1.streak === 0);
  assert("pair dissolved on both sides", next.players.b1.partnerId === null && next.players.b2.partnerId === null);
  assert("skill change still logged (existing behaviour)", next.skillChangeLog[0].playerId === "b1" && next.skillChangeLog[0].newSkill === "intermediate");
  const both = changePlayerSkill(changePlayerSkill(s, "b1", "intermediate"), "b2", "intermediate");
  assert("moving the partner too does not resurrect the pair (organizer re-pairs explicitly)", both.players.b1.partnerId === null && both.players.b2.partnerId === null);
  const cont = changePlayerSkill(setFixedPartner(base("continuous", roster()), "b1", "b2"), "b1", "intermediate");
  assert("Continuous Queue: a level change keeps the pair", cont.players.b1.partnerId === "b2" && cont.players.b2.partnerId === "b1");
  const noPartner = changePlayerSkill(base("adaptiveSkill", roster()), "b1", "intermediate");
  assert("no partner -> plain skill change", noPartner.players.b1.skill === "intermediate" && noPartner.players.b1.partnerId === null);
}

console.log("\n--- wiring ---");
{
  const app = strip(read("src/PickleballOpenPlay.jsx"));
  assert("app imports the rule helpers", /import \{ fixedPairBlockReason, splitPairIfCrossDivision, pairDissolvedText \} from "\.\/lib\/fixedPairRules\.js"/.test(app));
  assert("setFixedPartner wrapper shows the reason and returns before saving", /const blocked = fixedPairBlockReason\(state, state\.players\[playerIdA\], state\.players\[playerIdB\]\);\s*if \(blocked\) \{\s*setSkillChangeMsg\(blocked\);[\s\S]*?return;\s*\}/.test(app));
  assert("changePlayerSkill wrapper appends the pair-dissolved notice", /pairRemoved \? ` \$\{pairDissolvedText\(entry\.playerName/.test(app));
  assert("endMatch automatic promotion/relegation dissolves split pairs in the same players copy", /skillChangeEntries\.forEach\(\(e\) => \{\s*const split = splitPairIfCrossDivision\(players, e\.playerId, state\);/.test(app) && /Object\.assign\(players, split\.players\);/.test(app) && /\.concat\(dissolvedPairNotices\)/.test(app));
  const qm = strip(read("src/lib/queueManagement.js"));
  assert("setFixedPartnerCore refuses a blocked pair before touching any partnerId", /if \(fixedPairBlockReason\(state, a, b\)\) return state;[\s\S]*?const players = \{ \.\.\.state\.players \};/.test(qm));
  const utils = strip(read("src/lib/utils.js"));
  assert("changePlayerSkill routes the new players map through splitPairIfCrossDivision", /const \{ players \} = splitPairIfCrossDivision\(/.test(utils));
  for (const f of ["src/components/WaitingPlayersPanel.jsx", "src/components/FixedPartnerPanel.jsx"]) {
    const src = strip(read(f));
    assert(`${f}: other division's names are disabled with the reason, not hidden`, /const blocked = Boolean\(fixedPairBlockReason\(state, p, other\)\);/.test(src) && /disabled=\{blocked\}/.test(src) && /other division/.test(src));
  }
  assert("lib/fixedPairRules.js has no imports (no cycle with utils/queueManagement)", !/^import /m.test(read("src/lib/fixedPairRules.js")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
