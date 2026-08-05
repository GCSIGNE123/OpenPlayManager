import { AlertTriangle, Check, X } from "lucide-react";
import { styles } from "../styles.js";

// Held Player Reminder — see PROJECT.md/FEATURES.md. Purely a facilitator
// nudge: renders a small, non-blocking, dismissible card per held player
// who's crossed the configurable threshold (see PickleballOpenPlay.jsx's
// ticking effect and lib/queueManagement.js's getPlayersNeedingHeldReminder,
// which decided WHO belongs in `reminders` — this component only renders
// what it's given, same "logic outside the component" precedent as every
// other report/analytics view in this app). Fixed-position, stacked (see
// styles.heldReminderStack) — supports multiple simultaneous reminders —
// and never overlays/blocks the rest of the Scorer tab, unlike a dialog.
export default function HeldPlayerReminderBanner({ reminders, onResume, onKeepHeld }) {
  if (!reminders || reminders.length === 0) return null;

  return (
    <div style={styles.heldReminderStack}>
      {reminders.map((r) => (
        <div key={r.playerId} style={styles.heldReminderCard}>
          <div style={styles.heldReminderHeadRow}>
            <span style={styles.heldReminderTitle}>
              <AlertTriangle size={13} strokeWidth={2.5} style={{ verticalAlign: "-1px", marginRight: 5 }} />
              Held Player Reminder
            </span>
            <button
              style={styles.iconBtn}
              onClick={() => onKeepHeld(r.playerId)}
              aria-label={`dismiss reminder for ${r.playerName}`}
              title="Keep held (dismiss this reminder)"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>
          <p style={styles.heldReminderBody}>
            <strong>{r.playerName}</strong>
            {r.skill && <span style={styles.heldReminderSkill}> · {r.skill}</span>}
          </p>
          {r.lastPlayedText && <p style={styles.heldReminderMeta}>Last played: {r.lastPlayedText}</p>}
          <p style={styles.heldReminderBody}>
            Held for <strong>{r.minutesHeld} minutes</strong>
            {r.roundsHeld > 0 && ` (${r.roundsHeld} completed round${r.roundsHeld === 1 ? "" : "s"})`}.
          </p>
          <p style={styles.heldReminderPrompt}>Resume?</p>
          <div style={styles.heldReminderActions}>
            <button style={styles.secondaryBtn} onClick={() => onKeepHeld(r.playerId)}>
              Keep Held
            </button>
            <button style={styles.primaryBtn} onClick={() => onResume(r.playerId)}>
              <Check size={13} strokeWidth={2.5} />
              Resume
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
