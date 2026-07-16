// Progressive Skill Rotation's phase engine. Session "progress" is how far
// through everyone's expected games the room is, on average — not the
// pairing logic itself (that's still the placeholder random pairing in
// ProgressiveSkillRotationStrategy; this only decides which phase label to
// show, per PROJECT.md's progressive-skill design).
export const PROGRESSIVE_SKILL_PHASES = [
  { key: "mentorship", label: "Mentorship", min: 0, max: 30 },
  { key: "transition", label: "Transition", min: 31, max: 60 },
  { key: "competitive", label: "Competitive", min: 61, max: 100 },
];

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

export function getProgressivePhase(progressPercent) {
  return (
    PROGRESSIVE_SKILL_PHASES.find((p) => progressPercent >= p.min && progressPercent <= p.max) ||
    PROGRESSIVE_SKILL_PHASES[PROGRESSIVE_SKILL_PHASES.length - 1]
  );
}
