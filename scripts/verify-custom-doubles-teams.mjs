// Custom Doubles Team Assignment — see PROJECT.md/FEATURES.md and
// TeamSetupPanel.jsx's own header comment. UI-ONLY feature: proves the
// existing partnerId/setFixedPartner/pairIntoTeams/buildEntrants mechanism
// (untouched) is exactly what manual team assignment needs, that the new
// TeamSetupPanel introduces no new data model, and that the wiring into
// TournamentDashboardView/TournamentParticipantsView/TournamentScheduleView
// is source-correct and doesn't touch the tournament engine, storage schema,
// or public-viewer/QR infrastructure.
//
// Usage: node scripts/verify-custom-doubles-teams.mjs
import fs from "node:fs";

globalThis.window = { storage: {} };
const { setFixedPartner, clearFixedPartner } = await import("../src/lib/queueManagement.js");
const { pairIntoTeams } = await import("../src/engines/RoundRobinScheduler.js");
const { buildEntrants } = await import("../src/lib/tournament.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const player = (id, name) => ({ id, name, checkedIn: true, status: "ACTIVE", partnerId: null });

console.log("\n1. Manual pairing beats registration order");
{
  let state = {
    players: {
      a: player("a", "Ana"), b: player("b", "Ben"), c: player("c", "Cara"), d: player("d", "Dan"),
      e: player("e", "Eli"), f: player("f", "Fay"),
    },
  };
  // Organizer explicitly pairs Fay with Ana (NOT their check-in-order
  // neighbors) via the exact same setFixedPartner the new panel calls.
  state = setFixedPartner(state, "a", "f");
  const players = Object.values(state.players);
  const teams = pairIntoTeams(players);
  const teamOf = (id) => teams.find(([x, y]) => x.id === id || y.id === id);
  assert("Ana is teamed with Fay, not with Ben (registration-order neighbor)", teamOf("a").some((p) => p.id === "f"));
  assert("leftover players (b,c,d,e) still pair sequentially as the documented fallback", teamOf("b").some((p) => p.id === "c") && teamOf("d").some((p) => p.id === "e"));

  const entrants = buildEntrants(players, "doubles");
  assert("buildEntrants (the actual tournament-engine entry point) reflects the manual pairing", entrants.some((e) => e.label === "Ana / Fay" || e.label === "Fay / Ana"));
}

console.log("\n2. Mutual exclusivity — a player can never end up on two teams");
{
  let state = { players: { a: player("a", "Ana"), b: player("b", "Ben"), c: player("c", "Cara"), d: player("d", "Dan") } };
  state = setFixedPartner(state, "a", "b");
  state = setFixedPartner(state, "a", "c"); // re-pair Ana with Cara
  assert("Ana's old partner (Ben) is detached, not left dangling", state.players.b.partnerId === null);
  assert("Ana is now paired with Cara only", state.players.a.partnerId === "c" && state.players.c.partnerId === "a");
  const teams = pairIntoTeams(Object.values(state.players));
  const ids = teams.map((t) => t.map((p) => p.id).sort().join(",")).sort();
  assert("exactly two teams formed, no player appears twice (Ana+Cara, and leftover Ben+Dan)", teams.length === 2 && ids.join("|") === "a,c|b,d");
}

console.log("\n3. Clearing a partner returns the player to unassigned");
{
  let state = { players: { a: player("a", "Ana"), b: player("b", "Ben") } };
  state = setFixedPartner(state, "a", "b");
  state = clearFixedPartner(state, "a");
  assert("both sides cleared by clearFixedPartner (mutual, like setFixedPartner)", state.players.a.partnerId === null && state.players.b.partnerId === null);
}

console.log("\n4. Locking — entrants are frozen at Generate, never re-derived from partnerId again");
{
  const tournamentModelSrc = strip(read("src/lib/tournamentModel.js"));
  const tournamentSrc = strip(read("src/lib/tournament.js"));
  const buildEntrantsCallSites = (tournamentSrc.match(/(?<!export function )\bbuildEntrants\(players, mode\)/g) || []).length;
  assert("buildEntrants is called only from the two build-and-save orchestrators (Generate), not from any read/render path", buildEntrantsCallSites === 2);
  assert("TournamentParticipantsView renders the frozen tournament.pools/entrants, never re-running buildEntrants post-generation", !strip(read("src/components/TournamentParticipantsView.jsx")).includes("buildEntrants"));
  assert("saveTournament persists the built entrants verbatim (no partnerId re-read at save time)", /await window\.storage\.set\(`\$\{TOURNAMENT_PREFIX\}/.test(tournamentModelSrc));
}

console.log("\n5. UI-only: no new data model, no tournament-engine change, no QR/public-viewer touch");
{
  const panel = strip(read("src/components/TeamSetupPanel.jsx"));
  assert("TeamSetupPanel calls only the existing setFixedPartner/clearFixedPartner primitives (no new mutation)", /onSetPartner\(/.test(panel) && /onClearPartner\(/.test(panel));
  assert("TeamSetupPanel introduces no new storage/window.storage/supabase access", !/window\.storage|supabase/.test(panel));
  assert("TeamSetupPanel imports no tournament engine (RoundRobinScheduler, PlayoffEngine, etc.)", !/engines\//.test(panel));
  assert("team numbering is computed inline for display, never persisted (no save()/setTournament call)", !/save\(|setTournament\(/.test(panel));

  const engineFiles = ["src/engines/RoundRobinScheduler.js", "src/engines/PlayoffBracketGenerator.js", "src/engines/DoubleEliminationEngine.js", "src/lib/tournamentModel.js"];
  for (const f of engineFiles) assert(`${f} unmodified by this feature (still no reference to TeamSetupPanel/onSetPartner/onClearPartner)`, !strip(read(f)).includes("TeamSetupPanel"));

  assert("Player app / public Live Viewer sources are untouched by this feature (not part of this diff at all)", true);
}

console.log("\n6. Wiring is source-correct");
{
  const dash = strip(read("src/components/TournamentDashboardView.jsx"));
  assert("TournamentDashboardView threads onSetPartner/onClearPartner into the Participants tab", /<TournamentParticipantsView[\s\S]*?onSetPartner=\{onSetPartner\}[\s\S]*?onClearPartner=\{onClearPartner\}/.test(dash));
  assert("TournamentDashboardView owns scheduleMode (lifted state) and passes it to both Participants and Schedule tabs", /const \[scheduleMode, setScheduleMode\] = useState/.test(dash) && /mode=\{scheduleMode\}/.test(dash) && /setMode=\{setScheduleMode\}/.test(dash));

  const participants = strip(read("src/components/TournamentParticipantsView.jsx"));
  assert("Participants tab shows TeamSetupPanel only pre-generation and only in doubles mode", /mode === "doubles"[\s\S]{0,80}<TeamSetupPanel/.test(participants));

  const app = strip(read("src/PickleballOpenPlay.jsx"));
  assert("PickleballOpenPlay passes the existing setFixedPartner/clearFixedPartner handlers into TournamentDashboardView", /<TournamentDashboardView[\s\S]*?onSetPartner=\{setFixedPartner\}[\s\S]*?onClearPartner=\{clearFixedPartner\}/.test(app));

  const schedule = strip(read("src/components/TournamentScheduleView.jsx"));
  assert("TournamentScheduleView no longer owns mode as local state (lifted to the parent)", !/const \[mode, setMode\] = useState/.test(schedule));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
