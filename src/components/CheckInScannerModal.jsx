// Check In Player -> Scan Player QR — Stage 1 of the PickleKing Player <->
// Pro integration (see pickleking-player's
// supabase/migrations/20260826000000_qr_checkin.sql for the full atomic
// check-in transaction this drives). Reuses the existing dialog styling
// convention (dialogOverlay/dialogCard/dialogHeadRow/dialogTitle/
// dialogActions — see CheckoutConfirmDialog.jsx/SessionSettingsDialog.jsx)
// rather than inventing new modal styles.
//
// No organizer PIN here — see create-scan-challenge/index.ts's header for
// the security reasoning: sessionCode isn't a secret, and a challenge
// alone can't check anyone in without a valid player token paired with it.
// Opening this modal mints a challenge for whichever mode is active (see
// the remembered-mode default just below) — the camera is NEVER started
// (and getUserMedia is NEVER called) until the organizer explicitly
// selects Camera Scanner, so a USB-only organizer never sees a spurious
// camera-permission prompt or error.
//
// NOTE on flow: the approved architecture's checkin-player call performs
// the ENTIRE check-in atomically in one step (token + challenge validation
// + the session write, all in one Postgres transaction) — there is
// deliberately no separate "preview, then confirm" round trip, since
// splitting consumption from the actual check-in write is exactly the
// inconsistency the atomic-transaction design was approved to close. So a
// successful scan checks the player in immediately; this modal shows the
// resulting confirmation ("Guil Signe checked in") rather than a
// Cancel/Check In choice made after already having consumed the QR.
//
// USB QR/barcode scanner support (e.g. Eyoyo EV-7130) — a second scanning
// mode alongside the camera above, chosen via the Camera Scanner/USB QR
// Scanner toggle below. This class of device is NOT a camera: it's a
// USB-HID keyboard that "types" the decoded QR payload into whatever input
// has focus, then sends Enter — it never exposes a camera and needs no
// video/canvas/requestAnimationFrame polling loop. Both modes funnel into
// the exact same createScanChallenge/checkinPlayerViaQr calls (see
// lib/checkinQrApi.js) — there's no separate QR format, payload parsing, or
// check-in logic for USB; a given QR code produces an identical result
// whether it's read by the camera or typed by the scanner. USB mode's own
// state/flow is intentionally NOT routed through the shared `stage`
// state machine's 'result' screen: a USB scanner is used to check a whole
// line of players in back to back, so each scan's outcome shows inline and
// the input immediately refocuses for the next player, rather than
// replacing the screen with a one-shot result that requires "Try Again"
// per person.
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Check, ScanLine } from "lucide-react";
import { styles } from "../styles.js";
import { checkinPlayerViaQr, createScanChallenge } from "../lib/checkinQrApi.js";
import { normalizeUsbScanPayload } from "../lib/usbScanner.js";
import { SCAN_MODE_STORAGE_KEY, resolveScanMode } from "../lib/scanModePreference.js";

function loadRememberedScanMode() {
  try {
    return resolveScanMode(window.localStorage.getItem(SCAN_MODE_STORAGE_KEY));
  } catch (e) {
    return "usb"; // localStorage unavailable (e.g. private mode) — safe default, never crashes
  }
}

function rememberScanMode(mode) {
  try {
    window.localStorage.setItem(SCAN_MODE_STORAGE_KEY, mode);
  } catch (e) {
    // best-effort only — not remembering the preference isn't worth surfacing an error for
  }
}

