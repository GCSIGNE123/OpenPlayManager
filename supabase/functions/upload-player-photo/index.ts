// upload-player-photo — Phase 3B's ONLY writer of the `player-photos`
// Storage bucket for Pro. Pro has no auth system (see PROJECT.md), so
// unlike Player (which uploads directly from the browser, authorized by an
// RLS policy against player_identity_links), Pro's anon-key client gets NO
// Storage INSERT permission at all — this Edge Function, running under the
// service-role key, is the sole privileged writer, same "server does the
// privileged write, client calls a narrow API" pattern already established
// by pickleking-player's create-player-profile/player-profile functions
// and by this repo's own sweep-open-play-sessions/index.ts.
//
// Every check below is a REAL server-side gate, not client-side UX
// validation the caller could skip — see validation.js's own header.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PLAYER_PHOTOS_BUCKET, MAX_PHOTO_BYTES, validatePhotoDataUrl, isValidPlayerId, playerPhotoObjectPath } from "./validation.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Service-role key: an Edge Function secret, only ever read here,
// server-side — never prefixed VITE_, never bundled into any frontend
// build, same convention as sweep-open-play-sessions/index.ts.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PLAYER_DB_PREFIX = "opl-player-";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const ERROR_MESSAGES: Record<string, string> = {
  MALFORMED_REQUEST: "That doesn't look like a valid request.",
  INVALID_PLAYER_ID: "That player id isn't valid.",
  PLAYER_NOT_FOUND: "That player doesn't exist.",
  INVALID_PHOTO: "That photo couldn't be used.",
  PHOTO_TOO_LARGE: "That photo is too large (2 MB max).",
  UPLOAD_FAILED: "Couldn't upload the photo. Please try again.",
  SERVER_ERROR: "Something went wrong. Please try again in a moment.",
};

function errorResponse(code: string, status: number) {
  return jsonResponse({ error: code, message: ERROR_MESSAGES[code] || ERROR_MESSAGES.SERVER_ERROR }, status);
}

async function playerExists(adminClient: ReturnType<typeof createClient>, playerId: string): Promise<boolean> {
  const { data, error } = await adminClient
    .from("opl_kv")
    .select("key")
    .eq("key", `${PLAYER_DB_PREFIX}${playerId}`)
    .eq("shared", true)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// Decodes a base64 string to raw bytes — Deno has no `atob`-to-Uint8Array
// shortcut built in for large strings, so this mirrors the same decode
// browsers do via atob(), just server-side.
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse("MALFORMED_REQUEST", 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("MALFORMED_REQUEST", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("MALFORMED_REQUEST", 400);
  }
  const { playerId, photoDataUrl } = body as Record<string, unknown>;

  if (!isValidPlayerId(playerId)) {
    return errorResponse("INVALID_PLAYER_ID", 400);
  }

  const validation = validatePhotoDataUrl(photoDataUrl);
  if (!validation.ok) {
    return errorResponse(validation.error, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Authority check — the request is never trusted just because it names
  // a syntactically valid id; the player must actually exist. Rejects
  // spraying objects at arbitrary/nonexistent ids outright.
  const exists = await playerExists(adminClient, playerId as string);
  if (!exists) {
    return errorResponse("PLAYER_NOT_FOUND", 404);
  }

  const bytes = base64ToBytes(validation.base64);
  // Re-check the REAL decoded byte count against the cap (the earlier
  // check derives this from the base64 string's length without allocating
  // — this second check is redundant-by-construction, not a second
  // source of truth, and costs nothing once bytes already exist).
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    return errorResponse("PHOTO_TOO_LARGE", 400);
  }

  const path = playerPhotoObjectPath(playerId as string, validation.extension, crypto.randomUUID());

  const { error: uploadError } = await adminClient.storage.from(PLAYER_PHOTOS_BUCKET).upload(path, bytes, {
    contentType: validation.mime,
    upsert: false,
  });
  if (uploadError) {
    return errorResponse("UPLOAD_FAILED", 500);
  }

  const { data } = adminClient.storage.from(PLAYER_PHOTOS_BUCKET).getPublicUrl(path);
  return jsonResponse({ url: data.publicUrl });
});
