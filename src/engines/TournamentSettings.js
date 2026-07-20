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
    matchScoringRules: tournament.matchScoringRules ?? defaultMatchScoringRules(),
    eligibilityRequirements: tournament.eligibilityRequirements ?? defaultEligibilityRequirements(),
  };
}
