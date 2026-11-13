// Skill Divisions — the one definition of "which division is this player
// in" and "does this session run divisions", shared by the podium
// (lib/podium.js) and the fixed-pair rule (lib/fixedPairRules.js) so the two
// can never disagree with AdaptiveSkillRotationEngine, whose pool split is
// the exact same test (`skill === "intermediate"` → Intermediate, anything
// else → Beginner). Pure, no imports.

export const DIVISIONS = [
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
];

export const DIVISION_MODES = ["adaptiveSkill"];

export const divisionOf = (player) => (player?.skill === "intermediate" ? "intermediate" : "beginner");

export const divisionLabel = (division) => (division === "intermediate" ? "Intermediate" : "Beginner");

export const sessionHasDivisions = (state) => DIVISION_MODES.includes(state?.rotationMode);
