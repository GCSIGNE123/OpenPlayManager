// USB QR/barcode scanner support (e.g. Eyoyo EV-7130) — CheckInScannerModal's
// USB mode reads this device's keystrokes into a plain <input> and calls
// this pure helper on Enter, rather than re-implementing the trim/empty
// logic inline. A scanner "types" the decoded payload and then sends
// Enter — some units additionally send a trailing \r and/or \n before or
// instead of a synthetic Enter keypress, which would otherwise survive
// into the input's value; stripping those (in addition to surrounding
// whitespace) keeps the payload identical to what the camera path already
// hands to checkinPlayerViaQr as `code.data`. Returns "" for a blank/
// whitespace-only scan so callers can treat it as "ignore" without
// special-casing null/undefined. No other dependencies, deliberately — so
// it can be exercised headlessly without pulling in supabaseClient.js.
export function normalizeUsbScanPayload(raw) {
  return (raw ?? "").replace(/[\r\n]+/g, "").trim();
}

// Diagnostic-only shape check — NOT security validation (checkin-player's
// exact-match lookup against player_checkin_tokens is, and remains, the
// only place a token is actually accepted or rejected). A real player
// token is a base64url string (see pickleking-player's
// _shared/checkinLogic.js: CHECKIN_TOKEN_BYTES random bytes, base64url-
// encoded — currently 32 characters for 24 bytes). This check is
// deliberately loose about the exact length rather than importing/
// duplicating that constant across repos: it only needs to catch scans
// that couldn't possibly be a real token, not to police borderline cases.
//
// Purpose: a USB HID scanner "types" its decoded payload through the OS's
// active keyboard layout. If the scanner's own configured keyboard/
// country setting doesn't match the computer's OS layout, some scanned
// characters silently come out wrong before this input ever sees them —
// classic examples are y/z swapping between QWERTY and QWERTZ layouts, or
// digits/punctuation shifting on AZERTY. The result reaches
// checkin-player as a syntactically-plausible-looking but wrong string,
// which server-side returns the same generic TOKEN_INVALID/"That QR code
// isn't valid" as a truly garbled or unrelated scan — with nothing to
// tell an organizer that their SCANNER's keyboard-layout setting, not the
// player's QR, is the likely cause. Flagging an obviously-wrong shape
// locally (wrong character set, or far too short to be a real token)
// lets the UI say so immediately, without waiting on a round trip whose
// error message can't tell these two very different problems apart.
const MIN_PLAUSIBLE_TOKEN_LENGTH = 20;

export function looksLikeScanToken(value) {
  return typeof value === "string" && value.length >= MIN_PLAUSIBLE_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}
