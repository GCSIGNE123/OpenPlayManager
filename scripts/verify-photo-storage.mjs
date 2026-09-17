// Phase 3B: Player Photo Storage (client side) — unit tests for
// src/lib/photoStorage.js. Pro has no Storage INSERT permission at all (see
// that file's own header) — uploadPlayerPhoto is a thin wrapper around
// invoking the upload-player-photo Edge Function, tested here with a mock
// `supabaseClient.functions.invoke` (no network, no real function/bucket).
// The Edge Function's own validation logic is tested separately in
// scripts/verify-upload-player-photo.mjs.
//
// Usage: node scripts/verify-photo-storage.mjs
import { uploadPlayerPhoto, isFreshlyPickedPhoto, PLAYER_PHOTOS_BUCKET } from "../src/lib/photoStorage.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${desc}`);
  }
}

const SAMPLE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

assert("PLAYER_PHOTOS_BUCKET matches the bucket actually created", PLAYER_PHOTOS_BUCKET === "player-photos");

// ---- isFreshlyPickedPhoto ---------------------------------------------------
assert("a brand-new data: photo (no previous value) is freshly picked", isFreshlyPickedPhoto(SAMPLE_DATA_URL, null));
assert("a data: photo that differs from the stored value is freshly picked", isFreshlyPickedPhoto(SAMPLE_DATA_URL, "data:image/png;base64,OLD"));
assert("an unchanged existing base64 photo is NOT freshly picked", !isFreshlyPickedPhoto(SAMPLE_DATA_URL, SAMPLE_DATA_URL));
assert("an unchanged existing Storage-URL photo is NOT freshly picked", !isFreshlyPickedPhoto("https://x.supabase.co/storage/v1/object/public/player-photos/p1/u1.jpg", "https://x.supabase.co/storage/v1/object/public/player-photos/p1/u1.jpg"));
assert("null (photo cleared) is NOT freshly picked", !isFreshlyPickedPhoto(null, SAMPLE_DATA_URL));

// ---- uploadPlayerPhoto (mock client — no network) --------------------------
async function testUploadSuccess() {
  const calls = [];
  const mockClient = {
    functions: {
      invoke: async (name, options) => {
        calls.push({ name, options });
        return { data: { url: "https://proj.supabase.co/storage/v1/object/public/player-photos/player123/uuid1.jpg" }, error: null };
      },
    },
  };
  const url = await uploadPlayerPhoto(mockClient, "player123", SAMPLE_DATA_URL);
  assert("uploadPlayerPhoto invokes the upload-player-photo Edge Function", calls.length === 1 && calls[0].name === "upload-player-photo");
  assert("uploadPlayerPhoto sends playerId in the request body", calls[0].options.body.playerId === "player123");
  assert("uploadPlayerPhoto sends the raw data URL as photoDataUrl (never a pre-built path)", calls[0].options.body.photoDataUrl === SAMPLE_DATA_URL);
  assert("uploadPlayerPhoto returns the function's returned URL", url.includes("/player-photos/player123/"));
}

async function testUploadFunctionErrorPropagates() {
  const mockClient = {
    functions: { invoke: async () => ({ data: null, error: new Error("function threw") }) },
  };
  let threw = false;
  try {
    await uploadPlayerPhoto(mockClient, "player123", SAMPLE_DATA_URL);
  } catch (e) {
    threw = e.message === "function threw";
  }
  assert("uploadPlayerPhoto throws when the Edge Function call errors (never saves a broken URL)", threw);
}

async function testUploadMissingUrlPropagates() {
  // A malformed/empty success response (no `error`, but also no `url`) must
  // never be treated as a successful upload.
  const mockClient = {
    functions: { invoke: async () => ({ data: {}, error: null }) },
  };
  let threw = false;
  try {
    await uploadPlayerPhoto(mockClient, "player123", SAMPLE_DATA_URL);
  } catch {
    threw = true;
  }
  assert("uploadPlayerPhoto throws if the Edge Function response has no url", threw);
}

await testUploadSuccess();
await testUploadFunctionErrorPropagates();
await testUploadMissingUrlPropagates();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
