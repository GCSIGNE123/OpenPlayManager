// CLI entry point for RotationSimulationEngine — runs a complete simulated
// Open Play session under Progressive Skill Rotation and prints the results
// to the console. No UI; see src/lib/simulation/RotationSimulationEngine.js
// for the engine itself, which returns a plain result object callers can
// also consume programmatically instead of (or alongside) the printout.
//
// Usage:
//   node scripts/run-simulation.mjs
//   node scripts/run-simulation.mjs --players=20 --courts=5 --games=8
//   node scripts/run-simulation.mjs --skillSplit=0.3 --mentorshipMax=20 --transitionMax=50
//   node scripts/run-simulation.mjs --randomPlayers   (picks a fresh 8-24 headcount for this run)
//
// --courts also accepts a comma-separated list to run the same session
// back-to-back at each court count and compare them (2, 3, and 4 courts is
// the common case this is for — how much a bigger venue would speed things
// up for the same group of players):
//   node scripts/run-simulation.mjs --courts=2,3,4
//   node scripts/run-simulation.mjs --players=20 --games=8 --courts=2,3,4
import {
  runSimulation,
  printSimulationReport,
  DEFAULT_SIMULATION_CONFIG,
  randomPlayerCount,
} from "../src/lib/simulation/RotationSimulationEngine.js";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const withValue = raw.match(/^--([\w-]+)=(.+)$/);
    if (withValue) {
      args[withValue[1]] = withValue[2];
      continue;
    }
    const bareFlag = raw.match(/^--([\w-]+)$/);
    if (bareFlag) args[bareFlag[1]] = true;
  }
  return args;
}

function buildBaseConfig(args) {
  const config = { ...DEFAULT_SIMULATION_CONFIG };
  if (args.randomPlayers) config.randomizePlayers = true;
  if (args.players) config.playerCount = Number(args.players);
  if (args.games) config.expectedGamesPerPlayer = Number(args.games);
  if (args.skillSplit) config.skillSplit = Number(args.skillSplit);
  if (args.mentorshipMax || args.transitionMax) {
    config.progressiveSkillThresholds = {
      mentorshipMax: args.mentorshipMax ? Number(args.mentorshipMax) : config.progressiveSkillThresholds.mentorshipMax,
      transitionMax: args.transitionMax ? Number(args.transitionMax) : config.progressiveSkillThresholds.transitionMax,
    };
  }
  return config;
}

const args = parseArgs(process.argv.slice(2));
const baseConfig = buildBaseConfig(args);
const courtCounts = args.courts
  ? args.courts.split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0)
  : [baseConfig.courtCount];

// resolve a randomized headcount once, up front, when comparing multiple
// court counts -- otherwise each court count would simulate a different
// random roster, and the comparison table wouldn't be apples-to-apples
if (baseConfig.randomizePlayers && courtCounts.length > 1) {
  baseConfig.playerCount = randomPlayerCount();
  baseConfig.randomizePlayers = false;
  console.log(`Randomized headcount for this comparison: ${baseConfig.playerCount} players`);
}

if (courtCounts.length === 1) {
  const result = runSimulation({ ...baseConfig, courtCount: courtCounts[0] });
  printSimulationReport(result);
} else {
  console.log(`\nRunning the same session at ${courtCounts.length} court counts: ${courtCounts.join(", ")}`);
  const comparison = [];
  for (const courtCount of courtCounts) {
    const result = runSimulation({ ...baseConfig, courtCount });
    printSimulationReport(result);
    comparison.push({
      Courts: courtCount,
      Players: result.config.playerCount,
      "Rounds run": result.roundsRun,
      "Total matches": result.totalMatches,
      "Ended cleanly": result.endedCleanly,
      Mentorship: result.phaseCounts.mentorship,
      Transition: result.phaseCounts.transition,
      Competitive: result.phaseCounts.competitive,
      "GP min": result.fairnessStats.minGames,
      "GP max": result.fairnessStats.maxGames,
      "GP avg": result.fairnessStats.avgGames,
      "GP stdDev": result.fairnessStats.stdDevGames,
      "Fairness Score": result.fairnessStats.fairnessScore,
    });
  }
  console.log("=== Court count comparison ===");
  console.table(comparison);
}
