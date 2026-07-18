import { useState } from "react";
import { Check, X } from "lucide-react";
import { styles } from "../styles.js";

// Editable session properties, post-creation. Rotation Mode is deliberately
// NOT editable here — it's chosen once at Create Session and shown
// read-only for reference (see PROJECT.md: "there's no later control to
// switch it, so it can't drift mid-session"). Court count already has its
// own +/- stepper in Scorer, so it isn't duplicated here either.
export default function SessionSettingsDialog({
  venue,
  rotationModeLabel,
  expectedGamesPerPlayer,
  progressiveSkillThresholds,
  showThresholds,
  onSave,
  onClose,
}) {
  const [venueDraft, setVenueDraft] = useState(venue);
  const [expectedGamesDraft, setExpectedGamesDraft] = useState(expectedGamesPerPlayer);
  const [mentorshipMaxDraft, setMentorshipMaxDraft] = useState(progressiveSkillThresholds?.mentorshipMax ?? 30);
  const [transitionMaxDraft, setTransitionMaxDraft] = useState(progressiveSkillThresholds?.transitionMax ?? 60);

  const venueValid = venueDraft.trim().length > 0;

  const handleSave = () => {
    if (!venueValid) return;
    onSave({
      venue: venueDraft.trim(),
      expectedGamesPerPlayer: Math.max(1, Number(expectedGamesDraft) || 1),
      ...(showThresholds
        ? {
            progressiveSkillThresholds: {
              mentorshipMax: Number(mentorshipMaxDraft) || 30,
              transitionMax: Number(transitionMaxDraft) || 60,
            },
          }
        : {}),
    });
    onClose();
  };

  return (
    <div style={styles.dialogOverlay} onClick={onClose}>
      <div style={styles.dialogCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>Session Settings</h2>
          <button style={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div style={styles.dialogField}>
          <label style={styles.dialogLabel}>Venue name</label>
          <input
            style={styles.input}
            value={venueDraft}
            onChange={(e) => setVenueDraft(e.target.value)}
            placeholder="e.g. Ormoc City Saturday Open Play"
          />
          {!venueValid && <p style={styles.editWarning}>Venue name can't be empty.</p>}
        </div>

        <div style={styles.dialogField}>
          <label style={styles.dialogLabel}>Rotation mode</label>
          <p style={styles.dialogReadOnlyValue}>{rotationModeLabel} — chosen at session creation, not editable here</p>
        </div>

        <div style={styles.dialogField}>
          <label style={styles.dialogLabel}>Expected games per player</label>
          <input
            type="number"
            min={1}
            style={{ ...styles.expectedGamesInput, width: 64 }}
            value={expectedGamesDraft}
            onChange={(e) => setExpectedGamesDraft(e.target.value)}
          />
        </div>

        {showThresholds && (
          <div style={styles.dialogField}>
            <label style={styles.dialogLabel}>Progressive Skill phase boundaries (%)</label>
            <div style={styles.dialogThresholdRow}>
              <label style={styles.settingsField}>
                Mentorship ends at
                <input
                  type="number"
                  min={1}
                  max={98}
                  style={styles.expectedGamesInput}
                  value={mentorshipMaxDraft}
                  onChange={(e) => setMentorshipMaxDraft(e.target.value)}
                />
              </label>
              <label style={styles.settingsField}>
                Transition ends at
                <input
                  type="number"
                  min={2}
                  max={99}
                  style={styles.expectedGamesInput}
                  value={transitionMaxDraft}
                  onChange={(e) => setTransitionMaxDraft(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        <div style={styles.dialogActions}>
          <button style={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{ ...styles.primaryBtn, ...(!venueValid ? styles.btnDisabled : {}) }}
            onClick={handleSave}
            disabled={!venueValid}
          >
            <Check size={14} strokeWidth={3} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
