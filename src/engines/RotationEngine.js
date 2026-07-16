// Base interface for pluggable matchmaking/rotation strategies (Strategy
// pattern). The rest of the app only ever calls generateMatchups() through
// src/lib/utils.js's refreshNextMatchups/regenerateNextMatchups — it never
// depends on which concrete engine is active. To add a new rotation mode
// (Random Mixer, King of the Court, Winner-Up/Loser-Down, DUPR Rotation,
// Challenge Court, Round Robin, ...), extend this class and swap the
// instance created in src/lib/utils.js's `defaultEngine`.
export class RotationEngine {
  // context: {
  //   waitingIds: string[]          ids eligible to be newly grouped (already excludes anyone reserved in existingMatchups or sitting out)
  //   players: Record<id, Player>   full player map (for skill, history, etc.)
  //   existingMatchups: Matchup[]   matchups already built and not to be touched
  // }
  // returns: Matchup[] — NEW matchups to append (never mutates existingMatchups)
  // Matchup shape: { id, teamA: [id, id], teamB: [id, id] }
  generateMatchups(context) {
    throw new Error("generateMatchups() must be implemented by a RotationEngine subclass");
  }
}
