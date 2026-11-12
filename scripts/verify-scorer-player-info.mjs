// Scorer Player Info — source-level wiring checks for the Scorer tab's
// player rows: Beginner/Intermediate tag, games played (GP), waiting time,
// fixed-pair tag, and the two-line Active Players card layout. The
// components are plain React with inline styles, so this script checks
// the wiring (which surface renders what, and that no caller outside the
// Scorer tab picked up the new badges by accident) plus the pure helper
// `scorerInfoFor`. See FEATURES.md ("Scorer Player Info").
//
// Usage: node scripts/verify-scorer-player-info.mjs
import fs from "node:fs";

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
// Strip comments so a mention inside a comment can't satisfy (or trip) a check.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const count = (s, re) => (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) || []).length;

const styles = read("src/styles.js");
const chip = strip(read("src/components/PlayerChip.jsx"));
const teamRow = strip(read("src/components/TeamRow.jsx"));
const courtCard = strip(read("src/components/CourtCard.jsx"));
const nextCard = strip(read("src/components/NextMatchupCard.jsx"));
const waiting = strip(read("src/components/WaitingPlayersPanel.jsx"));
const fixedPartner = strip(read("src/components/FixedPartnerPanel.jsx"));
const boardView = strip(read("src/components/BoardView.jsx"));
const tvMode = strip(read("src/components/OpenPlayTVModePage.jsx"));

console.log("\n--- scorerInfoFor (pure helper) ---");
{
  // Evaluate the helper in isolation: it is a plain function exported next
  // to the component, so lift its source out rather than importing JSX.
  const src = chip.match(/export function scorerInfoFor\([\s\S]*?\n\}/)?.[0];
  assert("PlayerChip.jsx exports scorerInfoFor(player, players)", Boolean(src) && /scorerInfoFor\(player, players\)/.test(src));
  const scorerInfoFor = new Function(`${src.replace("export ", "")}; return scorerInfoFor;`)();
  const players = {
    a: { id: "a", name: "Guil", games: 4, partnerId: "b" },
    b: { id: "b", name: "Anjo", games: 4, partnerId: "a" },
    c: { id: "c", name: "Solo", games: 0 },
    d: { id: "d", name: "Dangling", games: 2, partnerId: "zzz" },
  };
  assert("games + partner name resolve for a paired player", JSON.stringify(scorerInfoFor(players.a, players)) === JSON.stringify({ games: 4, partnerName: "Anjo" }));
  assert("no partner -> partnerName null, games 0 stays 0", JSON.stringify(scorerInfoFor(players.c, players)) === JSON.stringify({ games: 0, partnerName: null }));
  assert("a partnerId that no longer resolves -> null, never a crash", scorerInfoFor(players.d, players).partnerName === null);
  assert("missing player object (ghost slot) -> null, so PlayerInfoBadges renders nothing", scorerInfoFor(undefined, players) === null);
  assert("missing players map -> safe", scorerInfoFor(players.a, undefined).partnerName === null);
}

