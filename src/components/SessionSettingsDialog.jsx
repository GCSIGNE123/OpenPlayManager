import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { styles } from "../styles.js";

// Announcement Delay — see PROJECT.md/FEATURES.md. Immediate / 2s
// (default) / 5s / 10s, stored as milliseconds.
const ANNOUNCEMENT_DELAY_OPTIONS = [
  { value: 0, label: "Immediate" },
  { value: 2000, label: "2 seconds (default)" },
  { value: 5000, label: "5 seconds" },
  { value: 10000, label: "10 seconds" },
];

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
  adaptiveSkillThresholds,
  showAdaptiveThresholds,
  courtDispatchSettings,
  heldPlayerReminderSettings,
  alwaysPairPlayers,
  onSave,
  onClose,
}) {
  const [venueDraft, setVenueDraft] = useState(venue);
  const [expectedGamesDraft, setExpectedGamesDraft] = useState(expectedGamesPerPlayer);
  const [mentorshipMaxDraft, setMentorshipMaxDraft] = useState(progressiveSkillThresholds?.mentorshipMax ?? 30);
  const [transitionMaxDraft, setTransitionMaxDraft] = useState(progressiveSkillThresholds?.transitionMax ?? 60);
  const [promotionWinsDraft, setPromotionWinsDraft] = useState(adaptiveSkillThresholds?.promotionWins ?? 3);
  const [relegationLossesDraft, setRelegationLossesDraft] = useState(adaptiveSkillThresholds?.relegationLosses ?? 3);

  // Held Player Reminder — see PROJECT.md/FEATURES.md. Rotation-mode-
  // agnostic, always shown (Hold Player exists in every mode).
  const [heldThresholdMinutesDraft, setHeldThresholdMinutesDraft] = useState(heldPlayerReminderSettings?.thresholdMinutes ?? 20);
  const [heldThresholdRoundsDraft, setHeldThresholdRoundsDraft] = useState(heldPlayerReminderSettings?.thresholdRounds ?? 3);
  const [heldRepeatIntervalDraft, setHeldRepeatIntervalDraft] = useState(heldPlayerReminderSettings?.repeatIntervalMinutes ?? 10);

  // Smart Court Dispatch — see PROJECT.md/FEATURES.md. Rotation-mode-
  // agnostic, always shown (unlike the per-mode threshold sections above).
  const [autoFillCourtsDraft, setAutoFillCourtsDraft] = useState(courtDispatchSettings?.autoFillCourts !== false);
  const [autoStartMatchDraft, setAutoStartMatchDraft] = useState(courtDispatchSettings?.autoStartMatch !== false);
  const [voiceEnabledDraft, setVoiceEnabledDraft] = useState(courtDispatchSettings?.voiceEnabled !== false);
  const [volumeDraft, setVolumeDraft] = useState(courtDispatchSettings?.volume ?? 1);
  const [rateDraft, setRateDraft] = useState(courtDispatchSettings?.rate ?? 1);
  const [voiceURIDraft, setVoiceURIDraft] = useState(courtDispatchSettings?.voiceURI ?? "");
  const [announcementDelayDraft, setAnnouncementDelayDraft] = useState(courtDispatchSettings?.announcementDelayMs ?? 2000);
  const [availableVoices, setAvailableVoices] = useState([]);

  // Permanent Partner Mode — see PROJECT.md/FEATURES.md. Rotation-mode-
  // agnostic, always shown (Continuous and Adaptive Skill Rotation both
  // honor it; other modes simply aren't wired to read it yet — see
  // BalancedRotationEngine.buildTeams).
  const [alwaysPairPlayersDraft, setAlwaysPairPlayersDraft] = useState(alwaysPairPlayers === true);

  // Voice list — window.speechSynthesis.getVoices() is frequently empty
  // until the browser fires 'voiceschanged' (a well-known quirk), so this
  // re-reads it on that event too. A no-op (empty list, "browser default"
  // still selectable) in any environment without SpeechSynthesis at all.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
    const loadVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

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
      ...(showAdaptiveThresholds
        ? {
            adaptiveSkillThresholds: {
              promotionWins: Math.max(1, Number(promotionWinsDraft) || 3),
              relegationLosses: Math.max(1, Number(relegationLossesDraft) || 3),
            },
          }
        : {}),
      courtDispatchSettings: {
        autoFillCourts: autoFillCourtsDraft,
        autoStartMatch: autoStartMatchDraft,
        voiceEnabled: voiceEnabledDraft,
        volume: Number(volumeDraft),
        rate: Number(rateDraft),
        voiceURI: voiceURIDraft || null,
        announcementDelayMs: Number(announcementDelayDraft),
      },
      heldPlayerReminderSettings: {
        thresholdMinutes: Math.max(1, Number(heldThresholdMinutesDraft) || 20),
        thresholdRounds: Math.max(1, Number(heldThresholdRoundsDraft) || 3),
        repeatIntervalMinutes: Math.max(1, Number(heldRepeatIntervalDraft) || 10),
      },
      alwaysPairPlayers: alwaysPairPlayersDraft,
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

        {showAdaptiveThresholds && (
          <div style={styles.dialogField}>
            <label style={styles.dialogLabel}>Adaptive Skill Rotation thresholds</label>
            <div style={styles.dialogThresholdRow}>
              <label style={styles.settingsField}>
                Promote after (consecutive wins)
                <input
                  type="number"
                  min={1}
                  style={styles.expectedGamesInput}
                  value={promotionWinsDraft}
                  onChange={(e) => setPromotionWinsDraft(e.target.value)}
                />
              </label>
              <label style={styles.settingsField}>
                Relegate after (consecutive losses)
                <input
                  type="number"
                  min={1}
                  style={styles.expectedGamesInput}
                  value={relegationLossesDraft}
                  onChange={(e) => setRelegationLossesDraft(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        <div style={styles.dialogField}>
          <label style={styles.dialogLabel}>Held Player Reminder</label>
          <p style={styles.dialogReadOnlyValue}>
            Nudges the facilitator about a player who's stayed held a while — never affects matchmaking or player priority.
          </p>
          <div style={styles.dialogThresholdRow}>
            <label style={styles.settingsField}>
              Remind after (minutes held)
              <input
                type="number"
                min={1}
                style={styles.expectedGamesInput}
                value={heldThresholdMinutesDraft}
                onChange={(e) => setHeldThresholdMinutesDraft(e.target.value)}
              />
            </label>
            <label style={styles.settingsField}>
              Or after (completed rounds)
              <input
                type="number"
                min={1}
                style={styles.expectedGamesInput}
                value={heldThresholdRoundsDraft}
                onChange={(e) => setHeldThresholdRoundsDraft(e.target.value)}
              />
            </label>
            <label style={styles.settingsField}>
              Repeat every (minutes)
              <input
                type="number"
                min={1}
                style={styles.expectedGamesInput}
                value={heldRepeatIntervalDraft}
                onChange={(e) => setHeldRepeatIntervalDraft(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div style={styles.dialogField}>
          <label style={styles.dialogLabel}>Permanent Partner Mode</label>
          <label style={styles.settingsCheckboxRow}>
            <input
              type="checkbox"
              checked={alwaysPairPlayersDraft}
              onChange={(e) => setAlwaysPairPlayersDraft(e.target.checked)}
            />
            Always Pair Players — designated partners (set in the Waiting Players panel) always stay teamed together; only opponents rotate
          </label>
        </div>

        <div style={styles.dialogField}>
          <label style={styles.dialogLabel}>Smart Court Dispatch</label>
          <label style={styles.settingsCheckboxRow}>
            <input
              type="checkbox"
              checked={autoFillCourtsDraft}
              onChange={(e) => setAutoFillCourtsDraft(e.target.checked)}
            />
            Auto-fill Courts — automatically dispatch the next eligible matchup when a court frees up
          </label>
          <label style={styles.settingsCheckboxRow}>
            <input
              type="checkbox"
              checked={autoStartMatchDraft}
              onChange={(e) => setAutoStartMatchDraft(e.target.checked)}
            />
            Auto Start Match — otherwise a dispatched court stays "Calling Players..." until manually started
          </label>
          <label style={styles.settingsCheckboxRow}>
            <input
              type="checkbox"
              checked={voiceEnabledDraft}
              onChange={(e) => setVoiceEnabledDraft(e.target.checked)}
            />
            Voice Announcements
          </label>

          <div style={styles.dialogThresholdRow}>
            <label style={styles.settingsField}>
              Announcement Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={volumeDraft}
                onChange={(e) => setVolumeDraft(e.target.value)}
                disabled={!voiceEnabledDraft}
              />
            </label>
            <label style={styles.settingsField}>
              Announcement Speed
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={rateDraft}
                onChange={(e) => setRateDraft(e.target.value)}
                disabled={!voiceEnabledDraft}
              />
            </label>
          </div>

          <label style={styles.settingsField}>
            Announcement Voice
            <select
              style={styles.input}
              value={voiceURIDraft}
              onChange={(e) => setVoiceURIDraft(e.target.value)}
              disabled={!voiceEnabledDraft}
            >
              <option value="">Browser default</option>
              {availableVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>

          <label style={styles.settingsField}>
            Announcement Delay
            <select
              style={styles.input}
              value={announcementDelayDraft}
              onChange={(e) => setAnnouncementDelayDraft(e.target.value)}
            >
              {ANNOUNCEMENT_DELAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

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
