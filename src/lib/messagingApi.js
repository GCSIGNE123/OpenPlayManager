// Thin client for the open-play-messaging Edge Function's ORGANIZER
// actions (listForSession/getThread/reply) — this repo's PickleKing
// Player counterpart, openPlayMessagingApi.js, owns the player actions
// (send/list). Same "thin invoke wrapper, error .code always set"
// convention as checkinQrApi.js.
//
// No auth header, no organizer identity — see the migration's own header
// comment for why: Pro has no Supabase Auth at all, so every call here is
// gated purely by whether (sessionCode, sessionStartedAt) is still a
// CURRENT session, checked server-side inside the RPC. This is exactly as
// strong as every other action Pro already performs against a session it
// holds the code for — never weaker, never a fabricated stronger
// authorization this app can't actually back up.
import { supabase } from "./supabaseClient.js";

async function invoke(method, params) {
  let options;
  if (method === "GET") {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))
    );
    options = { method, headers: {} };
    var path = `?${query.toString()}`;
  } else {
    options = { method, body: params };
    path = "";
  }
  const { data, error } = await supabase.functions.invoke(`open-play-messaging${path}`, options);
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

// Every conversation for this exact (session_code, session_started_at) —
// [] for a not-current/nonexistent session, never an error (the Messages
// view then shows its own clean empty state, not a fabricated failure).
export async function fetchConversationsForSession(sessionCode, sessionStartedAt) {
  const data = await invoke("GET", { action: "listForSession", sessionCode, sessionStartedAt });
  return data?.conversations || [];
}

// One player's full thread — auto-marks the organizer's own side read as
// a server-side side effect (see get_open_play_conversation_for_organizer).
export async function fetchThreadForPlayer(sessionCode, sessionStartedAt, playerId) {
  const data = await invoke("GET", { action: "getThread", sessionCode, sessionStartedAt, playerId });
  return data?.messages || [];
}

// Throws with `.code` one of SESSION_NOT_CURRENT / INVALID_MESSAGE /
// RATE_LIMITED / CONVERSATION_NOT_FOUND on failure.
export async function replyToPlayer(sessionCode, sessionStartedAt, playerId, body) {
  const data = await invoke("POST", { action: "reply", sessionCode, sessionStartedAt, playerId, body });
  return data?.messageId ?? null;
}
