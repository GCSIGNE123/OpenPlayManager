// USB QR/barcode scanner support (e.g. Eyoyo EV-7130) — see PROJECT.md and
// CheckInScannerModal.jsx's header. Automated coverage of the one pure
// helper the new USB mode adds (normalizeUsbScanPayload, lib/checkinQrApi.js)
// — the rest of USB mode's behavior (Enter-triggered processing, focus
// management, inline success/error, duplicate-Enter guard, mode switching)
// lives in CheckInScannerModal.jsx's React state and was verified in the
// browser (see the task's final report), matching this repo's existing
// convention of headlessly testing extracted pure logic rather than
// components with no React-testing-library setup available.
//
// Usage: node scripts/verify-usb-qr-scanner.mjs
import { normalizeUsbScanPayload } from "../src/lib/usbScanner.js";

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
