// Pure, runtime-agnostic validation for the upload-player-photo Edge
// Function — works under both Deno (index.ts, plain relative import, same
// precedent as sweep-open-play-sessions/index.ts importing from
// ../../../src/lib/*.js) and Node (scripts/verify-upload-player-photo.mjs).
//
// This is the ONLY thing standing between an anon-key caller and the
// player-photos Storage bucket for Pro (which has no Storage INSERT policy
// at all — see Phase 3B's architecture note) — every check here is a real
// server-side gate, not just client-side UX validation.
export const PLAYER_PHOTOS_BUCKET = "player-photos";

// Matches the bucket's own file_size_limit (2 MB) set at creation time —
// kept as a second, explicit server-side check here since a client could
// call this function directly, bypassing whatever cap the browser UI
// itself enforces.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const MIME_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Same three MIME types the bucket itself allows — kept in sync
// deliberately (see docs/DEPLOYMENT.md's Storage section).
const DATA_URL_SHAPE = /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/;

// Computes the DECODED byte length of a base64 string directly from its
// own length (accounting for '=' padding) — cheaper and safer than
// decoding the whole thing just to measure it, and catches a malformed
// base64 payload outright instead of only the size cap.
export function base64DecodedByteLength(base64) {
  const cleaned = base64.replace(/\s/g, "");
  if (cleaned.length === 0 || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error("Not valid base64");
  }
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return (cleaned.length / 4) * 3 - padding;
}

// Validates the inbound `photoDataUrl` string end-to-end: shape, declared
// MIME type (must be one of the three the bucket allows), and the ACTUAL
// decoded byte size (never trusts the base64 string's character length as
// a proxy for the real image size). Returns { ok:true, mime, base64,
// byteLength, extension } or { ok:false, error }.
export function validatePhotoDataUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: "INVALID_PHOTO" };
  }
  const match = DATA_URL_SHAPE.exec(value);
  if (!match) {
    return { ok: false, error: "INVALID_PHOTO" };
  }
  const [, mime, base64] = match;
  let byteLength;
  try {
    byteLength = base64DecodedByteLength(base64);
  } catch {
    return { ok: false, error: "INVALID_PHOTO" };
  }
  if (byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, error: "PHOTO_TOO_LARGE" };
  }
  return { ok: true, mime, base64, byteLength, extension: MIME_EXTENSIONS[mime] };
}

// A Player Database id (see openplay-manager/src/lib/random.js's uid() —
// base36, ~7 chars) is always plain alphanumeric — this is a defense-in-
// depth shape check on top of the real authority check (does
// opl-player-{playerId} actually exist), so a crafted id could never be
// used to steer the Storage path outside its own folder (e.g. via a "/" or
// ".." embedded in the id).
export function isValidPlayerId(playerId) {
  return typeof playerId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(playerId);
}

// The object path is ALWAYS built here, server-side, from a validated
// playerId/extension/uuid — a client-supplied path is never used for
// anything (see index.ts: the request body only ever carries playerId +
// photoDataUrl, never a path).
export function playerPhotoObjectPath(playerId, extension, uuid) {
  return `${playerId}/${uuid}.${extension}`;
}
