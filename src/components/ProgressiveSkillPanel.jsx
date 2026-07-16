import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { styles } from "../styles.js";
import { calculateSessionProgress, getProgressivePhase, buildPhases } from "../lib/progressiveSkillPhase.js";

const PHASE_LABELS = { mentorship: "Mentorship", transition: "Transition", competitive: "Competitive" };

// Progressive Skill Rotation's phase indicator, settings, and stats — only
// rendered when that rotation mode is active (see ScorerView). Doesn't
// touch pairing itself; purely display + the two organizer-configurable
// numbers (expectedGamesPerPlayer, progressiveSkillThresholds) that feed
// the phase calc in lib/progressiveSkillPhase.js.
export default function ProgressiveSkillPanel({
  players,
  expectedGamesPerPlayer,
  setExpectedGamesPerPlayer,
  progressiveSkillThresholds,
  setProgressiveSkillThresholds,
  matchHistory,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sessionProgress = calculateSessionProgress(players, expectedGamesPerPlayer);
  const phases = buildPhases(progressiveSkillThresholds);
  const activePhase = getProgressivePhase(sessionProgress, progressiveSkillThresholds);

  // matches played per phase this session — matchHistory entries are
  // tagged with the phase active when that match was played (see endMatch
  // in PickleballOpenPlay.jsx), so this reflects the session's actual
  // history rather than just the current phase's count
  const phaseCounts = { mentorship: 0, transition: 0, competitive: 0 };
  matchHistory.forEach((m) => {
    if (m.phase && phaseCounts[m.phase] !== undefined) phaseCounts[m.phase] += 1;
  });

  return (
    <div style={styles.progressiveSkillPanel}>
      <div style={styles.rotationRow}>
        <span key={activePhase.key} style={styles.phaseBadge(activePhase.key)}>
          {activePhase.label}
        </span>
        <span style={styles.toolbarText}>{sessionProgress}% of expected games</span>
        <button style={styles.settingsToggleBtn} onClick={() => setSettingsOpen((v) => !v)}>
          {settingsOpen ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
          Settings
        </button>
      </div>

      <div style={styles.progressBarTrack}>
        {phases.map((p) => (
          <div
            key={p.key}
            style={{
              ...styles.progressBarZone(p.key, p.key === activePhase.key),
              width: `${p.max - p.min}%`,
            }}
          />
        ))}
        <div style={{ ...styles.progressBarMarker, left: `${sessionProgress}%` }} />
      </div>
      <div style={styles.progressBarLabels}>
        <span>Mentorship</span>
        <span>Transition</span>
        <span>Competitive</span>
      </div>

      {settingsOpen && (
        <div style={styles.settingsPanel}>
          <label style={styles.settingsField}>
            Expected games/player
            <input
              type="number"
              min={1}
              style={styles.expectedGamesInput}
              value={expectedGamesPerPlayer}
              onChange={(e) => setExpectedGamesPerPlayer(e.target.value)}
            />
          </label>
          <label style={styles.settingsField}>
            Mentorship ends at (%)
            <input
              type="number"
              min={1}
              max={98}
              style={styles.expectedGamesInput}
              value={phases[0].max}
              onChange={(e) => setProgressiveSkillThresholds({ mentorshipMax: e.target.value })}
            />
          </label>
          <label style={styles.settingsField}>
            Transition ends at (%)
            <input
              type="number"
              min={2}
              max={99}
              style={styles.expectedGamesInput}
              value={phases[1].max}
              onChange={(e) => setProgressiveSkillThresholds({ transitionMax: e.target.value })}
            />
          </label>
        </div>
      )}

      <div style={styles.statsRow}>
        {phases.map((p) => (
          <span key={p.key} style={styles.statsChip(p.key)}>
            {PHASE_LABELS[p.key]}: {phaseCounts[p.key]}
          </span>
        ))}
      </div>
    </div>
  );
}
