// Phase 3B: Player Photo Storage — uploads a freshly-picked player photo to
// the Supabase Storage `player-photos` bucket instead of embedding it as
// base64 inside the opl-player- record. See PROJECT.md's Phase 3B note.
//
// Pro has no auth system (no login, only local PIN gates), so unlike
// Player (which uploads directly from the browser, authorized by an RLS
// policy against player_identity_links), Pro's anon-key client has NO
// Storage INSERT permission on this bucket at all — every upload goes
// through the upload-player-photo Edge Function instead, which runs under
// the service-role key and is the bucket's only writer. See that
// function's own header for the full architecture note.
//
// Deliberately NOT wired into every photo read path — an existing base64
// `data:` photo, or a `null` photo, is left completely untouched (Phase 3B
// does not migrate anything). Every img src="{player.photo}" call site
// already renders a data: URL and an https: URL identically, so nothing
// there needs to change either.
//
// supabaseClient is passed in (not imported directly) so this stays
// trivially unit-testable with a mock client — no network, no real
// function/bucket.
export const PLAYER_PHOTOS_BUCKET = "player-photos";

// Uploads a freshly-picked photo via the upload-player-photo Edge Function
// and returns its public URL. Only ever call this for a photo the user
// just picked in this session (a `data:` URL that differs from whatever
// was already stored) — never for an existing base64 or Storage-URL photo
// the user left untouched. Throws on upload/validation failure; callers
// decide whether that blocks the save entirely or is swallowed with a null
// photo, matching whatever this save site already does when
// savePlayerRecord itself fails.
export async function uploadPlayerPhoto(supabaseClient, playerId, dataUrl) {
  const { data, error } = await supabaseClient.functions.invoke("upload-player-photo", {
    body: { playerId, photoDataUrl: dataUrl },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Photo upload failed — no URL returned.");
  return data.url;
}

// A photo value is only ever a candidate for upload when it's a `data:`
// URL that differs from whatever the record already had — an unchanged
// existing base64/Storage-URL photo (or null) is left exactly as-is.
export function isFreshlyPickedPhoto(nextPhoto, previousPhoto) {
  return typeof nextPhoto === "string" && nextPhoto.startsWith("data:") && nextPhoto !== previousPhoto;
}
