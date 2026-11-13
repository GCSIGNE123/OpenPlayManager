// Same-Division Fixed Pairs — see PROJECT.md/FEATURES.md.
//
// In a Skill Divisions session (rotationMode "adaptiveSkill") a fixed pair
// must be two players of the SAME division: AdaptiveSkillRotationEngine
// builds each division's matchups from its own pool, so a Beginner +
// Intermediate pair could never actually be teamed and would only ever be
// dead weight (and, once the organizer alerts exist, a permanent "pair
// split" alert). The rule has three parts, all pure:
//
//   1. fixedPairBlockReason(state, a, b) — null when the pair is allowed,
//      otherwise the organizer-facing sentence to show. setFixedPartner
//      (lib/queueManagement.js) enforces it; the Partner dropdowns use it
//      to disable the other division's names with the reason.
//   2. splitPairIfCrossDivision(players, playerId, state) — after a level
//      change (manual → INT / → BEG, or an automatic promotion/relegation)
//      a pair that now spans two divisions is dissolved, both sides, so a
//      player never carries a partner they can no longer be teamed with.
//   3. pairRuleApplies(state) — the rule is scoped to division-separated
//      modes. Progressive Skill Rotation's mentorship phase deliberately
//      PAIRS a beginner with an intermediate, and Continuous Queue mixes
//      levels on purpose, so those modes keep accepting any pair exactly as
//      before.
//
// No React, no I/O — unit-testable under plain Node.

export const SAME_DIVISION_PAIR_MODES = ["adaptiveSkill"];

// Anyone whose skill isn't "intermediate" plays in the Beginner division —
// the same test AdaptiveSkillRotationEngine.generateMatchups uses to split
// its pool, kept identical here on purpose.
export const divisionOf = (player) => (player?.skill === "intermediate" ? "intermediate" : "beginner");
export const divisionLabel = (division) => (division === "intermediate" ? "Intermediate" : "Beginner");
export const sameDivision = (a, b) => divisionOf(a) === divisionOf(b);

export function pairRuleApplies(state) {
  return SAME_DIVISION_PAIR_MODES.includes(state?.rotationMode);
}

export function fixedPairBlockReason(state, a, b) {
  if (!pairRuleApplies(state) || !a || !b || sameDivision(a, b)) return null;
  return `${a.name} is ${divisionLabel(divisionOf(a))} and ${b.name} is ${divisionLabel(divisionOf(b))} — fixed pairs must be in the same division.`;
}

// Returns { players, partner } — `players` is a new map with both sides'
// partnerId cleared when the pair now spans two divisions (and the rule
// applies), otherwise the SAME map object and partner null. `partner` is the
// dissolved partner's record so callers can word their notice.
export function splitPairIfCrossDivision(players, playerId, state) {
  const p = players?.[playerId];
  const partner = p?.partnerId ? players[p.partnerId] : null;
  if (!partner || !pairRuleApplies(state) || sameDivision(p, partner)) return { players, partner: null };
  return {
    players: {
      ...players,
      [playerId]: { ...p, partnerId: null },
      [partner.id]: { ...partner, partnerId: null },
    },
    partner,
  };
}

export const pairDissolvedText = (playerName, partnerName) =>
  `Fixed pair ${playerName} & ${partnerName} removed — they are now in different divisions.`;
