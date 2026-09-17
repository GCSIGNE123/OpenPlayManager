// Optional Player Photos — regression test for the initials/color
// fallback (Avatar.jsx) now that a photo-less player is reachable through
// every check-in/registration path (the mandatory-photo gates in
// quickAddCheckIn/CreateSessionScreen/PlayerManagementScreen were
// removed). Calls the real functions directly (initials/colorForName from
// src/lib/utils.js) — no synthetic reimplementation. This is also the
// exact algorithm pickleking-player/src/lib/avatarInitials.js duplicates
// for its own repo (same precedent as PLAYER_DB_PREFIX/
// MAX_PHOTO_DATA_URL_LENGTH elsewhere) — these two independent copies
// should always agree on the same inputs.
//
// Usage: node scripts/verify-avatar-initials.mjs
import { initials, colorForName } from "../src/lib/utils.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${desc}`);
  }
}

assert('initials("John Cruz") === "JC"', initials("John Cruz") === "JC");
assert('initials("Maria Santos") === "MS"', initials("Maria Santos") === "MS");
assert('initials("Guil") === "G" (single word — its own first letter)', initials("Guil") === "G");
assert("initials only uses the first two words of a longer name", initials("Juan Carlos Dela Cruz") === "JC");
assert("colorForName is deterministic — same name, same color", colorForName("John Cruz") === colorForName("John Cruz"));
assert("colorForName returns a usable (non-empty) value", typeof colorForName("Maria Santos") === "string" && colorForName("Maria Santos").length > 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
