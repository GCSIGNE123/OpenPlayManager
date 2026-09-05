// CheckInScannerModal's remembered Camera Scanner / USB QR Scanner
// preference — a per-browser UI preference stored in localStorage only, no
// account/session data, no database, no migration. This pure function is
// the actual decision logic (given whatever raw string was found in
// storage, or none); the component's own loadRememberedScanMode() is a
// thin wrapper that reads localStorage and hands the result here, kept
// separate so the decision can be tested headlessly without a DOM.
export const SCAN_MODE_STORAGE_KEY = "pk_lastScanMode";

// Defaults to 'usb' whenever nothing valid has been remembered yet — this
// modal's primary desktop/organizer use case (Eyoyo EV-7130 support) — so
// the camera is never the surprise default for a USB-only organizer.
export function resolveScanMode(rawStoredValue) {
  return rawStoredValue === "camera" || rawStoredValue === "usb" ? rawStoredValue : "usb";
}
