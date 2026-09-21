import { useEffect, useState } from "react";
import { Copy, Check, X } from "lucide-react";
import { styles } from "../styles.js";
import { buildPublicLiveUrl } from "../lib/publicLiveUrl.js";
import { makeLiveQrDataUrl } from "../lib/liveQr.js";

// Share Live — shows the PUBLIC read-only live-viewer link for this session
// (Open Play or Tournament), its QR code, and a Copy Link button. The URL is
// always https://picklekingplayer.vercel.app/live/{sessionCode} (see
// lib/publicLiveUrl.js) — the QR points at the Player-hosted viewer, never at
// this Pro app. Purely presentational: no session data is read or written, and
// the QR is generated client-side.
export default function ShareLiveDialog({ sessionCode, onClose }) {
  const url = buildPublicLiveUrl(sessionCode);
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    makeLiveQrDataUrl(url)
      .then((dataUrl) => !cancelled && setQr(dataUrl))
      .catch(() => !cancelled && setQrError(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // clipboard can be blocked — the link is still selectable on screen
    }
  };

  return (
    <div style={styles.dialogOverlay} onClick={onClose}>
      <div style={styles.dialogCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share Live">
        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>Share Live</h2>
          <button style={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {!url ? (
          <p style={styles.dialogReadOnlyValue}>No session code yet — there is nothing to share.</p>
        ) : (
          <>
            <p style={styles.dialogReadOnlyValue}>
              Anyone with this link or QR code can watch live courts, up next, queue and standings — no login, read-only.
            </p>
            <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 14px" }}>
              {qr ? (
                <img src={qr} alt={`QR code for ${url}`} width={220} height={220} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
              ) : (
                <div style={{ ...styles.dialogReadOnlyValue, height: 220, display: "flex", alignItems: "center" }}>
                  {qrError ? "Couldn’t draw the QR — use the link below." : "Generating QR…"}
                </div>
              )}
            </div>
            <div style={styles.dialogField}>
              <label style={styles.dialogLabel}>Public live link</label>
              <input style={styles.input} readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Public live link" />
            </div>
          </>
        )}

        <div style={styles.dialogActions}>
          <button style={styles.secondaryBtn} onClick={onClose}>
            Close
          </button>
          {url && (
            <button style={styles.primaryBtn} onClick={copyLink}>
              {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} strokeWidth={2.5} />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
