import { ArrowLeft, Unlock } from "lucide-react";
import { styles } from "../styles.js";

export default function AccessScreen({ onBack, accessCodeInput, setAccessCodeInput, submitAccessCode, accessError, accessChecking }) {
  return (
    <div style={styles.landingWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <div style={styles.landingHero}>
        <div style={styles.kicker}>ACCESS REQUIRED</div>
        <h1 style={styles.landingTitle}>Enter your access code</h1>
        <p style={styles.landingSub}>
          This code comes from your session organizer after payment is confirmed.
        </p>
      </div>
      <div style={styles.landingCard}>
        <div style={styles.checkinRow}>
          <input
            style={{ ...styles.input, ...styles.codeInput }}
            placeholder="ABCD2345"
            value={accessCodeInput}
            maxLength={8}
            onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && submitAccessCode()}
          />
          <button
            style={{ ...styles.primaryBtn, ...(accessChecking ? styles.btnDisabled : {}) }}
            onClick={submitAccessCode}
            disabled={accessChecking}
          >
            <Unlock size={16} strokeWidth={2.5} />
            {accessChecking ? "Checking…" : "Continue"}
          </button>
        </div>
        {accessError && <div style={styles.pinError}>{accessError}</div>}
      </div>
    </div>
  );
}
