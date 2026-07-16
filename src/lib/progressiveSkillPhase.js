// Progressive Skill Rotation's phase engine. Session "progress" is how far
// through everyone's expected games the room is, on average — not the
// pairing logic itself (that lives in ProgressiveSkillRotationStrategy and
// its per-phase engines; this only decides which phase is active and where
// its boundaries sit).
export const DEFAULT_PHASE_THRESHOLDS = { mentorshipMax: 30, transitionMax: 60 };

// builds the 3 phase zones from a pair of boundary percentages — organizer-
// configurable (state.progressiveSkillThresholds, default above) rather than
// hardcoded, so a session can tune how long Mentorship/Transition run.
// Boundaries are clamped to a sane 1-98 range and kept in order so the UI
// (settings inputs, the phase progress bar) can never produce a zero-width
// or inverted zone.
export function buildPhases(thresholds = DEFAULT_PHASE_THRESHOLDS) {
  const mentorshipMax = Math.min(98, Math.max(1, Math.round(thresholds?.mentorshipMax ?? DEFAULT_PHASE_THRESHOLDS.mentorshipMax)));
  const transitionMax = Math.min(99, Math.max(mentorshipMax + 1, Math.round(thresholds?.transitionMax ?? DEFAULT_PHASE_THRESHOLDS.transitionMax)));

  return [
    { key: "mentorship", label: "Mentorship", min: 0, max: mentorshipMax },
    { key: "transition", label: "Transition", min: mentorshipMax + 1, max: transitionMax },
    { key: "competitive", label: "Competitive", min: transitionMax + 1, max: 100 },
  ];
}

// kept for any existing callers/tests that want the default zones without
// passing thresholds through
export const PROGRESSIVE_SKILL_PHASES = buildPhases();

// average games played by currently-checked-in players, as a percentage of
// expectedGamesPerPlayer — clamped to [0, 100] since a player can keep
// playing past the expected count.
export function calculateSessionProgress(players, expectedGamesPerPlayer) {
  const checkedIn = Object.values(players).filter((p) => p.checkedIn);
  if (checkedIn.length === 0 || !expectedGamesPerPlayer) return 0;

  const avgGames = checkedIn.reduce((sum, p) => sum + (p.games || 0), 0) / checkedIn.length;
  const progress = (avgGames / expectedGamesPerPlayer) * 100;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function getProgressivePhase(progressPercent, thresholds = DEFAULT_PHASE_THRESHOLDS) {
  const phases = buildPhases(thresholds);
  return phases.find((p) => progressPercent >= p.min && progressPercent <= p.max) || phases[phases.length - 1];
}
