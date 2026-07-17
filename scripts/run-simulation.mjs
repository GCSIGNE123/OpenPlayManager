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
import { runSimulation, printSimulationReport, DEFAULT_SIMULATION_CONFIG } from "../src/lib/simulation/RotationSimulationEngine.js";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = raw.match(/^--([\w-]+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const config = { ...DEFAULT_SIMULATION_CONFIG };
if (args.players) config.playerCount = Number(args.players);
if (args.courts) config.courtCount = Number(args.courts);
if (args.games) config.expectedGamesPerPlayer = Number(args.games);
if (args.skillSplit) config.skillSplit = Number(args.skillSplit);
if (args.mentorshipMax || args.transitionMax) {
  config.progressiveSkillThresholds = {
    mentorshipMax: args.mentorshipMax ? Number(args.mentorshipMax) : config.progressiveSkillThresholds.mentorshipMax,
    transitionMax: args.transitionMax ? Number(args.transitionMax) : config.progressiveSkillThresholds.transitionMax,
  };
}

const result = runSimulation(config);
printSimulationReport(result);
