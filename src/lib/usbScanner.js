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
