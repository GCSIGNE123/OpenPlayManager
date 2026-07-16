import { RotationEngine } from "./RotationEngine.js";
import { shuffle, uid } from "../lib/random.js";

// "Progressive Skill Rotation" — placeholder strategy.
//
// Intended eventual behavior (not implemented yet): gradually escalate
// matchup difficulty within a session as players rack up games/wins —
// e.g. pairing players against closer skill/performance as the session
// progresses, rather than the fixed beginner+intermediate split
// BalancedRotationEngine always applies. That scoring isn't built yet.
//
// For now this returns the same kind of pairings a bare "Random" strategy
// would: shuffle the waiting pool and pair players up 2-and-2 with no
// skill awareness, partner-avoidance, or opponent-avoidance at all — just
// enough to make the mode fully selectable end-to-end (UI picker, engine
// wiring, matchup generation, court assignment) without pretending to
// implement progressive skill matching that isn't there yet. Swap the body
// of generateMatchups() for the real algorithm when it's ready; the
// RotationEngine interface and everywhere this plugs in (src/lib/utils.js's
// refreshNextMatchups/regenerateNextMatchups) won't need to change.
export class ProgressiveSkillRotationStrategy extends RotationEngine {
  generateMatchups({ waitingIds, players, existingMatchups }) {
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
