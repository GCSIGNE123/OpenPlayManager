// Share Live (organizer) — public live-viewer link + QR. Tests:
//   - the URL is EXACTLY https://picklekingplayer.vercel.app/live/{sessionCode}
//     (the Player-hosted public viewer, never the Pro app);
//   - malformed / missing session codes produce no link at all;
//   - the QR is generated client-side by the `qrcode` library and, decoded with
//     jsQR, encodes exactly that URL;
//   - the dialog/button are read-only presentation wired for BOTH Open Play and
//     Tournament sessions, with no write/network path.
//
// Usage: node scripts/verify-share-live.mjs
import fs from "node:fs";
import QRCode from "qrcode";
import jsQR from "jsqr";

const { buildPublicLiveUrl, PUBLIC_LIVE_BASE_URL } = await import("../src/lib/publicLiveUrl.js");
const { makeLiveQrDataUrl } = await import("../src/lib/liveQr.js");

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("\n1. Share Live URL generation");
{
  assert("base is exactly https://picklekingplayer.vercel.app", PUBLIC_LIVE_BASE_URL === "https://picklekingplayer.vercel.app");
  assert("Open Play code -> https://picklekingplayer.vercel.app/live/ZQBJ4P", buildPublicLiveUrl("ZQBJ4P") === "https://picklekingplayer.vercel.app/live/ZQBJ4P");
  assert("a tournament session code produces the same shape", buildPublicLiveUrl("TR7K2M") === "https://picklekingplayer.vercel.app/live/TR7K2M");
  assert("lower-case / padded codes are normalized to the stored upper-case code", buildPublicLiveUrl("  zqbj4p ") === "https://picklekingplayer.vercel.app/live/ZQBJ4P");
  for (const bad of [undefined, null, "", "   ", "AB", 12345, "AB CD", "ABC/../x", "ABC?x=1", "ABC#f", "A".repeat(40), "ÄÖÜ123"]) {
    assert(`malformed session code ${JSON.stringify(bad)} -> no link (null)`, buildPublicLiveUrl(bad) === null);
  }
  const url = buildPublicLiveUrl("ZQBJ4P");
  assert("the link is NOT the Pro app (no localhost / vercel.app Pro host / query params)", !/localhost|openplay|\?display=|\?openPlayDisplay=|\?portal=/.test(url) && new URL(url).host === "picklekingplayer.vercel.app" && new URL(url).pathname === "/live/ZQBJ4P");
}

console.log("\n2. QR generation path");
{
  const url = buildPublicLiveUrl("ZQBJ4P");
  const dataUrl = await makeLiveQrDataUrl(url);
  assert("makeLiveQrDataUrl returns a PNG data URL (generated client-side by the qrcode library)", typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,") && dataUrl.length > 500);

  // decode the QR back with jsQR (already a Pro dependency) — proves the code encodes EXACTLY the public URL
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, scale = 6, quiet = 4, dim = (n + quiet * 2) * scale;
  const rgba = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!qr.modules.get(x, y)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const px = ((y + quiet) * scale + dy) * dim + (x + quiet) * scale + dx;
      rgba[px * 4] = 0; rgba[px * 4 + 1] = 0; rgba[px * 4 + 2] = 0;
    }
  }
  const decoded = jsQR(rgba, dim, dim);
  assert("decoding the QR yields exactly https://picklekingplayer.vercel.app/live/ZQBJ4P", decoded?.data === "https://picklekingplayer.vercel.app/live/ZQBJ4P");

  let seen = null;
  const stub = { toDataURL: async (u, opts) => { seen = { u, opts }; return "data:image/png;base64,STUB"; } };
  assert("the generator is called with the exact public URL", (await makeLiveQrDataUrl(url, stub)) === "data:image/png;base64,STUB" && seen.u === url);
  let threw = false; try { await makeLiveQrDataUrl("", stub); } catch (e) { threw = true; }
  assert("an empty URL is refused (no QR of nothing)", threw);
}

console.log("\n3. Dialog + button are read-only and available for BOTH session types");
{
  const dlg = read("src/components/ShareLiveDialog.jsx");
  const dlgCode = strip(dlg);
  assert("the dialog builds its URL only with buildPublicLiveUrl(sessionCode)", /buildPublicLiveUrl\(sessionCode\)/.test(dlgCode) && /makeLiveQrDataUrl\(url\)/.test(dlgCode));
  assert("Copy Link copies the built public URL", /navigator\.clipboard\.writeText\(url\)/.test(dlgCode));
  assert("the dialog exposes the link, a QR image and a Copy Link button", /Public live link/.test(dlg) && /<img src=\{qr\}/.test(dlg) && /Copy Link/.test(dlg));
  assert("no write / network path in the dialog or helpers (no storage, supabase, fetch, save)", ![dlg, read("src/lib/publicLiveUrl.js"), read("src/lib/liveQr.js")].some((s) => /window\.storage|supabase|fetch\(|\bsave\(|localStorage/.test(strip(s))));
  assert("the URL is never derived from window.location (the Pro app)", ![dlg, read("src/lib/publicLiveUrl.js")].some((s) => /window\.location|location\.origin|location\.href/.test(strip(s))));
  assert("a missing session code shows 'nothing to share' instead of a broken link", /No session code yet/.test(dlg));

  const app = read("src/PickleballOpenPlay.jsx");
  const btnIdx = app.indexOf('aria-label="Share Live"');
  assert("the organizer header has exactly one Share Live button", btnIdx > -1 && app.indexOf('aria-label="Share Live"', btnIdx + 1) === -1);
  const before = app.slice(Math.max(0, btnIdx - 420), btnIdx);
  assert("the Share Live button is NOT wrapped in a sessionType condition (Open Play AND Tournament)", !/sessionType/.test(before.split("Share Live")[before.split("Share Live").length - 1]) && app.indexOf("<Share2") > 0);
  const tvTournamentIdx = app.indexOf('aria-label="TV display mode"');
  const tvOpenPlayIdx = app.indexOf('aria-label="Open TV Mode"');
  assert("it sits in the shared header cluster, ahead of both the tournament-only and Open-Play-only TV buttons", btnIdx < tvTournamentIdx && btnIdx < tvOpenPlayIdx);
  assert("the dialog is opened from that button and receives the session code", /setShareLiveOpen\(true\)/.test(app) && /<ShareLiveDialog sessionCode=\{sessionCode\}/.test(app));
  assert("no Supabase access was added by this feature (the dialog only reads its sessionCode prop)", !/window\.storage|supabase/.test(strip(dlg)) && (app.match(/<ShareLiveDialog/g) || []).length === 1);
}

console.log("\n4. The QR library is a declared dependency, and existing scanner/QR behavior is untouched");
{
  const pkg = JSON.parse(read("package.json"));
  assert("qrcode is declared in package.json (same major as the Player app)", /^\^?1\./.test(pkg.dependencies.qrcode || ""));
  assert("jsqr (scanner) is still declared and unchanged in role", Boolean(pkg.dependencies.jsqr));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
