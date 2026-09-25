import { AdaptiveRankingRotationEngine } from "./AdaptiveRankingRotationEngine.js";

// Points-Based Adaptive Matchmaking (rotationMode "pointsAdaptive"), used from
// Round 3 onward. Rounds 1-2 are organizer-controlled calibration and never
// reach this engine (see lib/openPlayPhases.js).
//
// It is the Adaptive Ranking search (rest protection -> games/wait fairness
// tiers -> long-wait rescue -> Points neighbourhood -> partner / opponent /
// same-four variety -> team balance) with two policy differences, both carried
// purely as configuration so no matchmaking code is duplicated:
//   1. ONE GLOBAL POOL — the Beginner/Intermediate label is never read
//      (`useSkillLabels: false`): no skill division, no mixed-skill team rule.
//      Long-term skill comes only from PickleKing Points.
//   2. TEAM BALANCE — the two teams' Points-sum imbalance is compared in bands
//      of TEAM_BALANCE_BAND_POINTS and ranked ahead of partner-freshness /
//      opponent variety, so a clearly better-balanced split wins.
//
// "POINTS DETERMINE COMPATIBILITY, FAIRNESS DETERMINES WHO GOES": the anchor
// (who must play next) is chosen by rest -> games tier -> wait, never by
// Points; Points only choose the other three from the fairness-eligible arena,
// and the wait-time guard lets a substantially longer waiter inside the Points
// window beat a small Points advantage without ever dragging in a player far
// outside it.
export const TEAM_BALANCE_BAND_POINTS = 60;

// GAMES GAP GUARD: a quartet that leaves out an eligible candidate with >= this
// many FEWER completed games than one of its members ranks below one that
// doesn't (soft; never idles a court).
export const GAMES_GAP_THRESHOLD = 2;
// CALIBRATION (lib/calibrationProfile.js): affinity from the organizer's Rounds
// 1-2 prefers compatible quartets while calibration confidence is high; the
// confidence falls linearly to 0 as a quartet's average games reach
// CALIBRATION_DECAY_GAMES. Weight 0 disables the affinity term.
export const CALIBRATION_AFFINITY_WEIGHT = 1;
export const CALIBRATION_DECAY_GAMES = 6;

export const POINTS_ADAPTIVE_CONFIG = {
  useSkillLabels: false,
  teamBalanceBand: TEAM_BALANCE_BAND_POINTS,
  restOnlyAfterPlay: true, // a fresh check-in is not "resting": latecomers are judged by normal fairness
  gamesGapThreshold: GAMES_GAP_THRESHOLD,
  useCalibratedPoints: true, // Points neighbourhood / team balance read the session-local calibrated estimate
  calibrationAffinityWeight: CALIBRATION_AFFINITY_WEIGHT,
  calibrationDecayGames: CALIBRATION_DECAY_GAMES,
};

export class PointsAdaptiveMatchmakingEngine extends AdaptiveRankingRotationEngine {
  generateMatchups(context) {
    return super.generateMatchups({ ...context, config: { ...POINTS_ADAPTIVE_CONFIG, ...(context.config || {}) } });
  }
}
