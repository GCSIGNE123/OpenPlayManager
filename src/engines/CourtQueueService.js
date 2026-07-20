// CourtQueueService — see PROJECT.md's Court Assignment & Match Queue
// Engine section. Builds the live, ordered Match Queue: eligible matches,
// sorted by CourtPriorityService, enriched with Queue Position/Match Type/
// Priority/Estimated Wait. Pure derived data, same "recomputed fresh every
// call, nothing cached" pattern CourtAssignmentService.refreshQueue already
// uses — there's nothing here to keep in sync.
import { collectMatches } from "./CourtAssignmentService.js";
import { CourtPriorityService } from "./CourtPriorityService.js";

const priorityService = new CourtPriorityService();

// A rough, clearly-labeled estimate, not a data-driven one — this app has
// never tracked how long a real match actually takes (see PROJECT.md's
// Tournament Reports/Game History sections, which both already flagged the
// same gap: only completedAt is recorded, never a match's real duration).
// Rather than fake precision, every wait/finish estimate here is built from
// one assumed constant. Genuinely improvable later once match.startedAt
// (new this task) has accumulated enough real completed-match history to
// compute an actual average.
export const ASSUMED_MATCH_DURATION_MINUTES = 20;

const PRIORITY_LABELS = { 1: "Finals", 2: "Semifinals", 3: "Quarterfinals", 4: "Pool Match" };

export class CourtQueueService {
  // Eligibility, per spec: both participants ready (teamA/teamB known),
  // prerequisite matches complete (a bracket match's teams stay null until
  // PlayoffEngine.advanceWinner fills them in, so this is already
  // satisfied structurally — nothing extra to check), court is available
  // (not yet assigned one, court === null), and not manually delayed.
  // Excludes a match pinned to a DIFFERENT court than the one being asked
  // about — see CourtAssignmentEngine.autoAssign, the only caller that
  // passes `forCourtNumber`.
  getEligibleMatches(tournament, { forCourtNumber = null } = {}) {
    return collectMatches(tournament).filter((entry) => {
      const m = entry.match;
      if (m.status !== "pending" || !m.teamA || !m.teamB || m.court !== null) return false;
      if (m.queueOverride?.delayed) return false;
      const pinnedCourt = m.queueOverride?.pinnedCourt;
      if (pinnedCourt != null && forCourtNumber != null && pinnedCourt !== forCourtNumber) return false;
      return true;
    });
  }

  // The full, ordered, enriched queue — what the Match Queue UI renders
  // directly. Each row: { match, source, sourceLabel, queuePosition (1-
  // indexed), matchType (display label), priority (tier number, 1
  // highest), estimatedWaitMinutes }.
  getQueue(tournament) {
    const availableCourtsCount = Math.max(
      1,
      (tournament.courts || []).filter((c) => c.status !== "maintenance" && c.status !== "disabled").length
    );
    const sorted = [...this.getEligibleMatches(tournament)].sort((a, b) => priorityService.compare(a, b, tournament));
    return sorted.map((entry, i) => {
      const priority = priorityService.calculatePriority(entry);
      return {
        ...entry,
        queuePosition: i + 1,
        matchType: PRIORITY_LABELS[priority] ?? entry.sourceLabel,
        priority,
        estimatedWaitMinutes: this.estimateWaitTime(i + 1, availableCourtsCount),
      };
    });
  }

  // The highest-priority eligible match overall, or (when forCourtNumber
  // is given) the highest-priority match eligible for that specific court —
  // what CourtAssignmentEngine.autoAssign actually assigns.
  getNextMatch(tournament, { forCourtNumber = null } = {}) {
    const eligible = this.getEligibleMatches(tournament, { forCourtNumber });
    if (eligible.length === 0) return null;
    return [...eligible].sort((a, b) => priorityService.compare(a, b, tournament))[0];
  }

  // queuePosition: 1-indexed position in the sorted queue.
  // availableCourtsCount: how many courts could plausibly take the next
  // match (already filtered to not maintenance/disabled) — the queue
  // "drains" that many matches per assumed match length.
  // Documented, simple estimate (see ASSUMED_MATCH_DURATION_MINUTES above)
  // — not a promise of real-world accuracy.
  estimateWaitTime(queuePosition, availableCourtsCount) {
    const roundsAhead = Math.ceil(queuePosition / Math.max(1, availableCourtsCount));
    return roundsAhead * ASSUMED_MATCH_DURATION_MINUTES;
  }
}
