// Tournament Settings — see PROJECT.md's Tournament Settings section.
// Deliberately NOT a data-migration: every field below already lives on
// the top-level Tournament record exactly where RoundRobinEngine,
// PoolQualificationService, CourtAssignmentService,
// PlayoffBracketGenerator, and TournamentScheduleView already
// read/write it. This module is a consolidated VIEW over those existing
// fields (deriveSettingsView) plus the shared defaults new tournaments and
// templates both draw from — the "one maintainable module" the task asks
// for is this + TournamentRulesService.js, not a storage-shape change.
//
// matchFormat/winningScore/winByTwo and playoff-stage overrides are
// captured for reference only, the same precedent Tournament Templates
// already set for matchScoringRules — nothing in this app enforces
// multi-game scoring or overrides bracket sizing yet. playoffEnabled is
// the one exception: it gates RoundRobinEngine's existing auto-generate-
// bracket step for real (see PROJECT.md).

export function defaultMatchScoringRules() {
  return { matchFormat: "oneGame", winningScore: 11, winByTwo: true }; // matchFormat: 'oneGame' | 'bestOf3' | 'bestOf5' (placeholder, no multi-game logic exists)
}

export const MATCH_FORMATS = [
  { value: "oneGame", label: "One Game" },
  { value: "bestOf3", label: "Best of 3" },
  { value: "bestOf5", label: "Best of 5 (placeholder)" },
];

// Membership Management's eligibility hook — see PROJECT.md. Captured on
// every tournament (default: guests allowed, no membership required) and
// editable here, but NOT enforced against the roster/join flow yet — the
// same "captured for reference, not enforced everywhere" precedent
// matchScoringRules already set. MembershipService.validateEligibility is
// the real, tested check; League Manager's player picker is the one place
// this task wires it into a live block — see PROJECT.md's Membership
// Management section for why Tournament stops at "captured."
export function defaultEligibilityRequirements() {
  return { requireActiveMembership: false, requiredPlanId: null, allowGuests: true };
}

// Manual & Advanced Seeding — see BracketSeeding.js for the actual
// strategy implementations these values select.
export const SEEDING_METHODS = [
  { value: "standardCrossPool", label: "Standard Cross-Pool (default)" },
  { value: "random", label: "Random" },
  { value: "snake", label: "Snake" },
  { value: "rating", label: "Rating-Based" },
  { value: "manual", label: "Manual" },
];

// Advanced Qualification — see PoolQualificationService.js for the actual
// determineWildCards()/determineBestThirdPlace() logic these values select.
export const QUALIFICATION_METHODS = [
  { value: "standard", label: "Standard" },
  { value: "wildCard", label: "Standard + Wild Cards" },
  { value: "bestThirdPlace", label: "Standard + Best Third Place" },
];

export const WILD_CARD_COUNTS = [1, 2, 4];

// Consolation & Placement Brackets — see PlacementBracketService.js. "Bronze
// Match Only" maps onto the existing, independent bronzeMatchEnabled toggle
// (this value doesn't change it either way — an organizer using Bronze Match
// Only already has that switched on separately); "Consolation Bracket" and
// "Full Placement Bracket" currently build the identical structure (5th-8th)
// since 9th-16th place isn't implemented yet — documented honestly rather
// than pretending they differ.
export const PLACEMENT_MATCHES_METHODS = [
  { value: "disabled", label: "Disabled (default)" },
  { value: "bronzeOnly", label: "Bronze Match Only" },
  { value: "consolationBracket", label: "Consolation Bracket (5th-8th)" },
  { value: "fullPlacement", label: "Full Placement Bracket (5th-8th, 9th-16th where applicable)" },
];

// Double Elimination Foundation — see DoubleEliminationEngine.js. Every
// value match.matchType can hold across this app — descriptive only, not
// read by any engine yet (a later progression sprint is what would branch
// on it).
export const MATCH_TYPES = [
  { value: "roundRobin", label: "Round Robin" },
  { value: "playoff", label: "Playoff" },
  { value: "winnersBracket", label: "Winners Bracket" },
  { value: "losersBracket", label: "Losers Bracket" },
  { value: "grandFinal", label: "Grand Final" },
];

// Double Elimination Foundation — see DoubleEliminationEngine.js. Picks
// which engine builds the PLAYOFF bracket once pool qualification finishes;
// pool play itself (tournament.format) is untouched either way.
export const BRACKET_FORMATS = [
  { value: "singleElimination", label: "Single Elimination (default)" },
  { value: "doubleElimination", label: "Double Elimination" },
];

export const PLAYOFF_STAGES = [
  { value: "roundOf16", label: "Round of 16" },
  { value: "quarterfinals", label: "Quarterfinals" },
  { value: "semifinals", label: "Semifinals" },
  { value: "championship", label: "Championship Match" },
];

// The consolidated read shape TournamentSettingsView renders — a plain
// pick/rename over the tournament record's own fields, not a copy that
// could drift out of sync (every value here IS the live tournament field).
export function deriveSettingsView(tournament) {
  return {
    name: tournament.name,
    mode: tournament.mode,
    format: tournament.format,
    courtsCount: tournament.courts.length,
    courts: tournament.courts,
    poolCount: tournament.poolCount,
    assignmentMethod: tournament.assignmentMethod,
    advancesPerPool: tournament.advancesPerPool,
    playoffEnabled: tournament.playoffEnabled ?? true,
    autoDetectPlayoffStage: tournament.autoDetectPlayoffStage ?? true,
    manualPlayoffStage: tournament.manualPlayoffStage ?? null,
    bronzeMatchEnabled: tournament.bronzeMatchEnabled ?? false,
    seedingMethod: tournament.seedingMethod ?? "standardCrossPool",
    qualificationMethod: tournament.qualificationMethod ?? "standard",
    wildCardCount: tournament.wildCardCount ?? 1,
    bestThirdPlaceCount: tournament.bestThirdPlaceCount ?? 1,
    allowManualQualificationOverride: tournament.allowManualQualificationOverride ?? false,
    placementMatches: tournament.placementMatches ?? "disabled",
    bracketFormat: tournament.bracketFormat ?? "singleElimination",
    matchScoringRules: tournament.matchScoringRules ?? defaultMatchScoringRules(),
    eligibilityRequirements: tournament.eligibilityRequirements ?? defaultEligibilityRequirements(),
  };
}