export default function CheckInScannerModal({ sessionCode, onClose }) {
  // Lazy initializer — reads localStorage exactly once, before the first
  // render, so the modal's very first paint already reflects the right
  // mode instead of flashing camera-mode UI first. See requestChallenge/
  // startCamera below: the camera is only ever invoked when mode==='camera',
  // so starting in 'usb' here means getUserMedia is never called on open.
  const [mode, setMode] = useState(loadRememberedScanMode); // 'camera' | 'usb'
  const [stage, setStage] = useState("starting"); // 'starting' | 'scanning' | 'result'
  const [startError, setStartError] = useState("");
  const [result, setResult] = useState(null); // { status, player } | { error }
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const scanningLockRef = useRef(false);
  // Source of truth for tick()/handleScanned() — tick() recursively
  // re-schedules itself via requestAnimationFrame without React ever
  // re-rendering in between, so a value read from a `scanChallenge` STATE
  // closure would stay pinned to whatever it was when that closure was
  // created (one generation behind the challenge just minted by
  // requestChallenge, or even the previous already-used one on a retry —
  // this was confirmed live: checkin-player received a stale/empty
  // scanChallenge and correctly rejected it). A ref has no such closure
  // staleness — reading challengeRef.current always reflects whichever
  // challenge was most recently assigned, regardless of renders.
  const challengeRef = useRef(null);

  // USB mode's own state — deliberately separate from `stage`/`result`
  // above (see file header).
  const [usbBusy, setUsbBusy] = useState(false);
  const [usbValue, setUsbValue] = useState("");
  const [usbResult, setUsbResult] = useState(null); // { status, player } | { error } | null
  const [usbStartError, setUsbStartError] = useState("");
  const usbInputRef = useRef(null);
  // Guards against a scanner that fires two Enter keydown events for one
  // physical scan (e.g. a CR+LF suffix) — without this, the second Enter
  // could fire a duplicate check-in request before the input has visibly
  // cleared.
  const usbProcessingRef = useRef(false);

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(
    () => () => {
      stopCamera();
      challengeRef.current = null; // scanner/modal is closing/unmounting — nothing left to redeem
    },
    []
  );

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      tick();
    } catch (e) {
      setResult({ error: "Couldn't access the camera. Check your browser's camera permission." });
      setStage("result");
    }
  };

  const requestChallenge = async () => {
    challengeRef.current = null; // invalidate any previous challenge before minting/awaiting a new one
    setStage("starting");
    setStartError("");
    try {
      const { challenge } = await createScanChallenge(sessionCode);
      challengeRef.current = challenge; // tick()/handleScanned() read this directly, never a state closure
      setStage("scanning");
      startCamera();
    } catch (e) {
      setStartError(e.message || "Couldn't start the scanner.");
      setResult({ error: e.message || "Couldn't start the scanner." });
      setStage("result");
    }
  };

  useEffect(() => {
    if (mode === "usb") requestUsbChallenge();
    else requestChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScanned = async (playerToken, challenge) => {
    try {
      const data = await checkinPlayerViaQr(playerToken, challenge);
      setResult({ status: data.status, player: data.player });
    } catch (e) {
      setResult({ error: e.message || "Couldn't check this player in." });
    } finally {
      challengeRef.current = null; // single-use — spent (or rejected) either way, never reused
      setStage("result");
    }
  };

  const tick = () => {
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && code.data && !scanningLockRef.current) {
      scanningLockRef.current = true;
      stopCamera();
      handleScanned(code.data, challengeRef.current);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  // Mints a fresh single-use challenge for USB mode, without touching
  // `stage` (camera-mode-only) or starting the camera — USB mode never
  // requests camera permission or a MediaStream at all.
  const requestUsbChallenge = async () => {
    challengeRef.current = null;
    setUsbStartError("");
    try {
      const { challenge } = await createScanChallenge(sessionCode);
      challengeRef.current = challenge;
    } catch (e) {
      setUsbStartError(e.message || "Couldn't start the scanner.");
    }
  };

  // Refocuses the input once it's actually enabled again (mode==='usb' and
  // not busy) — doing this here, rather than right after awaiting
  // createScanChallenge above, matters: setUsbBusy(false) only schedules a
  // re-render, so calling .focus() synchronously after that would still hit
  // an element that's disabled in the DOM for one more frame and silently
  // no-op. Keying an effect on [mode, usbBusy] guarantees the input's
  // `disabled` attribute has already cleared by the time focus() runs.
  useEffect(() => {
    if (mode === "usb" && !usbBusy) usbInputRef.current?.focus();
  }, [mode, usbBusy]);

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    if (mode === "camera") stopCamera(); // stop any active camera tracks before leaving camera mode
    rememberScanMode(nextMode);
    setMode(nextMode);
    setStartError(""); // clear any leftover camera error immediately on leaving/entering camera mode
    setResult(null);
    setUsbResult(null);
    setUsbValue("");
    setUsbStartError("");
    scanningLockRef.current = false;
    usbProcessingRef.current = false;
    if (nextMode === "usb") {
      requestUsbChallenge();
    } else {
      requestChallenge(); // camera is only ever started here, on an explicit switch into Camera Scanner
    }
  };

  // Reuses the exact same checkinPlayerViaQr call the camera path uses —
  // see file header. Stays on-screen (never flips `stage`) so the operator
  // can immediately scan the next player.
  const handleUsbScanned = async (playerToken) => {
    const challenge = challengeRef.current;
    setUsbBusy(true);
    setUsbResult(null);
    try {
      const data = await checkinPlayerViaQr(playerToken, challenge);
      setUsbResult({ status: data.status, player: data.player });
    } catch (e) {
      setUsbResult({ error: e.message || "Couldn't check this player in." });
    } finally {
      challengeRef.current = null; // single-use — spent (or rejected) either way, never reused
      setUsbBusy(false);
      usbProcessingRef.current = false;
      await requestUsbChallenge(); // ready for the next player right away
    }
  };

  const handleUsbKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const trimmed = normalizeUsbScanPayload(usbValue);
    setUsbValue(""); // clear immediately — also what stops a duplicate Enter
    // (e.g. a scanner sending both CR and LF) from re-submitting: by the
    // time the second Enter event fires, the input is already empty and
    // this guard below returns early.
    if (!trimmed || usbProcessingRef.current || usbBusy) return;
    usbProcessingRef.current = true;
    handleUsbScanned(trimmed);
  };

  const modeToggle = (
    <div style={styles.skillToggle}>
      <button type="button" style={styles.skillToggleBtn(mode === "camera")} onClick={() => switchMode("camera")}>
        <Camera size={12} strokeWidth={2.5} style={{ verticalAlign: "middle", marginRight: 4 }} />
        Camera Scanner
      </button>
      <button type="button" style={styles.skillToggleBtn(mode === "usb")} onClick={() => switchMode("usb")}>
        <ScanLine size={12} strokeWidth={2.5} style={{ verticalAlign: "middle", marginRight: 4 }} />
        USB QR Scanner
      </button>
    </div>
  );

  return (
    <div style={styles.dialogOverlay}>
      <div style={styles.dialogCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>Scan Player QR</h2>
        </div>

        {/* Always visible — including on the camera's terminal error screen —
            so an organizer whose camera failed can switch straight to USB
            QR Scanner without first clicking Try Again. */}
        {modeToggle}

        {mode === "camera" && stage === "starting" && !startError && (
          <div style={{ textAlign: "center" }}>
            <p style={styles.editHint}>Starting scanner…</p>
          </div>
        )}

        {mode === "camera" && stage === "scanning" && (
          <div style={{ textAlign: "center" }}>
            <video ref={videoRef} style={{ width: "100%", borderRadius: 10, marginBottom: 12 }} muted playsInline />
            <p style={styles.editHint}>
              <Camera size={12} strokeWidth={2.5} style={{ verticalAlign: "middle" }} /> Point the camera at the
              player's QR code.
            </p>
            <div style={styles.dialogActions}>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "camera" && stage === "result" && (
          <div style={{ textAlign: "center" }}>
            {result?.error ? (
              <p style={styles.pinError}>{result.error}</p>
            ) : result?.status === "already_checked_in" ? (
              <p style={styles.confirmMsg}>Player already checked in.</p>
            ) : (
              <p style={styles.confirmMsg}>
                <Check size={14} strokeWidth={3} /> {result?.player?.displayName} checked in
              </p>
            )}
            <div style={styles.dialogActions}>
              <button type="button" style={styles.secondaryBtn} onClick={onClose}>
                Done
              </button>
              {result?.error && (
                <button
                  type="button"
                  style={styles.primaryBtn}
                  onClick={() => {
                    scanningLockRef.current = false;
                    setResult(null);
                    requestChallenge();
                  }}
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}

        {mode === "usb" && (
          <div style={{ textAlign: "center" }}>
            <p style={styles.editHint}>
              Connect the USB QR scanner, click the input field, then scan the player's QR code.
            </p>
            <input
              ref={usbInputRef}
              style={styles.input}
              placeholder="Scan QR code here"
              value={usbValue}
              onChange={(e) => setUsbValue(e.target.value)}
              onKeyDown={handleUsbKeyDown}
              autoFocus
              disabled={usbBusy}
            />
            <p style={styles.editHint}>
              {usbStartError ? (
                <span style={styles.pinError}>{usbStartError}</span>
              ) : usbBusy ? (
                "Checking in…"
              ) : (
                <>
                  <ScanLine size={12} strokeWidth={2.5} style={{ verticalAlign: "middle" }} /> Scanner ready
                </>
              )}
            </p>
            {usbResult &&
              (usbResult.error ? (
                <p style={styles.pinError}>{usbResult.error}</p>
              ) : usbResult.status === "already_checked_in" ? (
                <p style={styles.confirmMsg}>Player already checked in.</p>
              ) : (
                <p style={styles.confirmMsg}>
                  <Check size={14} strokeWidth={3} /> {usbResult.player?.displayName} checked in
                </p>
              ))}
            <div style={styles.dialogActions}>
              {usbStartError ? (
                <button type="button" style={styles.primaryBtn} onClick={requestUsbChallenge}>
                  Try Again
                </button>
              ) : null}
              <button type="button" style={styles.secondaryBtn} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
