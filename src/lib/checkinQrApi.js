// Thin client for the two QR check-in Edge Functions (create-scan-challenge,
// checkin-player) — same shared Supabase project the claim-code feature
// already calls into (see PlayerManagementScreen.jsx's ClaimCodeCard). This
// is the only module Pro's scanner UI talks to; neither function is called
// directly from any component.
import { supabase } from "./supabaseClient.js";

async function invoke(functionName, payload) {
  const { data, error } = await supabase.functions.invoke(functionName, { body: payload });
  if (error) {
    let code = "SERVER_ERROR";
    let message = "Something went wrong. Please try again.";
    try {
      const body = await error.context.json();
      if (body?.error) code = body.error;
      if (body?.message) message = body.message;
    } catch {
      // non-JSON error body (e.g. a network failure) — fall back to the generic message
    }
    const err = new Error(message);
    err.code = code;
    throw err;
  }
  return data;
}

// Session-bound — see checkin_player_via_qr's design doc (pickleking-player's
// 20260826000000_qr_checkin.sql migration) for why this exists as its own
// step rather than folding the session id into the player's QR token.
// sessionCode is not treated as a secret (see create-scan-challenge's
// header comment) — the actual check-in authorization comes from pairing
// the resulting challenge with a valid player token, never from this call
// alone.
export function createScanChallenge(sessionCode) {
  return invoke("create-scan-challenge", { sessionCode });
}

// Never sends a player id — only the two opaque, single-use credentials
// scanned/minted moments earlier.
export function checkinPlayerViaQr(playerToken, scanChallenge) {
  return invoke("checkin-player", { playerToken, scanChallenge });
}
