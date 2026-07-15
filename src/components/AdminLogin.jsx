import { ArrowLeft, Lock, Unlock } from "lucide-react";
import { styles } from "../styles.js";

export default function AdminLogin({ onBack, adminPin, setAdminPin, tryAdminLogin, adminPinError }) {
  return (
    <div style={styles.loginWrap}>
      <button style={{ ...styles.backBtn, alignSelf: "flex-start" }} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <Lock size={28} strokeWidth={1.75} color="var(--ink)" />
      <h2 style={styles.loginTitle}>Organizer access</h2>
      <p style={styles.loginSub}>Enter your admin PIN to generate and manage access codes.</p>
      <input
        style={styles.pinInput}
        type="password"
        inputMode="numeric"
        placeholder="PIN"
        value={adminPin}
        onChange={(e) => setAdminPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
      />
      <button style={styles.primaryBtn} onClick={tryAdminLogin}>
        <Unlock size={16} strokeWidth={2.5} />
        Enter as organizer
      </button>
      {adminPinError && <div style={styles.pinError}>{adminPinError}</div>}
      <p style={styles.loginNote}>Demo PIN: 918273 — a real deploy would use a real owner login.</p>
    </div>
  );
}
