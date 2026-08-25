// Check In Player -> Scan Player QR — Stage 1 of the PickleKing Player <->
// Pro integration (see pickleking-player's
// supabase/migrations/20260826000000_qr_checkin.sql for the full atomic
// check-in transaction this drives). Reuses the existing dialog styling
// convention (dialogOverlay/dialogCard/dialogHeadRow/dialogTitle/
// dialogActions — see CheckoutConfirmDialog.jsx/SessionSettingsDialog.jsx)
// rather than inventing new modal styles.
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
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Check } from "lucide-react";
import { styles } from "../styles.js";
import { checkinPlayerViaQr, createScanChallenge } from "../lib/checkinQrApi.js";

export default function CheckInScannerModal({ sessionCode, onClose }) {
  const [stage, setStage] = useState("pin"); // 'pin' | 'scanning' | 'result'
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanChallenge, setScanChallenge] = useState(null);
  const [result, setResult] = useState(null); // { status, player } | { error }
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const scanningLockRef = useRef(false);

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => stopCamera, []);

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
    if (!pin.trim()) {
      setPinError("Enter the organizer PIN.");
      return;
    }
    setBusy(true);
    setPinError("");
    try {
      const { challenge } = await createScanChallenge(sessionCode, pin);
      setScanChallenge(challenge);
      setStage("scanning");
      startCamera();
    } catch (e) {
      setPinError(e.message || "Couldn't start the scanner.");
    } finally {
      setBusy(false);
    }
  };

  const handleScanned = async (playerToken, challenge) => {
    try {
      const data = await checkinPlayerViaQr(playerToken, challenge);
      setResult({ status: data.status, player: data.player });
    } catch (e) {
      setResult({ error: e.message || "Couldn't check this player in." });
    } finally {
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
      handleScanned(code.data, scanChallenge);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div style={styles.dialogOverlay}>
      <div style={styles.dialogCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>Scan Player QR</h2>
        </div>

        {stage === "pin" && (
          <div style={{ textAlign: "center" }}>
            <p style={styles.editHint}>Enter the organizer PIN to start scanning.</p>
            <input
              style={styles.pinInput}
              type="password"
              inputMode="numeric"
              placeholder="Organizer PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && requestChallenge()}
            />
            {pinError && <div style={styles.pinError}>{pinError}</div>}
            <div style={styles.dialogActions}>
              <button type="button" style={styles.secondaryBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }}
                onClick={requestChallenge}
                disabled={busy}
              >
                {busy ? "Starting…" : "Start Scanning"}
              </button>
            </div>
          </div>
        )}

        {stage === "scanning" && (
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

        {stage === "result" && (
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
                    setStage("pin");
                  }}
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
