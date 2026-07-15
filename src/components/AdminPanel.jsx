import { useState } from "react";
import { ArrowLeft, Copy, Plus } from "lucide-react";
import { styles } from "../styles.js";
import SectionLabel from "./SectionLabel.jsx";

export default function AdminPanel({
  onBack,
  generateAccessCode,
  generating,
  recentCodes,
  lookupInput,
  setLookupInput,
  lookupCode,
  lookupResult,
  lookupBusy,
}) {
  const [copiedCode, setCopiedCode] = useState(null);

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch (e) {
      // clipboard access can fail silently — code is still visible on screen
    }
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <SectionLabel>Sell access</SectionLabel>
      <p style={styles.editHint}>
        Once payment is received, generate a code and send it to the buyer. Each code unlocks exactly one new
        session and can't be reused after that.
      </p>
      <button
        style={{ ...styles.primaryBtn, ...(generating ? styles.btnDisabled : {}) }}
        onClick={generateAccessCode}
        disabled={generating}
      >
        <Plus size={16} strokeWidth={2.5} />
        {generating ? "Generating…" : "Generate new access code"}
      </button>

      {recentCodes.length > 0 && (
        <>
          <SectionLabel>Recently generated ({recentCodes.length})</SectionLabel>
          <ul style={styles.rosterList}>
            {recentCodes.map((r) => (
              <li key={r.code} style={styles.rosterItem}>
                <span style={styles.adminCode}>{r.code}</span>
                <span style={styles.resultTag(r.usedAt ? "loss" : "win")}>
                  {r.usedAt ? "USED" : "UNUSED"}
                </span>
                <button style={styles.checkInTapBtn} onClick={() => copy(r.code)}>
                  <Copy size={12} strokeWidth={2.5} />
                  {copiedCode === r.code ? "Copied" : "Copy"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionLabel>Check a code's status</SectionLabel>
      <div style={styles.checkinRow}>
        <input
          style={{ ...styles.input, ...styles.codeInput }}
          placeholder="ABCD2345"
          value={lookupInput}
          maxLength={8}
          onChange={(e) => setLookupInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && lookupCode()}
        />
        <button
          style={{ ...styles.primaryBtn, ...(lookupBusy ? styles.btnDisabled : {}) }}
          onClick={lookupCode}
          disabled={lookupBusy}
        >
          {lookupBusy ? "Checking…" : "Check"}
        </button>
      </div>
      {lookupResult && (
        <p style={styles.editHint}>
          {lookupResult.notFound
            ? `${lookupResult.code} doesn't exist.`
            : `${lookupResult.code} is ${lookupResult.usedAt ? "already used" : "still unused"}.`}
        </p>
      )}
    </div>
  );
}
