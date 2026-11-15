// Desktop layout and looks (Nov 2026 GUI review): wider app on wide screens
// with courts two per row, a quiet "End match early" button, the Fixed
// Partner roster collapsed by default, a full-width standings table, tighter
// court cards when the teams wrap, and evened-out Session Settings spacing.
//
// Usage: node scripts/verify-desktop-looks.mjs
import fs from "node:fs";
import { styles } from "../src/styles.js";

let pass = 0, fail = 0;
const assert = (desc, cond) => { cond ? pass++ : fail++; console.log(`  ${cond ? "ok" : "FAIL:"} ${desc}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const css = read("src/index.css");
assert("app widens to 1240px on screens 1200px and up (900px otherwise)", /max-width: 900px/.test(css) && /@media \(min-width: 1200px\)\s*\{\s*#root\s*\{\s*max-width: 1240px;/.test(css));
assert("courts: grid, two per row once each can be 480px, one per row on narrow screens", styles.courtGrid.display === "grid" && /minmax\(min\(100%, 480px\), 1fr\)/.test(styles.courtGrid.gridTemplateColumns));
assert("standings table uses the width (760px, was 480px)", styles.standingsTable.maxWidth === 760);
assert("court teams: 6px row gap when wrapped, 20px between side-by-side teams", styles.courtLiveRow.rowGap === 6 && styles.courtLiveRow.columnGap === 20 && styles.courtLiveRow.gap === undefined);
const card = read("src/components/CourtCard.jsx");
assert("End match early uses the quiet outline button; the orange bar stays for End match & requeue", /court\.status === "finished" \? styles\.endMatchBtn : styles\.endMatchEarlyBtn/.test(card) && styles.endMatchEarlyBtn.background === "transparent" && styles.endMatchBtn.background === "var(--ball)");
const fp = read("src/components/FixedPartnerPanel.jsx");
assert("Fixed Partner roster collapsed by default behind a toggle", /useState\(false\)/.test(fp) && /aria-expanded=\{open\}/.test(fp) && /\{open && \(/.test(fp));
assert("Session Settings fields are separated by a quiet line; descriptions have no stray margins", (read("src/components/SessionSettingsDialog.jsx").match(/styles\.settingsDialogField/g) || []).length >= 10 && styles.settingsDialogField.borderBottom && styles.dialogReadOnlyValue.margin === 0);
assert("other dialogs keep the plain field style", styles.dialogField.borderBottom === undefined && /styles\.dialogField/.test(read("src/components/ShareLiveDialog.jsx")));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
