import { RotationEngine } from "./RotationEngine.js";
import { BalancedRotationEngine } from "./BalancedRotationEngine.js";
import { TransitionRotationEngine } from "./TransitionRotationEngine.js";
import { shuffle, uid } from "../lib/random.js";

// "Progressive Skill Rotation" — phase-aware strategy.
//
// The active phase (see src/lib/progressiveSkillPhase.js — Mentorship,
// Transition, Competitive, based on state.expectedGamesPerPlayer) is passed
// in via context.phase by src/lib/utils.js's refreshNextMatchups /
// regenerateNextMatchups.
//
// - Mentorship: pairing mirrors BalancedRotationEngine — prioritize
//   beginner+intermediate teams, avoid repeating a player's most recent
//   partner, and minimize repeated opponents. Delegated to
//   BalancedRotationEngine rather than duplicated, since that's exactly the
//   scoring this phase wants.
// - Transition: delegated to TransitionRotationEngine — beginner+intermediate
//   teams are a soft preference (not mandatory), Performance Rating factors
//   into which two teams face off (balancing match quality), and repeated
//   partners/opponents are still avoided. See that file for the full scoring.
// - Competitive: not implemented yet — still the placeholder "Random"
//   behavior (shuffle the waiting pool, pair 2-and-2, no skill or history
//   awareness), so the phase remains fully selectable without pretending to
//   implement matching that isn't built yet. Swap in real logic later; the
//   RotationEngine interface and the call sites in lib/utils.js won't need
//   to change.
export class ProgressiveSkillRotationStrategy extends RotationEngine {
  constructor() {
    super();
    this.mentorshipEngine = new BalancedRotationEngine();
    this.transitionEngine = new TransitionRotationEngine();
  }

  generateMatchups(context, allowSameSkillFallback = false) {
    if (context.phase === "mentorship") {
      return this.mentorshipEngine.generateMatchups(context, allowSameSkillFallback);
    }
    if (context.phase === "transition") {
      return this.transitionEngine.generateMatchups(context);
    }
    return this.generateRandomMatchups(context);
  }

  generateRandomMatchups({ waitingIds, players, existingMatchups }) {
    const reserved = new Set(existingMatchups.flatMap((m) => [...m.teamA, ...m.teamB]));
    const pool = shuffle(waitingIds.filter((id) => !reserved.has(id) && players[id]));

    const matchups = [];
    while (pool.length >= 4) {
      const [a, b, c, d] = pool.splice(0, 4);
      matchups.push({ id: uid(), teamA: [a, b], teamB: [c, d] });
    }
    return matchups;
  }
}
