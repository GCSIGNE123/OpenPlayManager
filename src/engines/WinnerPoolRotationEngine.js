import { RotationEngine } from "./RotationEngine.js";
import { BalancedRotationEngine } from "./BalancedRotationEngine.js";

// "Winner Pool Rotation" — NOT traditional Winner-Up/Loser-Down.
//
// Courts are grouped into fixed adjacent pairs by court number: (1,2), (3,4),
// (5,6), ... When BOTH courts in a pair finish their match, this engine pools
// the results:
//   - the 4 winners (2 from each court) become a "Winner Pool"
//   - the 4 losers (2 from each court) become a "Loser Pool"
// and rebuilds 2 fresh teams for each pool — always 1 beginner + 1
// intermediate per team, never repeating the immediately-previous partner,
// and preferring not to repeat the immediately-previous opponent either.
// The Winner Pool's new match goes back on the pair's lower-numbered court;
// the Loser Pool's on the pair's higher-numbered court — so winners keep
// generally trending toward the "top" court and losers toward the "bottom"
// one, while partners and opponents keep mixing every round. See
// src/lib/winnerPoolRound.js for how this plugs into the court lifecycle
// (holding a finished court until its pair partner also finishes, etc.) —
// that orchestration doesn't fit the flat "one shared waiting queue" shape
// the RotationEngine interface assumes, so it lives outside the engine
// itself; this class only implements the pure "given exactly one pool of
// players, build 2 fair teams" step (steps 3-4 of the spec).
export class WinnerPoolRotationEngine extends RotationEngine {
  constructor() {
    super();
    // reuse BalancedRotationEngine's partner/opponent scoring and same-skill
    // fallback logic rather than re-implementing it — a pool is exactly the
    // kind of "small group, always try to end up 1 beginner + 1 intermediate
    // per team" problem it already solves
    this.pairingEngine = new BalancedRotationEngine();
  }

  // Not used directly — Winner Pool Rotation doesn't build matchups from a
  // flat waiting queue the way BalancedRotationEngine does. Kept so this
  // class still satisfies the RotationEngine interface; buildPoolMatchup
  // below is the method the app actually calls.
  generateMatchups() {
    return [];
  }

  // poolIds: exactly the 4 players in one pool (2 winners from each of 2
  // courts, or 2 losers from each of 2 courts). Returns { teamA, teamB } —
  // each an array of 2 ids — or null if the pool doesn't have 4 players
  // (shouldn't normally happen; courts always finish with exactly 2v2).
  buildPoolMatchup(poolIds, players) {
    if (poolIds.length !== 4) {
      // degrade gracefully rather than crash — reuse the general team
      // builder, which itself tolerates uneven/odd groups
      const teams = this.pairingEngine.buildTeams(poolIds, players, true);
      if (teams.length >= 2) return { teamA: teams[0], teamB: teams[1] };
      return null;
    }

    const beginners = poolIds.filter((id) => players[id]?.skill === "beginner");
    const intermediates = poolIds.filter((id) => players[id]?.skill === "intermediate");

    if (beginners.length === 2 && intermediates.length === 2) {
      return this.bestMixedSplit(beginners, intermediates, players);
    }

    // uneven skill split within this specific 4-person pool (e.g. 3
    // beginners + 1 intermediate ended up winning together) — same-skill
    // fallback is unavoidable here since the pool is fixed at exactly these
    // 4 people, unlike the general queue where mismatched players can just
    // keep waiting for a better mix
    const teams = this.pairingEngine.buildTeams(poolIds, players, true);
    return teams.length >= 2 ? { teamA: teams[0], teamB: teams[1] } : null;
  }

  // With exactly 2 beginners + 2 intermediates there are only 2 possible
  // team splits (b0+i0 vs b1+i1, or b0+i1 vs b1+i0) — small enough to score
  // both directly, combining Priority 2 (avoid repeat partners) and
  // Priority 3 (avoid repeat opponents) in one pass, rather than picking
  // teammates first and opponents as a separate, later step.
  bestMixedSplit(beginners, intermediates, players) {
    const [b0, b1] = beginners;
    const [i0, i1] = intermediates;
    const candidates = [
      { teamA: [b0, i0], teamB: [b1, i1] },
      { teamA: [b0, i1], teamB: [b1, i0] },
    ];
    let best = null;
    for (const c of candidates) {
      const score =
        this.pairingEngine.scorePartner(c.teamA[0], c.teamA[1], players) +
        this.pairingEngine.scorePartner(c.teamB[0], c.teamB[1], players) +
        this.pairingEngine.scoreOpponents(c.teamA, c.teamB, players);
      if (!best || score > best.score) best = { ...c, score };
    }
    return { teamA: best.teamA, teamB: best.teamB };
  }
}
