import { RotationEngine } from "./RotationEngine.js";
import { BalancedRotationEngine } from "./BalancedRotationEngine.js";
import { TransitionRotationEngine } from "./TransitionRotationEngine.js";
import { CompetitiveRotationEngine } from "./CompetitiveRotationEngine.js";

// Progressive Skill Rotation Fallback — see PROJECT.md. Mentorship's
// mandatory beginner+intermediate pairing (BalancedRotationEngine, below)
// assumes at least two distinct skill groups are present in the pool. When
// every registered player shares one skill level, one of its two groups is
// empty, its pairing loop never runs, and generateMatchups silently returns
// [] forever — no error surfaced anywhere, the court queue just never
// fills. shouldUseRandomFirstRound(players) detects that condition —
// counting DISTINCT skill values rather than checking for specific names
// ("beginner"/"intermediate"), so it keeps working unchanged if more skill
// tiers (Lower Intermediate, Upper Intermediate, Professional, ...) are
// ever added.
//
// Deliberately a live condition, re-checked on every generateMatchups call,
// not a one-shot "was this round 1" flag — there's no reliable signal in
// this function's own context to know "has any round ever been generated
// for this session" without new plumbing this task doesn't need. The
// practical effect is exactly what was asked for: the fallback applies for
// as long as the pool stays single-skill (never stalls, even past round 1),
// and reverts to normal mixed-skill Mentorship pairing the instant a second
// skill level becomes available (e.g. an intermediate checks in later) —
// automatic, no organizer action, no separate "resume PSR" step to wire up.
export function shouldUseRandomFirstRound(players) {
  const skills = new Set(Object.values(players).map((p) => p.skill).filter(Boolean));
  return skills.size <= 1;
}

// The "fallback randomizer" the spec asks for — deliberately NOT a new
// pairing algorithm. BalancedRotationEngine.generateMatchups's existing
// allowSameSkillFallback=true path already IS a fair, high-quality-shuffle,
// history-aware random pairing: pairLeftovers (shuffle + partner-recency
// scoring via the same scorePartner every other phase uses) forms teams,
// then buildMatchupsFromTeams (opponent-recency scoring) pairs those teams
// into matchups — the exact same two scoring functions Mentorship's normal
// mixed-skill path already runs. On a genuine round 1 (no partner/opponent
// history yet), every pairing scores identically, so the result reads as
// pure random — while on a later round, the exact same call naturally
// starts avoiding repeat teammates/opponents again, with zero extra code
// here. This is the whole reason this function is a one-line delegation
// rather than a duplicated shuffle-and-chunk implementation.
export function generateRandomOpeningRound(context, mentorshipEngine) {
  return mentorshipEngine.generateMatchups(context, true);
}

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
//   scoring this phase wants. Falls back to generateRandomOpeningRound
//   (see above) when shouldUseRandomFirstRound says the pool is
//   single-skill, so a Mentorship-phase session with only one skill level
//   present can still generate matches instead of silently stalling.
// - Transition: delegated to TransitionRotationEngine — beginner+intermediate
//   teams are a soft preference (not mandatory), Performance Rating factors
//   into which two teams face off (balancing match quality), and repeated
//   partners/opponents are still avoided. See that file for the full
//   scoring. Never hard-splits by skill, so a single-skill pool already
//   degrades gracefully here — no fallback needed.
// - Competitive: delegated to CompetitiveRotationEngine — beginner/intermediate
//   skill labels are ignored entirely; players are paired primarily by
//   current session Performance Rating, while still avoiding repeated
//   partners and opponents. See that file for the full scoring. Already
//   skill-agnostic — no fallback needed.
export class ProgressiveSkillRotationStrategy extends RotationEngine {
  constructor() {
    super();
    this.mentorshipEngine = new BalancedRotationEngine();
    this.transitionEngine = new TransitionRotationEngine();
    this.competitiveEngine = new CompetitiveRotationEngine();
  }

  generateMatchups(context, allowSameSkillFallback = false) {
    if (context.phase === "mentorship") {
      return this.mentorshipMatchups(context, allowSameSkillFallback);
    }
    if (context.phase === "transition") {
      return this.transitionEngine.generateMatchups(context);
    }
    if (context.phase === "competitive") {
      return this.competitiveEngine.generateMatchups(context);
    }
    // no phase context (e.g. not yet computed) -- fall back to the
    // Mentorship engine rather than leaving matchups unbuilt
    return this.mentorshipMatchups(context, allowSameSkillFallback);
  }

  mentorshipMatchups(context, allowSameSkillFallback) {
    const useFallback = allowSameSkillFallback || shouldUseRandomFirstRound(context.players);
    return useFallback ? generateRandomOpeningRound(context, this.mentorshipEngine) : this.mentorshipEngine.generateMatchups(context, false);
  }
}
