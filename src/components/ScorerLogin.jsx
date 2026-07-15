import { Lock, Unlock } from "lucide-react";
import { styles } from "../styles.js";

export default function ScorerLogin({ pin, setPin, tryScorerLogin, pinError }) {
  return (
    <div style={styles.loginWrap}>
      <Lock size={28} strokeWidth={1.75} color="var(--ink)" />
      <h2 style={styles.loginTitle}>Umpire / Scorer access</h2>
      <p style={styles.loginSub}>Enter your scorer PIN to manage courts and update live scores.</p>
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
        Enter as scorer
      </button>
      {pinError && <div style={styles.pinError}>{pinError}</div>}
      <p style={styles.loginNote}>Demo PIN: 1234 — a real version would use per-umpire accounts.</p>
    </div>
  );
}
