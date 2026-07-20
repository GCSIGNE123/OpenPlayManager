// The one real QualificationService implementation — see
// QualificationService.js for the shared interface this conforms to.
// Deliberately format-agnostic despite living next to the Round Robin
// engines: it never re-derives a ranking itself, it only asks the given
// `engine` for each pool's already-computed standings (engine.getStandings
// (tournament, poolId), the same call the Standings tab makes) and slices
// off the top N. Any future pooled format reuses this unchanged as long as
// its engine implements getStandings the same way.
//
// Pool Qualification Engine — see PROJECT.md. Qualification is finalized
// PER POOL, independent of sibling pools: a pool's own rows read
// "qualified"/"eliminated" the moment THAT pool completes, even while a
// sibling pool is still mid-match and reads "pending". The aggregate
// `qualifiedTeams`/`playoffSize` (what bracket generation actually
// consumes) still requires every pool done — a cross-pool bracket seed
// list isn't meaningful until every pool's numbers are final — so `ready`
// keeps its pre-existing meaning/contract for that one consumer
// (PlayoffBracketGenerator.generateBracket), unchanged.
import { QualificationService } from "./QualificationService.js";
import { exactStageName } from "./playoffStages.js";
import { defaultRoundRobinComparator } from "./RoundRobinStandingsService.js";

export class PoolQualificationService extends QualificationService {
  // "A pool is considered complete only when every scheduled match has
  // been completed" — reuses the pool's own `status` field (already
  // computed by lib/tournamentModel.js's computePoolStatus off real match
  // statuses; not re-derived here) rather than re-walking matches itself.
  isPoolComplete(pool) {
    return pool.status === "completed";
  }

  // standings: StandingsRow[] (from engine.getStandings — ranking/tie-break
  // logic lives there, never duplicated here). Returns the same rows with
  // a qualificationStatus tag: "pending" whenever the pool itself isn't
  // done yet (a provisional "top N" could still change), otherwise
  // "qualified"/"eliminated" by rank vs. qualifiersPerPool.
  getQualificationStatus(pool, standings, qualifiersPerPool) {
    if (!this.isPoolComplete(pool)) {
      return standings.map((row) => ({ ...row, qualificationStatus: "pending", qualified: false }));
    }
    return standings.map((row) => {
      const qualified = row.rank <= qualifiersPerPool;
      return { ...row, qualificationStatus: qualified ? "qualified" : "eliminated", qualified };
    });
  }

  // Every row across every pool currently marked qualified BY ANY METHOD
  // (standard, Wild Card, or Best Third Place — `qualified` is the boolean
  // every one of those tags sets, `qualificationStatus` is only the
  // human-readable label distinguishing which) — real (finalized) results
  // only, since a pool still "pending" never produces a qualified row in
  // the first place.
  getQualifiedParticipants(tournament, engine) {
    return this.determineQualifiers(tournament, engine).pools.flatMap((p) => p.rows.filter((r) => r.qualified));
  }

  getEliminatedParticipants(tournament, engine) {
    return this.determineQualifiers(tournament, engine).pools.flatMap((p) => p.rows.filter((r) => r.qualificationStatus === "eliminated"));
  }

  // Validates a proposed qualifiers-per-pool value against the tournament's
  // actual pools — reused at both tournament creation (buildAndSave
  // RoundRobinTournament) and Settings-update time (TournamentRulesService),
  // rather than each call site re-deriving these same two rules.
  //
  // qualificationOptions: { method, wildCardCount, bestThirdPlaceCount } —
  // Advanced Qualification's extra rules, only checked when method isn't
  // "standard". "Remaining participants" for the Wild Card check is every
  // entrant across every pool minus the automatic qualifiers
  // (qualifiersPerPool * pools.length) — the same number
  // determineWildCards' candidate pool will actually draw from once pools
  // are complete.
  validateQualifiers(pools, qualifiersPerPool, playoffEnabled = true, qualificationOptions = {}) {
    if (playoffEnabled && !(qualifiersPerPool >= 1)) {
      throw new Error("At least one qualifier per pool is required when playoffs are enabled.");
    }
    const smallestPool = Math.min(...pools.map((p) => p.entrants.length));
    if (qualifiersPerPool > smallestPool) {
      throw new Error(`Qualifiers Per Pool (${qualifiersPerPool}) can't exceed the smallest pool's size (${smallestPool}).`);
    }
    const { method = "standard", wildCardCount = 0, bestThirdPlaceCount = 0 } = qualificationOptions;
    if (method === "wildCard") {
      const totalEntrants = pools.reduce((sum, p) => sum + p.entrants.length, 0);
      const remaining = totalEntrants - qualifiersPerPool * pools.length;
      if (wildCardCount > remaining) {
        throw new Error(`Wild Card Count (${wildCardCount}) can't exceed the number of remaining (non-automatically-qualified) participants (${remaining}).`);
      }
    }
    if (method === "bestThirdPlace" && bestThirdPlaceCount > pools.length) {
      throw new Error(`Best Third Place Count (${bestThirdPlaceCount}) can't exceed the number of pools (${pools.length}) — there's only one 3rd-place finisher per pool.`);
    }
  }

  getQualificationMethod(tournament) {
    return tournament.qualificationMethod ?? "standard";
  }