console.log("\n--- PlayerChip: badges only when `info` is passed ---");
assert("PlayerChip accepts an `info` prop", /info[,\s}]/.test(chip.match(/export default function PlayerChip\(\{[\s\S]*?\}\)/)?.[0] || ""));
assert("PlayerInfoBadges renders nothing without info", /if \(!info\) return null;/.test(chip));
assert("GP badge shows games played", /GP \{info\.games\}/.test(chip) || /GP\s*\{info\.games\}/.test(chip));
assert("fixed-pair tag shows the partner's name with a link icon", /info\.partnerName && \(/.test(chip) && /<Link2/.test(chip) && /\{info\.partnerName\}/.test(chip));
assert("PlayerChip renders <PlayerInfoBadges info={info} />", /<PlayerInfoBadges info=\{info\} \/>/.test(chip));
assert("skill tag (BEG/INT) still rendered in PlayerChip", /skillTag\(player\.skill\)/.test(chip));

console.log("\n--- TeamRow: opt-in via showInfo ---");
assert("TeamRow accepts showInfo", /showInfo/.test(teamRow.match(/export default function TeamRow\(\{[\s\S]*?\}\)/)?.[0] || ""));
assert("TeamRow computes info only when showInfo", /info=\{showInfo \? scorerInfoFor\(players\[id\], players\) : undefined\}/.test(teamRow));

console.log("\n--- CourtCard: Scorer (hideAvatar) rows carry the info, Live Board does not ---");
{
  const teamRows = courtCard.match(/<TeamRow[\s\S]*?\/>/g) || [];
  assert(`every TeamRow in CourtCard passes showInfo={hideAvatar} (${teamRows.length} found)`, teamRows.length >= 6 && teamRows.every((t) => /showInfo=\{hideAvatar\}/.test(t)));
  assert("manual-slot chips show the badges in Scorer only", count(courtCard, /\{hideAvatar && <PlayerInfoBadges info=\{scorerInfoFor\(players\[id\], players\)\} \/>\}/) === 2);
  assert("CourtCard imports the helper + badges from PlayerChip", /import \{ PlayerInfoBadges, scorerInfoFor \} from "\.\/PlayerChip\.jsx"/.test(courtCard));
  assert("BoardView never passes hideAvatar/showInfo (Live Board unchanged)", !/hideAvatar|showInfo/.test(boardView));
  assert("TV Mode never passes showInfo (spectator surface unchanged)", !/showInfo|PlayerInfoBadges/.test(tvMode));
}

console.log("\n--- NextMatchupCard: Up Next chips carry GP + pair ---");
assert("both teams' chips get info", count(nextCard, /info=\{scorerInfoFor\(players\[id\], players\)\}/) === 2);
assert("NextMatchupCard imports scorerInfoFor", /import PlayerChip, \{ scorerInfoFor \} from "\.\/PlayerChip\.jsx"/.test(nextCard));

console.log("\n--- Active Players: two-line card layout ---");
assert("rows use rosterCard with a top row + stats row", /styles\.rosterCard/.test(waiting) && /styles\.rosterTopRow/.test(waiting) && /styles\.rosterStatsRow/.test(waiting));
assert("identity cluster: index, name, BEG/INT, pair tag, NEW, status, play status", /styles\.rosterIdentity/.test(waiting) && /skillTag\(p\.skill\)/.test(waiting) && /styles\.pairTag/.test(waiting) && /queueStatusTag\(queueStatus\)/.test(waiting) && /playStatusTag\(p\.playStatus\)/.test(waiting));
assert("pair tag resolves the partner from the full session roster (partner may be on court)", /state\?\.players\?\.\[p\.partnerId\]\?\.name/.test(waiting));
assert("actions grouped right: skill override, partner select, Skip, Prioritize, Hold, Check Out, remove", /styles\.rosterActions/.test(waiting) && /skillOverrideBtn/.test(waiting) && /partnerSelect/.test(waiting) && /onSkipPlayer\(p\.id\)/.test(waiting) && /onPrioritizeLatecomer\(p\.id\)/.test(waiting) && /onHoldPlayer\(p\.id\)/.test(waiting) && /setConfirmingPlayer\(p\)/.test(waiting) && /onRemove\(p\.id\)/.test(waiting));
assert("Check Out + remove wrap as one unit", /styles\.rosterExitGroup/.test(waiting));
assert("stats row: waiting timer, GP, W–L, RTG", /<WaitingTimer player=\{p\} \/>/.test(waiting) && /rosterStatLabel\}>GP</.test(waiting) && /rosterStatLabel\}>W–L</.test(waiting) && /rosterStatLabel\}>RTG</.test(waiting));
assert("GP reads the player's games (0 when unset)", /\{p\.games \|\| 0\}/.test(waiting));
assert("rating badge kept (with an em-dash placeholder before the first game)", /ratingBadge\(performance\.rating\)/.test(waiting) && /performance\.rating === null \?/.test(waiting));
{
  // Every handler the old flat row wired must still be wired — a layout
  // change must not drop a control.
  const handlers = ["onChangeSkill", "onSetPartner", "onClearPartner", "onSkipPlayer", "onPrioritizeLatecomer", "onHoldPlayer", "onResumePlayer", "onCheckout", "onRemove"];
  assert("all nine row handlers are still wired", handlers.every((h) => new RegExp(`${h}\\(`).test(waiting)));
  const li = waiting.match(/<li key=\{p\.id\} style=\{styles\.rosterCard\}[\s\S]*?<\/li>/)?.[0] || "";
  assert("the old flat rosterItem row is gone from Active Players", !/<li key=\{p\.id\} style=\{styles\.rosterItem\}/.test(waiting) && li.length > 0);
}

console.log("\n--- Fixed Partner panel: pair tag beside the name ---");
assert("FixedPartnerPanel shows the pair tag when a partner is set", /p\.partnerId && players\?\.\[p\.partnerId\]/.test(fixedPartner) && /styles\.pairTag/.test(fixedPartner) && /<Link2/.test(fixedPartner));

console.log("\n--- styles.js tokens ---");
for (const key of ["rosterCard", "rosterTopRow", "rosterIdentity", "rosterActions", "rosterExitGroup", "rosterStatsRow", "rosterStat", "rosterStatLabel", "rosterStatValue", "gpBadge", "pairTag"]) {
  assert(`styles.${key} defined once`, count(styles, new RegExp(`^  ${key}: \\{`, "m")) === 1);
}
assert("pair tag uses the orange accent tint", /pairTag: \{[\s\S]*?rgba\(247, ?148, ?29/.test(styles));
assert("stats row lines up under the name (indent = index width + gap)", /rosterStatsRow: \{[\s\S]*?paddingLeft: 21/.test(styles));
assert("action group may shrink + wrap on phones (no clipping)", /rosterActions: \{[\s\S]*?flexWrap: "wrap"[\s\S]*?maxWidth: "100%"/.test(styles));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
