// CourtPriorityService — see PROJECT.md's Court Assignment & Match Queue
// Engine section. Decides queue order only; it never touches a match or
// court record itself (that stays CourtAssignmentService's/
// CourtAssignmentEngine's job).
//
// Priority tiers, exactly as spec'd: 1 Finals, 2 Semifinals, 3
// Quarterfinals, 4 Pool Matches. A bracket round earlier than Quarterfinals
// (e.g. "Round of 16" in a 16-team bracket) has no named tier in the spec —
// it's still a playoff round, so it's given tier 3 alongside Quarterfinals
// rather than inventing a 5th tier this task doesn't ask for.
const ROUND_NAME_PRIORITY = {
  "Championship Match": 1,
  Semifinals: 2,
  Quarterfinals: 3,
};
const POOL_PRIORITY = 4;
const DEFAULT_BRACKET_PRIORITY = 3; // any bracket round without an exact name match above (e.g. "Round of 16")

export class CourtPriorityService {
  // entry: { match, source: "pool"|"bracket", sourceLabel } — see
  // CourtAssignmentService.collectMatches, the shape every consumer of this
  // service already has in hand.
  calculatePriority(entry) {
    if (entry.source === "pool") return POOL_PRIORITY;
    return ROUND_NAME_PRIORITY[entry.sourceLabel] ?? DEFAULT_BRACKET_PRIORITY;
  }

  // "Longest waiting match first" within the same priority tier — the
  // timestamp a match actually BECAME playable, derived entirely from
  // existing fields (no new storage):
  //   - a pool match becomes playable the moment the schedule is generated,
  //     so every pool match in a tournament shares tournament.createdAt.
  //   - a bracket match becomes playable once both its feeder matches (the
  //     previous round's matches at 2*matchNumber-1 and 2*matchNumber)
  //     have a result — its waiting-since is the LATER of those two
  //     completedAt timestamps, since both slots must be filled before
  //     it's actually playable.
  //   - a bracket round 1 match's teams come from qualification, not a
  //     feeder match — it becomes playable the moment pool play finishes,
  //     approximated as the latest pool completedAt.
  //   - anything undeterminable (shouldn't happen for a real playable
  //     match) falls back to tournament.createdAt so sorting still behaves.
  getWaitingSince(entry, tournament) {
    if (entry.source === "pool") return tournament.createdAt;

    const bracket = tournament.bracket;
    const roundIndex = bracket.rounds.findIndex((r) => r.matches.some((m) => m.id === entry.match.id));
    if (roundIndex === 0) {
      const poolCompletions = tournament.pools.map((p) => p.completedAt).filter(Boolean);
      return poolCompletions.length ? Math.max(...poolCompletions) : tournament.createdAt;
    }
    if (roundIndex > 0) {
      const feederRound = bracket.rounds[roundIndex - 1];
      const n = entry.match.matchNumber;
      const feeders = feederRound.matches.filter((m) => m.matchNumber === 2 * n - 1 || m.matchNumber === 2 * n);
      const completions = feeders.map((m) => m.completedAt).filter(Boolean);
      if (completions.length) return Math.max(...completions);
    }
    return tournament.createdAt;
  }

  // Sort comparator: priority tier ascending (1 = highest priority first),
  // then waiting-since ascending (oldest/longest-waiting first) within the
  // same tier. Manual override (delay/pin) is applied by
  // CourtAssignmentEngine/CourtQueueService before or after this sort, not
  // inside it — this comparator only ever expresses the two rules the spec
  // actually names here.
  compare(entryA, entryB, tournament) {
    // Next Match (facilitator announcement) — see lib/tournament.js's
    // saveSetNextMatch. Originally a pure display/announcement flag with no
    // effect on the real queue, but once it was exposed right next to
    // Pin/Delay in the Courts tab's Match Queue, organizers reasonably
    // expect it to actually go next — so it now also outranks every
    // priority tier here (finals/pool/etc.) the same way a pin overrides
    // eligibility. Still just a queue-ordering nudge: it does nothing if
    // the match is delayed or pinned to a different court (those checks
    // happen upstream in CourtQueueService.getEligibleMatches, unchanged).
    if (tournament?.nextMatchId != null) {
      if (entryA.match.id === tournament.nextMatchId) return -1;
      if (entryB.match.id === tournament.nextMatchId) return 1;
    }
    const priorityDiff = this.calculatePriority(entryA) - this.calculatePriority(entryB);
    if (priorityDiff !== 0) return priorityDiff;
    return this.getWaitingSince(entryA, tournament) - this.getWaitingSince(entryB, tournament);
  }
}
