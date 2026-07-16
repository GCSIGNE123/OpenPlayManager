import { RotationEngine } from "./RotationEngine.js";
import { BalancedRotationEngine } from "./BalancedRotationEngine.js";
import { TransitionRotationEngine } from "./TransitionRotationEngine.js";
import { CompetitiveRotationEngine } from "./CompetitiveRotationEngine.js";

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
// - Competitive: delegated to CompetitiveRotationEngine — beginner/intermediate
//   skill labels are ignored entirely; players are paired primarily by
//   current session Performance Rating, while still avoiding repeated
//   partners and opponents. See that file for the full scoring.
export class ProgressiveSkillRotationStrategy extends RotationEngine {
  constructor() {
    super();
    this.mentorshipEngine = new BalancedRotationEngine();
    this.transitionEngine = new TransitionRotationEngine();
    this.competitiveEngine = new CompetitiveRotationEngine();
  }

  generateMatchups(context, allowSameSkillFallback = false) {
    if (context.phase === "mentorship") {
      return this.mentorshipEngine.generateMatchups(context, allowSameSkillFallback);
    }
    if (context.phase === "transition") {
      return this.transitionEngine.generateMatchups(context);
    }
    if (context.phase === "competitive") {
      return this.competitiveEngine.generateMatchups(context);
    }
    // no phase context (e.g. not yet computed) -- fall back to the
    // Mentorship engine rather than leaving matchups unbuilt
    return this.mentorshipEngine.generateMatchups(context, allowSameSkillFallback);
  }
}
