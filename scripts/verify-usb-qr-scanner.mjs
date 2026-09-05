// USB QR/barcode scanner support (e.g. Eyoyo EV-7130) — see PROJECT.md and
// CheckInScannerModal.jsx's header. Automated coverage of the pure helpers
// the USB mode and Scan Player QR startup-behavior fix add
// (normalizeUsbScanPayload from lib/usbScanner.js; resolveScanMode from
// lib/scanModePreference.js — the decision behind defaulting to USB QR
// Scanner, never Camera Scanner, so the camera is never initialized/
// permission-prompted before the organizer has chosen a mode) — the rest
// of this modal's behavior (Enter-triggered processing, focus management,
// inline success/error, duplicate-Enter guard, mode switching, camera
// only starting on explicit selection) lives in CheckInScannerModal.jsx's
// React state and was verified in the browser (see the task's final
// report), matching this repo's existing convention of headlessly testing
// extracted pure logic rather than components with no React-testing-
// library setup available.
//
// Usage: node scripts/verify-usb-qr-scanner.mjs
import { normalizeUsbScanPayload } from "../src/lib/usbScanner.js";
import { resolveScanMode, SCAN_MODE_STORAGE_KEY } from "../src/lib/scanModePreference.js";
import { CAMERA_IDLE, CAMERA_STARTING, CAMERA_ACTIVE, CAMERA_ERROR, initialCameraLifecycle, cameraLifecycleReducer } from "../src/lib/cameraLifecycle.js";

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) { pass++; console.log(`  ok ${desc}`); }
  else { fail++; console.log(`  FAIL: ${desc}`); }
}

console.log("\nnormalizeUsbScanPayload — a plain scanned payload passes through unchanged");
{
  assert("plain alphanumeric token unchanged", normalizeUsbScanPayload("PLAYER-TOKEN-abc123") === "PLAYER-TOKEN-abc123");
}

console.log("\nnormalizeUsbScanPayload — whitespace/newline suffixes trimmed (scanner-appended CR/LF)");
{
  assert("trailing \\r\\n stripped", normalizeUsbScanPayload("token-1\r\n") === "token-1");
  assert("trailing \\n stripped", normalizeUsbScanPayload("token-1\n") === "token-1");
  assert("trailing \\r stripped", normalizeUsbScanPayload("token-1\r") === "token-1");
  assert("surrounding plain whitespace trimmed", normalizeUsbScanPayload("  token-1  ") === "token-1");
  assert("embedded \\r\\n (mid-string) removed, not just trimmed from the ends", normalizeUsbScanPayload("tok\r\nen-1") === "token-1");
}

console.log("\nnormalizeUsbScanPayload — empty/whitespace-only scans normalize to empty string (caller treats as 'ignore')");
{
  assert("empty string -> empty", normalizeUsbScanPayload("") === "");
  assert("whitespace-only -> empty", normalizeUsbScanPayload("   ") === "");
  assert("bare CR/LF only -> empty", normalizeUsbScanPayload("\r\n") === "");
  assert("null -> empty (never throws)", normalizeUsbScanPayload(null) === "");
  assert("undefined -> empty (never throws)", normalizeUsbScanPayload(undefined) === "");
}

console.log("\nnormalizeUsbScanPayload — identical output for the same payload regardless of scanner-specific suffix style");
{
  const base = "SESSION-QR-PAYLOAD-xyz";
  const withCRLF = normalizeUsbScanPayload(base + "\r\n");
  const withLF = normalizeUsbScanPayload(base + "\n");
  const withNone = normalizeUsbScanPayload(base);
  assert("CRLF-suffixed, LF-suffixed, and bare payload all normalize identically", withCRLF === base && withLF === base && withNone === base);
}

console.log("\nresolveScanMode — Scan Player QR startup behavior fix (no surprise camera prompt for USB organizers)");
{
  assert("no remembered preference (null, e.g. first-ever open) -> defaults to 'usb', never 'camera'", resolveScanMode(null) === "usb");
  assert("no remembered preference (undefined) -> defaults to 'usb'", resolveScanMode(undefined) === "usb");
  assert("a remembered 'usb' preference is honored", resolveScanMode("usb") === "usb");
  assert("a remembered 'camera' preference is honored (organizer explicitly chose Camera Scanner last time)", resolveScanMode("camera") === "camera");
  assert("garbage/corrupted storage value -> safe default 'usb', never crashes or picks camera", resolveScanMode("something-unexpected") === "usb");
  assert("empty string -> safe default 'usb'", resolveScanMode("") === "usb");
}

console.log("\nSCAN_MODE_STORAGE_KEY — stable, non-empty storage key (regression guard against an accidental rename breaking remembered preferences)");
{
  assert("storage key is a non-empty string", typeof SCAN_MODE_STORAGE_KEY === "string" && SCAN_MODE_STORAGE_KEY.length > 0);
}

console.log("\ncameraLifecycleReducer — Camera Scanner never auto-starts (idle-until-Start-Scanning fix)");
{
  const initial = initialCameraLifecycle();
  assert("initial state is idle, with no error", initial.state === CAMERA_IDLE && initial.error === "");

  const starting = cameraLifecycleReducer(initial, { type: "START_SCANNING" });
  assert("START_SCANNING (Start Scanning / Try Again pressed) -> starting, clears any prior error", starting.state === CAMERA_STARTING && starting.error === "");

  const active = cameraLifecycleReducer(starting, { type: "STREAM_ACQUIRED" });
  assert("STREAM_ACQUIRED (getUserMedia + challenge succeeded) -> active", active.state === CAMERA_ACTIVE && active.error === "");

  const failedFromStarting = cameraLifecycleReducer(starting, { type: "FAILED", message: "Couldn't access the camera. Check your browser's camera permission." });
  assert("FAILED from starting -> error, carries the message", failedFromStarting.state === CAMERA_ERROR && failedFromStarting.error === "Couldn't access the camera. Check your browser's camera permission.");

  const failedNoMessage = cameraLifecycleReducer(starting, { type: "FAILED" });
  assert("FAILED with no message -> error, falls back to the standard camera-permission message", failedNoMessage.state === CAMERA_ERROR && failedNoMessage.error === "Couldn't access the camera. Check your browser's camera permission.");

  const resetFromActive = cameraLifecycleReducer(active, { type: "RESET" });
  assert("RESET from active (mode switch, modal close, or a completed scan) -> back to idle, no error", resetFromActive.state === CAMERA_IDLE && resetFromActive.error === "");

  const resetFromError = cameraLifecycleReducer(failedFromStarting, { type: "RESET" });
  assert("RESET from error (switching away) -> idle, error cleared", resetFromError.state === CAMERA_IDLE && resetFromError.error === "");

  const retried = cameraLifecycleReducer(failedFromStarting, { type: "START_SCANNING" });
  assert("Try Again (START_SCANNING from error) -> starting again, error cleared immediately", retried.state === CAMERA_STARTING && retried.error === "");

  assert("an unknown action leaves the current state unchanged (never crashes)", cameraLifecycleReducer(active, { type: "SOMETHING_ELSE" }) === active);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
