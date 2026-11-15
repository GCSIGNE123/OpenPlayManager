// Clarity fixes from the Nov 2026 GUI review: session-information labels
// that say what they count, History numbered by match (every entry is one
// match in every mode), no paid / unpaid tag on the screens players can see,
// and a dash instead of a rating until RATING_MIN_GAMES games.
//
// Usage: node scripts/verify-clarity-labels.mjs
import fs from "node:fs";
import { RATING_MIN_GAMES } from "../src/lib/performanceRating.js";
import { defaultState } from "../src/lib/constants.js";

let pass = 0, fail = 0;
const assert = (desc, cond) => { cond ? pass++ : fail++; console.log(`  ${cond ? "ok" : "FAIL:"} ${desc}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const scorer = read("src/components/ScorerView.jsx");
assert("Session information: Checked In, On Court, Registered, Waiting", ["Checked In", "On Court", "Registered", "Waiting"].every((l) => scorer.includes(`sessionInfoLabel}>${l}<`)) && !/sessionInfoLabel}>In-Court Players</.test(scorer));
assert("continuous modes show Matches Played; Roulette / Points-Based keep Current Round", /roulette \|\| usesPhases\(state\) \? "Current Round" : "Matches Played"/.test(scorer));
assert("endMatch still numbers history entries one per match (what History's 'Match N' relies on)", /round: \(state\.matchHistory \|\| \[\]\)\.length \+ 1,/.test(read("src/PickleballOpenPlay.jsx")));
const hist = read("src/components/HistoryView.jsx");
assert("History says Match, not Round", /<span>Match \{round\}<\/span>/.test(hist) && /Match \{m\.round\} · Court/.test(hist) && /All matches/.test(hist) && !/Round \{/.test(hist));
assert("Live Board courts hide the payment tag", /<CourtCard [^>]*readOnly hidePayment \/>/.test(read("src/components/BoardView.jsx")) && (read("src/components/CourtCard.jsx").match(/hidePayment=\{hideAvatar \|\| hidePaymentProp\}/g) || []).length === 4);
assert("queue lists (Live Board, Check In) hide the payment tag", (read("src/components/QueueList.jsx").match(/<PlayerChip [^>]*hidePayment \/>/g) || []).length === 2);
assert("Payment tab still shows payment controls", /PaymentBadge|onSetPayment/.test(read("src/components/PaymentView.jsx")));
assert(`rating shows a dash until ${RATING_MIN_GAMES} games (Standings and waiting list)`, RATING_MIN_GAMES === 2 && /\(p\.gp \|\| 0\) < RATING_MIN_GAMES/.test(read("src/components/StandingsView.jsx")) && /\(p\.games \|\| 0\) < RATING_MIN_GAMES/.test(read("src/components/WaitingPlayersPanel.jsx")));
assert("same threshold as the podium's default minimum games", defaultState.podiumMinGames === RATING_MIN_GAMES);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
