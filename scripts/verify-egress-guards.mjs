// Phase 4: Egress Regression Guards (Pro) — lightweight, SOURCE-TEXT-level
// checks, not full behavioral tests. Each guard reads the actual shipped
// file and asserts a specific anti-pattern hasn't been reintroduced. See
// EGRESS.md for the full architecture/measurement history these protect.
//
// These are deliberately narrow: they guard what Phase 1/2/3B already
// fixed from regressing, not a general style rule. A guard that starts
// failing means either a real regression, or the guard itself needs
// updating alongside a deliberate, reviewed architecture change — never
// silence one without checking which case it is.
//
// Usage: node scripts/verify-egress-guards.mjs
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL: ${desc}`);
  }
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// ---- Guard: direct new player-photo base64 writes -------------------------
// Phase 3B's whole point was that a NEW photo never gets written as base64
// again — every save site builds the record with photo:null first, then
// (only if a fresh photo was actually picked) replaces it with the
// Storage URL from uploadPlayerPhoto(). A regression looks like a save
// site going back to passing the raw resized data: URL straight into
// emptyPlayerRecord/savePlayerRecord.
{
  const files = [
    "src/components/PlayerManagementScreen.jsx",
    "src/components/CreateSessionScreen.jsx",
    "src/PickleballOpenPlay.jsx",
  ];
  for (const file of files) {
    const src = read(file);
    assert(`${file} imports uploadPlayerPhoto from lib/photoStorage.js`, /uploadPlayerPhoto/.test(src));
    // The old anti-pattern: emptyPlayerRecord({ ... photo: photoDataUrl ... })
    // or ({ ... photo, ... }) passing the raw picked-photo variable straight
    // through, with no upload step in between. A record built via
    // emptyPlayerRecord in these files must always start photo:null (or, in
    // PlayerManagementScreen's edit path, go through photoToSave — checked
    // separately below).
    if (file !== "src/components/PlayerManagementScreen.jsx") {
      assert(
        `${file}: emptyPlayerRecord(...) is never given a raw photo/photoDataUrl variable directly`,
        !/emptyPlayerRecord\(\{[^}]*photo:\s*(photoDataUrl|photo)\s*[,}]/s.test(src)
      );
    }
  }
}

// PlayerManagementScreen.jsx's edit path (PlayerProfile.save) must gate the
// upload behind isFreshlyPickedPhoto — never unconditionally re-upload or
// pass the raw form state straight to savePlayerRecord.
{
  const src = read("src/components/PlayerManagementScreen.jsx");
  assert("PlayerManagementScreen.jsx imports isFreshlyPickedPhoto", /isFreshlyPickedPhoto/.test(src));
  assert(
    "PlayerManagementScreen.jsx's edit save gates the upload behind isFreshlyPickedPhoto(...)",
    /isFreshlyPickedPhoto\(photo,\s*player\.photo\)/.test(src)
  );
  assert(
    "PlayerManagementScreen.jsx's create save starts the new record with photo: null (upload attached after)",
    /emptyPlayerRecord\(\{[^}]*photo:\s*null/s.test(src)
  );
}

// ---- Guard: no direct Storage writes from Pro's client ---------------------
// Pro has no auth system — client-side Storage INSERT would mean going back
// to an unrestricted-write surface (see Phase 3B's architecture note). All
// uploads must go through the upload-player-photo Edge Function.
{
  const src = read("src/lib/photoStorage.js");
  assert("src/lib/photoStorage.js never calls supabaseClient.storage.from(...) directly", !/\.storage\s*\.\s*from\(/.test(src));
  assert("src/lib/photoStorage.js invokes the upload-player-photo Edge Function", /functions\.invoke\(\s*["']upload-player-photo["']/.test(src));
}

// ---- Guard: Phase 5a's five read-only consumers never discard-and-refetch
// A regression looks like the postgres_changes payload callback going back
// to calling window.storage.get(...) itself instead of applying the
// parsed payload directly — the exact anti-pattern Phase 5a removed. Each
// entry names the file and, since two files have two subscriptions each,
// how many `subscribeToKey(..., (payload) => {...}, loadX)` call shapes to
// check.
{
  const files = [
    { file: "src/components/TournamentDisplayView.jsx", expectedCallbacks: 2 },
    { file: "src/components/OpenPlayTVModePage.jsx", expectedCallbacks: 1 },
    { file: "src/components/PlayerPortalScreen.jsx", expectedCallbacks: 2 },
  ];
  for (const { file, expectedCallbacks } of files) {
    const src = read(file);
    assert(`${file} imports parseStorageChangePayload from lib/realtimeStorageEvents.js`, /parseStorageChangePayload/.test(src));
    // Extracts each subscribeToKey(...) call's payload-handling callback
    // body — the text between "(payload) => {" and the "}, loadX" that
    // closes it right before the onResync argument.
    const callbackBodies = [...src.matchAll(/\(payload\) => \{([\s\S]*?)\n\s*\},\s*\n\s*load\w+/g)].map((m) => m[1]);
    assert(`${file}: found ${expectedCallbacks} subscribeToKey payload callback(s)`, callbackBodies.length === expectedCallbacks);
    callbackBodies.forEach((body, i) => {
      assert(
        `${file} callback #${i + 1}: never calls window.storage.get(...) in response to a normal Realtime payload — must apply parseStorageChangePayload's result directly`,
        !/window\.storage\.get/.test(body)
      );
      assert(`${file} callback #${i + 1}: still parses the payload via parseStorageChangePayload`, /parseStorageChangePayload\(payload\)/.test(body));
    });
    // The 4th argument (onResync) is still the original load* function —
    // this IS the one legitimate remaining fetch, gated to reconnects only
    // by storage.js's own createResyncStatusHandler, not called here.
    assert(`${file}: subscribeToKey is still given an onResync (load*) argument for the one legitimate reconnect re-fetch`, /,\s*\n\s*load\w+\s*\n\s*\);/.test(src));
  }
}