  // Wild Card Qualification — see PROJECT.md. Candidates are every pool's
  // currently-"eliminated" rows (ANY rank, not just 3rd), ranked against
  // each other across pools using the exact same tie-breaker comparator
  // Standings already uses — never re-derived here. Returns the top
  // `wildCardCount` of them, tagged qualificationStatus: "wildCard".
  determineWildCards(pools, wildCardCount) {
    if (!(wildCardCount > 0)) return [];
    const candidates = pools.flatMap((p) => p.rows.filter((r) => r.qualificationStatus === "eliminated"));
    return [...candidates]
      .sort(defaultRoundRobinComparator)
      .slice(0, wildCardCount)
      .map((r) => ({ ...r, qualificationStatus: "wildCard", qualified: true }));
  }

  // Best Third Place — see PROJECT.md. Candidates are ONLY each pool's
  // rank-3 row (not any eliminated rank, unlike Wild Cards), and only if
  // it's currently "eliminated" — when advancesPerPool >= 3, a pool's own
  // 3rd place is already an automatic qualifier, so it's correctly not a
  // candidate here at all. Ranked the same cross-pool way Wild Cards are.
  determineBestThirdPlace(pools, bestThirdPlaceCount) {
    if (!(bestThirdPlaceCount > 0)) return [];
    const candidates = pools
      .map((p) => p.rows.find((r) => r.rank === 3 && r.qualificationStatus === "eliminated"))
      .filter(Boolean);
    return [...candidates]
      .sort(defaultRoundRobinComparator)
      .slice(0, bestThirdPlaceCount)
      .map((r) => ({ ...r, qualificationStatus: "bestThirdPlace", qualified: true }));
  }

  // Overlays extraQualifiers (from determineWildCards/determineBestThirdPlace)
  // back onto their pool's own row, by participantId — what makes the
  // per-pool Qualification tab table (which reads pool.rows directly, not
  // the flattened qualifiedTeams list) show ⭐ Wild Card/Best Third Place
  // instead of the plain 🔴 Eliminated the standard slicing already gave
  // that row. A no-op (returns pools unchanged) when there's nothing extra
  // to merge — the standard-qualification path this always was.
  mergeQualifiedParticipants(pools, extraQualifiers) {
    if (extraQualifiers.length === 0) return pools;
    const extraByParticipant = new Map(extraQualifiers.map((r) => [r.participantId, r]));
    return pools.map((p) => ({
      ...p,
      rows: p.rows.map((r) => (extraByParticipant.has(r.participantId) ? extraByParticipant.get(r.participantId) : r)),
    }));
  }

  // Defensive invariant check — by construction (determineWildCards/
  // determineBestThirdPlace only ever draw from rows already tagged
  // "eliminated") no participant can ever qualify by more than one method,
  // but this is the real, callable check the spec's Validation section
  // asks for rather than trusting that invariant silently.
  validateQualificationResult(qualifiedTeams) {
    const ids = qualifiedTeams.map((t) => t.participantId);
    const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    return { valid: duplicates.length === 0, errors: duplicates.length > 0 ? [`Participant(s) qualified by more than one method: ${duplicates.join(", ")}.`] : [] };
  }

  // The full picture: every pool's own standings+status, plus the
  // aggregate cross-pool qualifiedTeams list (only populated once every
  // pool is complete — see file header). `ready` is that same "all pools
  // done" flag, kept under its pre-existing name for
  // PlayoffBracketGenerator's existing `!qualification.ready`
  // check.
  determineQualifiers(tournament, engine) {
    const qualifiersPerPool = tournament.advancesPerPool ?? 1;
    let pools = tournament.pools.map((pool) => {
      const standings = engine.getStandings(tournament, pool.id);
      const rows = this.getQualificationStatus(pool, standings, qualifiersPerPool);
      return { poolId: pool.id, poolLabel: pool.label, complete: this.isPoolComplete(pool), rows };
    });

    const ready = pools.every((p) => p.complete);

    // Advanced Qualification — see PROJECT.md. Extra qualifiers (Wild
    // Card/Best Third Place) only ever get computed once every pool is
    // genuinely done (same "ready" gate the standard slicing above
    // already respects) — a provisional cross-pool ranking while a
    // sibling pool is still mid-match wouldn't be meaningful.
    if (ready) {
      const method = this.getQualificationMethod(tournament);
      const extra =
        method === "wildCard"
          ? this.determineWildCards(pools, tournament.wildCardCount ?? 0)
          : method === "bestThirdPlace"
            ? this.determineBestThirdPlace(pools, tournament.bestThirdPlaceCount ?? 0)
            : [];
      pools = this.mergeQualifiedParticipants(pools, extra);
    }

    const qualifiedTeams = ready
      ? pools.flatMap((p) =>
          p.rows
            .filter((r) => r.qualified)
            .map((r) => ({
              poolId: p.poolId,
              poolLabel: p.poolLabel,
              rank: r.rank,
              participantId: r.participantId,
              label: r.label,
              qualificationType: r.qualificationStatus, // "qualified" | "wildCard" | "bestThirdPlace"
            }))
        )
      : [];

    return { ready, pools, qualifiedTeams, playoffSize: ready ? this.calculatePlayoffSize(qualifiedTeams.length) : null };
  }

  // Maps a qualifier count onto the bracket size it implies. Counts that
  // aren't one of the four called-out sizes still get a usable label
  // (a generic "N-Team Playoff") rather than nothing — Custom "teams
  // advancing" values won't always land on a power of two.
  calculatePlayoffSize(qualifiedCount) {
    return { count: qualifiedCount, stage: exactStageName(qualifiedCount) ?? `${qualifiedCount}-Team Playoff` };
  }

  getQualifiedTeams(tournament, engine) {
    return this.determineQualifiers(tournament, engine).qualifiedTeams;
  }
}
