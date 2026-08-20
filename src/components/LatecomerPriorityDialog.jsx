import { Zap } from "lucide-react";
import { styles } from "../styles.js";

function teamLabel(ids, players) {
  return (ids || []).map((id) => players?.[id]?.name || "Unknown player").join(" + ");
}

// Latecomer Priority — see PROJECT.md/FEATURES.md and lib/utils.js's
// computeLatecomerPriorityPreview (the pure logic this only renders — this
// component never computes or validates a proposal itself). A facilitator-
// control override layer around the existing nextMatchups system, not a
// new matchmaking algorithm: Cancel leaves the queue completely untouched
// (this dialog itself never calls save()); Apply Priority is the one action
// that does.
export default function LatecomerPriorityDialog({ preview, players, onCancel, onApply }) {
  if (!preview) return null;
  const { result, stale } = preview;

  return (
    <div style={styles.dialogOverlay} onClick={onCancel}>
      <div style={styles.dialogCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>
            <Zap size={16} strokeWidth={2.5} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Prioritize Next Match
          </h2>
        </div>

        {stale && (
          <p style={{ fontSize: 12.5, color: "var(--color-error)", margin: "0 0 10px 0", lineHeight: 1.4 }}>
            The queue changed since this preview was shown — reviewing the updated proposal below.
          </p>
        )}

        {!result.ok ? (
          <p style={{ fontSize: 13.5, color: "var(--ink)", margin: "0 0 8px 0", lineHeight: 1.4 }}>{result.reason}</p>
        ) : (
          <>
            <p style={styles.dialogLabel}>Current</p>
            <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", margin: "0 0 10px 0", lineHeight: 1.4 }}>
              {teamLabel(result.before.teamA, players)} vs {teamLabel(result.before.teamB, players)}
            </p>
            <p style={styles.dialogLabel}>Proposed</p>
            <p style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 700, margin: "0 0 10px 0", lineHeight: 1.4 }}>
              {teamLabel(result.after.teamA, players)} vs {teamLabel(result.after.teamB, players)}
            </p>
            <p style={styles.dialogLabel}>{result.displacedPlayerIds.length === 1 ? "Displaced player" : "Displaced players"}</p>
            <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.4 }}>
              {result.displacedPlayerIds.map((id) => players?.[id]?.name || "Unknown player").join(", ")} → returns to queue
            </p>
          </>
        )}

        <div style={styles.dialogActions}>
          <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
          {result.ok && (
            <button type="button" style={styles.primaryBtn} onClick={onApply}>
              <Zap size={14} strokeWidth={2.5} />
              Apply Priority
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
