// The PINs / access code must never be printed in anything the app renders.
// They are still constants in lib/constants.js (to be moved server-side
// later); this guards against showing them on a screen again.
//
// Usage: node scripts/verify-no-pin-on-screen.mjs
import fs from "node:fs";
import path from "node:path";
import { ADMIN_PIN, SCORER_PIN, DEV_ACCESS_CODE } from "../src/lib/constants.js";

let pass = 0, fail = 0;
const assert = (desc, cond) => { cond ? pass++ : fail++; console.log(`  ${cond ? "ok" : "FAIL:"} ${desc}`); };
const root = new URL("../src/", import.meta.url).pathname;
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx?|css|html)$/.test(e.name)) files.push(p); } })(root);
const secrets = [ADMIN_PIN, SCORER_PIN, DEV_ACCESS_CODE].filter(Boolean).map(String);
const offenders = [];
for (const f of files) {
  if (f.endsWith(path.join("lib", "constants.js"))) continue; // the one place they are defined
  const src = fs.readFileSync(f, "utf8");
  const literal = secrets.some((s) => new RegExp(`(^|[^0-9A-Za-z])${s}([^0-9A-Za-z]|$)`).test(src));
  if (literal || /Demo PIN/i.test(src)) offenders.push(path.relative(root, f));
  // rendering the constant itself: {ADMIN_PIN} in JSX or ${ADMIN_PIN} in a string
  if (/[{$]\{?\s*(ADMIN_PIN|SCORER_PIN|DEV_ACCESS_CODE)\s*\}/.test(src)) offenders.push(path.relative(root, f) + " (renders the constant)");
}
assert(`no screen file contains a PIN / access code value or a "Demo PIN" hint${offenders.length ? " — " + offenders.join(", ") : ""}`, offenders.length === 0);
const admin = fs.readFileSync(path.join(root, "components/AdminLogin.jsx"), "utf8");
const scorer = fs.readFileSync(path.join(root, "components/ScorerLogin.jsx"), "utf8");
assert("Organizer sign-in shows a neutral note", /For PickleKing organizers only\./.test(admin));
assert("Scorer / Payment sign-in shows a neutral note by default", /note = "Ask the session organizer for the PIN\."/.test(scorer));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
