import { LogOut } from "lucide-react";
import { styles } from "../styles.js";

// Player Checkout During Open Play — see PROJECT.md. Shared by
// WaitingPlayersPanel.jsx (checking out a waiting player) and
// ScorerView.jsx (checking out a player mid-match, from their live court's
// PlayerChip) — one dialog, one copy, reused rather than duplicated.
// Reuses SessionSettingsDialog.jsx's exact modal styles
// (dialogOverlay/dialogCard/dialogHeadRow/dialogTitle/dialogActions)
// rather than the native window.confirm() this app uses elsewhere for
// Remove Player/End Session — TESTING.md's own Finding #1 already flagged
// window.confirm as unstylable and untestable by automation.
export default function CheckoutConfirmDialog({ player, onCancel, onConfirm }) {
  return (
    <div style={styles.dialogOverlay} onClick={onCancel}>
      <div style={styles.dialogCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>Check Out Player</h2>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--ink)", margin: "0 0 8px 0", lineHeight: 1.4 }}>
          <strong>{player.name}</strong> will no longer be included in future match generation.
        </p>
        <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.4 }}>
          Current matches already in progress will not be affected.
        </p>
        <div style={styles.dialogActions}>
          <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" style={styles.dangerBtn} onClick={() => onConfirm(player.id)}>
            <LogOut size={14} strokeWidth={2.5} />
            Check Out
          </button>
        </div>
      </div>
    </div>
  );
}
