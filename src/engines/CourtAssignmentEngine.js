// CourtAssignmentEngine — see PROJECT.md's Court Assignment & Match Queue
// Engine section. The orchestrator: composes the existing
// CourtAssignmentService (the mechanical court/match writes,
// unmodified — "reuse existing... Court Assignment Service") with the new
// CourtQueueService/CourtPriorityService (deciding WHAT should be assigned
// next) to add the one capability that didn't exist before this task:
// automatic assignment. Every method here either delegates straight to
// CourtAssignmentService or is genuinely new (autoAssign, swapCourts,
// delayMatch/undelayMatch, pinMatchToCourt/unpinMatch) — nothing
// duplicates CourtAssignmentService's own logic.
//
// Format-agnostic by construction, same as CourtAssignmentService itself:
// every method takes a plain `{ courts, pools, bracket }`-shaped record —
// a Tournament or a LeagueSeason (which is Tournament-shaped, see
// lib/leagueModel.js) both already work today with zero changes here.
// Open Play's own court/rotation system is a structurally different shape
// (state.courts holds teams directly, no separate match records with
// round numbers) and is deliberately NOT rewired onto this engine by this
// task — see PROJECT.md for what a future Open Play adapter would need.
import { CourtAssignmentService } from "./CourtAssignmentService.js";
import { CourtQueueService } from "./CourtQueueService.js";

const courtAssignmentService = new CourtAssignmentService();
const courtQueueService = new CourtQueueService();

function updateMatchOverride(tournament, matchId, overrideChanges) {
  const pools = (tournament.pools || []).map((pool) => ({
    ...pool,
    rounds: pool.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((m) =>
        m.id === matchId
          ? { ...m, queueOverride: { pinnedCourt: null, delayed: false, ...m.queueOverride, ...overrideChanges } }
          : m
      ),
    })),
  }));
  const bracket = tournament.bracket
    ? {
        ...tournament.bracket,
        rounds: tournament.bracket.rounds.map((round) => ({
          ...round,
          matches: round.matches.map((m) =>
            m.id === matchId
              ? { ...m, queueOverride: { pinnedCourt: null, delayed: false, ...m.queueOverride, ...overrideChanges } }
              : m
          ),
        })),
      }
    : tournament.bracket;
  return { ...tournament, pools, bracket };
}

export class CourtAssignmentEngine {
  // ---- Delegates straight to CourtAssignmentService — no new logic ----
  assignCourt(tournament, matchId, courtNumber) {
    return courtAssignmentService.assignMatchToCourt(tournament, matchId, courtNumber);
  }

  releaseCourt(tournament, courtNumber) {
    return courtAssignmentService.releaseCourt(tournament, courtNumber);
  }

  getNextMatch(tournament, options) {
    return courtQueueService.getNextMatch(tournament, options);
  }

  // ---- Genuinely new: automatic assignment ----
  // "When a court becomes available, automatically assign the highest-
  // priority eligible match." Only ever called with a court that's
  // actually free (not maintenance/disabled/occupied) — a no-op (returns
  // the tournament unchanged) if there's nothing eligible to assign it, or
  // the court isn't actually available right now.
  autoAssign(tournament, courtNumber) {
    const court = (tournament.courts || []).find((c) => c.number === courtNumber);
    if (!court || court.status === "maintenance" || court.status === "disabled") return tournament;
    const available = courtAssignmentService.getAvailableCourts(tournament).some((c) => c.number === courtNumber);
    if (!available) return tournament;

    const next = courtQueueService.getNextMatch(tournament, { forCourtNumber: courtNumber });
    if (!next) return tournament;
    return courtAssignmentService.assignMatchToCourt(tournament, next.match.id, courtNumber);
  }

  // Convenience: release a court, then immediately try to auto-fill it —
  // "release and refill" as one action, the common case a Tournament
  // Director actually wants from a manual Release click.
  releaseAndAutoFill(tournament, courtNumber) {
    const released = courtAssignmentService.releaseCourt(tournament, courtNumber);
    return this.autoAssign(released, courtNumber);
  }

  // ---- Genuinely new: manual override ----
  // Exchanges the two courts' current matches — release both, then
  // reassign each match to the other's court, all on the same in-memory
  // tournament before returning (avoids the two-call race
  // saveCourtReassignment's own header comment already warns about).
  // Throws if either court has no current match — "swap" only makes sense
  // between two occupied courts; use reassign (already existing) to move a
  // single match onto an empty court.
  swapCourts(tournament, courtNumberA, courtNumberB) {
    const { courts } = courtAssignmentService.refreshQueue(tournament);
    const matchA = courts.find((c) => c.number === courtNumberA)?.currentMatch;
    const matchB = courts.find((c) => c.number === courtNumberB)?.currentMatch;
    if (!matchA || !matchB) throw new Error("Both courts must have a current match to swap.");

    let next = courtAssignmentService.releaseCourt(tournament, courtNumberA);
    next = courtAssignmentService.releaseCourt(next, courtNumberB);
    next = courtAssignmentService.assignMatchToCourt(next, matchA.id, courtNumberB);
    next = courtAssignmentService.assignMatchToCourt(next, matchB.id, courtNumberA);
    return next;
  }

  // Delaying a match deprioritizes it out of the auto-assignment queue
  // (see CourtQueueService.getEligibleMatches) without touching its
  // status/court — it's still fully visible in the Match Queue UI, just
  // marked and skipped by autoAssign until undelayed.
  delayMatch(tournament, matchId) {
    return updateMatchOverride(tournament, matchId, { delayed: true });
  }

  undelayMatch(tournament, matchId) {
    return updateMatchOverride(tournament, matchId, { delayed: false });
  }

  // Pinning a match to a court is a preference for autoAssign, not an
  // immediate action — it doesn't assign the match itself (use assignCourt
  // for that); it just makes autoAssign(tournament, courtNumber) prefer
  // this match once that specific court frees up, and refuse to place it
  // on any other court automatically.
  pinMatchToCourt(tournament, matchId, courtNumber) {
    return updateMatchOverride(tournament, matchId, { pinnedCourt: courtNumber });
  }

  unpinMatch(tournament, matchId) {
    return updateMatchOverride(tournament, matchId, { pinnedCourt: null });
  }
}