// ---- Guard: PickleballOpenPlay.jsx (Phase 5b) applies the Realtime
// payload directly, but load() itself (the one legitimate resync fetch)
// must still exist unchanged, and the updatedAt staleness guard must
// still be enforced.
{
  const src = read("src/PickleballOpenPlay.jsx");
  assert(
    "PickleballOpenPlay.jsx's load() still exists, unchanged, as the one legitimate resync-fetch path",
    /const load = useCallback\(async \(\) => \{[\s\S]*?window\.storage\.get/.test(src)
  );
  assert("PickleballOpenPlay.jsx imports resolveRealtimeUpdate from lib/realtimeStorageEvents.js", /resolveRealtimeUpdate/.test(src));

  const applyMatch = /const applyRealtimeSessionChange = useCallback\(\s*\(payload\) => \{([\s\S]*?)\n {4}\},\s*\n\s*\[load\]/.exec(src);
  assert("applyRealtimeSessionChange callback found", Boolean(applyMatch));
  const applyBody = applyMatch ? applyMatch[1] : "";
  assert(
    "applyRealtimeSessionChange never calls window.storage.get(...) directly — only load() (via the refetch branch) may",
    !/window\.storage\.get/.test(applyBody)
  );
  assert("applyRealtimeSessionChange still resolves via resolveRealtimeUpdate(payload, stateRef.current.updatedAt)", /resolveRealtimeUpdate\(payload,\s*stateRef\.current\.updatedAt\)/.test(applyBody));
  assert("applyRealtimeSessionChange falls back to load() for an untrusted payload (action:refetch)", /result\.action === ["']refetch["'][\s\S]*?load\(\)/.test(applyBody));
  assert("applyRealtimeSessionChange applies the resolved value only for action:apply", /result\.action === ["']apply["'][\s\S]*?setState\(result\.value\)/.test(applyBody));

  // The subscription itself: onChange is applyRealtimeSessionChange (not
  // load), and onResync is still load — the one legitimate reconnect fetch.
  const subMatch = /window\.storage\.subscribeToKey\(\s*`\$\{STORAGE_PREFIX\}\$\{sessionCode\}`,\s*true,\s*applyRealtimeSessionChange,\s*\n\s*load\s*\n\s*\)/.exec(src);
  assert("PickleballOpenPlay.jsx's subscribeToKey call passes applyRealtimeSessionChange as onChange and load as onResync", Boolean(subMatch));
}

// ---- Guard: fetchAllPlayers() never regresses back to list()+N×get() -----
// Phase 5c's whole point: one bulk listWithValues() call instead of a
// list() for keys followed by an individual get() per key (330 requests
// for 330 players, measured). A regression looks like the underlying
// fetch going back to calling window.storage.list(...) and/or
// window.storage.get(...) inside a .map()/loop.
{
  const src = read("src/lib/playerDatabase.js");
  const fnMatch = /async function fetchAllPlayersUncached\(\) \{[\s\S]*?\n}/.exec(src);
  assert("fetchAllPlayersUncached() function found", Boolean(fnMatch));
  const fnBody = fnMatch ? fnMatch[0] : "";
  assert(
    "fetchAllPlayersUncached() uses the single bulk window.storage.listWithValues(...) call",
    /window\.storage\.listWithValues\(\s*PLAYER_DB_PREFIX\s*,\s*true\s*\)/.test(fnBody)
  );
  assert(
    "fetchAllPlayersUncached() never calls window.storage.list(...) — the old two-step (keys-only) scan",
    !/window\.storage\.list\(/.test(fnBody)
  );
  assert(
    "fetchAllPlayersUncached() never calls window.storage.get(...) — the old N+1, one-request-per-player pattern",
    !/window\.storage\.get\(/.test(fnBody)
  );
}

// ---- Guard: fetchAllPlayers() stays wired to the shared 8s cache (5d) -----
// A regression looks like fetchAllPlayers() calling fetchAllPlayersUncached()
// (or window.storage.listWithValues) directly again, bypassing the cache
// entirely — silently reintroducing "every screen re-downloads the whole
// roster on every mount," just with one request per call instead of 331.
{
  const src = read("src/lib/playerDatabase.js");
  assert("playerDatabase.js imports createAsyncCache from lib/asyncCache.js", /import\s*\{\s*createAsyncCache\s*\}\s*from\s*["']\.\/asyncCache\.js["']/.test(src));
  assert(
    "a module-level playersCache is created by wrapping fetchAllPlayersUncached in createAsyncCache",
    /const playersCache = createAsyncCache\(fetchAllPlayersUncached\)/.test(src)
  );
  const exportedFnMatch = /export async function fetchAllPlayers\(\) \{([\s\S]*?)\n}/.exec(src);
  assert("exported fetchAllPlayers() function found", Boolean(exportedFnMatch));
  const exportedBody = exportedFnMatch ? exportedFnMatch[1] : "";
  assert("the exported fetchAllPlayers() delegates to playersCache.get(), not a direct fetch", /return playersCache\.get\(\)/.test(exportedBody));
  assert("the exported fetchAllPlayers() never calls window.storage directly (must go through the cache)", !/window\.storage/.test(exportedBody));
}

// ---- Guard: savePlayerRecord() invalidates the cache only AFTER a
// successful write — never before, never on a failed write. ----------------
{
  const src = read("src/lib/playerDatabase.js");
  const fnMatch = /export async function savePlayerRecord\(record\) \{([\s\S]*?)\n}/.exec(src);
  assert("savePlayerRecord() function found", Boolean(fnMatch));
  const body = fnMatch ? fnMatch[1] : "";
  const setIdx = body.indexOf("window.storage.set");
  const invalidateIdx = body.indexOf("playersCache.invalidate()");
  assert("savePlayerRecord() still calls window.storage.set(...)", setIdx !== -1);
  assert("savePlayerRecord() calls playersCache.invalidate()", invalidateIdx !== -1);
  assert(
    "invalidate() is sequenced AFTER window.storage.set(...) in source order — never before (a rejected set() must skip it entirely)",
    setIdx !== -1 && invalidateIdx !== -1 && invalidateIdx > setIdx
  );
  assert(
    "window.storage.set(...) is awaited (so a rejection is thrown before invalidate() can run, not merely started)",
    /await window\.storage\.set/.test(body)
  );
}

// listWithValues itself must still exist as a genuine single-query bulk
// read (key AND value in one select), not a wrapper that internally loops.
{
  const src = read("src/storage.js");
  const fnMatch = /async function listWithValues\([^)]*\) \{[\s\S]*?\n}/.exec(src);
  assert("storage.js's listWithValues() function found", Boolean(fnMatch));
  const fnBody = fnMatch ? fnMatch[0] : "";
  assert("listWithValues() selects both key and value in one query", /\.select\(\s*["']key,\s*value["']\s*\)/.test(fnBody));
  // The only .map() in this function reshapes the already-fetched `data`
  // array locally (no further await/request per row) — a regression looks
  // like a second network call (get/select/from) appearing inside a loop.
  assert("listWithValues() never issues a second query per row (no nested .from(/.get(/await inside a loop)", !/(?:\.map|\.forEach|for\s*\()[\s\S]*?(?:await |\.from\(|supabase\.)/.test(fnBody));
  assert("listWithValues() is exposed on the exported storage object", /listWithValues/.test(src.split("const storage = {")[1] ?? ""));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
