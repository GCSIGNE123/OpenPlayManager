// Share Live — the ONE place the public live-viewer URL is built.
//
// The public Live Viewer is served by the PickleKing PLAYER app
// (picklekingplayer.vercel.app), route `/live/:sessionCode` — NOT by this Pro
// application. Anything shared with spectators (the link, the QR code) must
// therefore always point at that host; it must never be derived from
// window.location (which is the Pro app) or from any Pro route.
//
// Pure, no imports: directly unit-testable (scripts/verify-share-live.mjs).
export const PUBLIC_LIVE_BASE_URL = "https://picklekingplayer.vercel.app";

// Mirrors the Player app's route validator (src/lib/publicLiveRoute.js:
// 3-16 alphanumerics). Pro session codes are 6 uppercase letters/digits, so
// this only ever rejects a missing/garbled value — it must never let
// path/query characters into the shared URL.
const SESSION_CODE_PATTERN = /^[A-Za-z0-9]{3,16}$/;

// Returns `https://picklekingplayer.vercel.app/live/{SESSIONCODE}`, or null
// when there is no usable session code (the Share Live button then does not
// offer a link at all rather than a broken one).
export function buildPublicLiveUrl(sessionCode) {
  if (typeof sessionCode !== "string") return null;
  const code = sessionCode.trim();
  if (!SESSION_CODE_PATTERN.test(code)) return null;
  return `${PUBLIC_LIVE_BASE_URL}/live/${code.toUpperCase()}`;
}
