// Phase 3B: upload-player-photo Edge Function — unit tests for its pure
// validation logic (supabase/functions/upload-player-photo/validation.js).
// The Edge Function itself (Deno-only: createClient, Deno.serve, service-
// role key) is documented-but-not-live-tested here, same convention as
// every other Edge-Function-backed piece in this codebase (see
// sweep-open-play-sessions/index.ts and pickleking-player's own Edge
// Function tests) — everything pure-logic-testable IS tested below.
//
// Usage: node scripts/verify-upload-player-photo.mjs
import {
  PLAYER_PHOTOS_BUCKET,
  MAX_PHOTO_BYTES,
  base64DecodedByteLength,
  validatePhotoDataUrl,
  isValidPlayerId,
  playerPhotoObjectPath,
} from "../supabase/functions/upload-player-photo/validation.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${desc}`);
  }
}

// 1x1 red PNG, 1x1 transparent GIF-shaped-but-still-valid-base64 JPEG stub,
// and a tiny valid WebP — enough bytes to decode meaningfully, not full
// real images (these are unit tests of the size/shape math, not of actual
// image decoding, which this function deliberately never does).
const SAMPLE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const SAMPLE_JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from("a".repeat(30)).toString("base64")}`;
const SAMPLE_PNG_DATA_URL = `data:image/png;base64,${SAMPLE_PNG_BASE64}`;
const SAMPLE_WEBP_DATA_URL = `data:image/webp;base64,${Buffer.from("b".repeat(30)).toString("base64")}`;

// ---- base64DecodedByteLength -----------------------------------------------
assert(
  "base64DecodedByteLength matches Buffer's own decode for a known string",
  base64DecodedByteLength(Buffer.from("hello world").toString("base64")) === Buffer.byteLength("hello world")
);
assert("base64DecodedByteLength throws on malformed base64 (bad length)", (() => {
  try { base64DecodedByteLength("abc"); return false; } catch { return true; }
})());
assert("base64DecodedByteLength throws on invalid characters", (() => {
  try { base64DecodedByteLength("not_base64!!"); return false; } catch { return true; }
})());

// ---- validatePhotoDataUrl ---------------------------------------------------
{
  const result = validatePhotoDataUrl(SAMPLE_JPEG_DATA_URL);
  assert("a valid JPEG data URL is accepted", result.ok === true);
  assert("...with mime image/jpeg", result.mime === "image/jpeg");
  assert("...and extension jpg", result.extension === "jpg");
}
{
  const result = validatePhotoDataUrl(SAMPLE_PNG_DATA_URL);
  assert("a valid PNG data URL is accepted", result.ok === true);
  assert("...with extension png (never mismatched to .jpg)", result.extension === "png");
}
{
  const result = validatePhotoDataUrl(SAMPLE_WEBP_DATA_URL);
  assert("a valid WebP data URL is accepted", result.ok === true);
  assert("...with extension webp", result.extension === "webp");
}

assert("null is rejected", validatePhotoDataUrl(null).ok === false);
assert("a non-string is rejected", validatePhotoDataUrl(42).ok === false);
assert("an empty string is rejected", validatePhotoDataUrl("").ok === false);
assert("a non-data-URL string is rejected", validatePhotoDataUrl("https://example.com/x.jpg").ok === false);
assert("a disallowed image type (svg) is rejected", validatePhotoDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=").ok === false);
assert("a non-image data URL is rejected", validatePhotoDataUrl("data:text/plain;base64,aGVsbG8=").ok === false);

{
  // A real, deterministic ~2.1 MB payload (over the 2 MB cap) — built from
  // its decoded byte size, not guessed, so this test would fail loudly if
  // the cap math were ever wrong.
  const oversizedBytes = Buffer.alloc(MAX_PHOTO_BYTES + 1024, 1);
  const oversizedDataUrl = `data:image/jpeg;base64,${oversizedBytes.toString("base64")}`;
  const result = validatePhotoDataUrl(oversizedDataUrl);
  assert("a payload over MAX_PHOTO_BYTES is rejected with PHOTO_TOO_LARGE", result.ok === false && result.error === "PHOTO_TOO_LARGE");
}
{
  // Exactly at the cap must be accepted (boundary, not off-by-one).
  const exactBytes = Buffer.alloc(MAX_PHOTO_BYTES, 1);
  const exactDataUrl = `data:image/jpeg;base64,${exactBytes.toString("base64")}`;
  const result = validatePhotoDataUrl(exactDataUrl);
  assert("a payload exactly at MAX_PHOTO_BYTES is accepted", result.ok === true);
}

// ---- isValidPlayerId --------------------------------------------------------
assert("a normal uid()-shaped player id is valid", isValidPlayerId("ycz0456"));
assert("null is not a valid player id", !isValidPlayerId(null));
assert("a player id containing a slash is rejected (path-traversal defense)", !isValidPlayerId("abc/def"));
assert("a player id containing '..' is rejected", !isValidPlayerId("../../etc"));
assert("an empty string is not a valid player id", !isValidPlayerId(""));

// ---- playerPhotoObjectPath --------------------------------------------------
assert(
  "playerPhotoObjectPath shapes {playerId}/{uuid}.{ext} using the VALIDATED extension",
  playerPhotoObjectPath("ycz0456", "png", "fixed-uuid") === "ycz0456/fixed-uuid.png"
);
assert("PLAYER_PHOTOS_BUCKET is the bucket actually created", PLAYER_PHOTOS_BUCKET === "player-photos");
assert("MAX_PHOTO_BYTES matches the bucket's own 2 MB file_size_limit", MAX_PHOTO_BYTES === 2 * 1024 * 1024);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
