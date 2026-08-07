import { Lock, Unlock } from "lucide-react";
import { styles } from "../styles.js";

// Generalized beyond just Scorer access — the Dedicated Payment tab (see
// PROJECT.md/FEATURES.md) reuses this exact same PIN gate/component,
// "protected using the same password as Scorer" per explicit direction,
// with its own copy via these optional props. Defaults preserve the
// original Scorer copy exactly, so every existing caller is unaffected.
export default function ScorerLogin({
  pin,
  setPin,
  tryScorerLogin,
  pinError,
  title = "Umpire / Scorer access",
  subtitle = "Enter your scorer PIN to manage courts and update live scores.",
  buttonLabel = "Enter as scorer",
  note = "Demo PIN: 1234 — a real version would use per-umpire accounts.",
}) {
  return (
    <div style={styles.loginWrap}>
      <Lock size={28} strokeWidth={1.75} color="var(--ink)" />
      <h2 style={styles.loginTitle}>{title}</h2>
      <p style={styles.loginSub}>{subtitle}</p>
      <input
        style={styles.pinInput}
        type="password"
        inputMode="numeric"
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && tryScorerLogin()}
      />
      <button style={styles.primaryBtn} onClick={tryScorerLogin}>
        <Unlock size={16} strokeWidth={2.5} />
        {buttonLabel}
      </button>
      {pinError && <div style={styles.pinError}>{pinError}</div>}
      <p style={styles.loginNote}>{note}</p>
    </div>
  );
}
